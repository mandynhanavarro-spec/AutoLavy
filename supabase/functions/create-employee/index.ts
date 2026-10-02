// DEPLOY: supabase functions deploy create-employee
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pela plataforma Supabase.
//
// Formato do e-mail (outubro/2026): <login>@<slug-da-org>.local -- ver
// src/shared/lib/employeeEmail.js para o raciocínio completo (slug é único
// por org; .local é TLD reservado, nunca entrega e-mail de verdade). Antes
// o domínio vinha do NOME da loja + .com, o que causava colisão entre lojas
// homônimas e risco de e-mails de sistema irem pra um domínio real de
// terceiros.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function normalizeDomain(name: string): string {
  return (name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function isEmailCollisionError(message: string): boolean {
  const m = (message || '').toLowerCase()
  return m.includes('already registered') || m.includes('already exists') || m.includes('already been registered')
}

// Tenta criar o usuario com <baseLocal>@<domain>, e se colidir (outro
// funcionario da MESMA org ja usa esse login), tenta <baseLocal>2@<domain>,
// <baseLocal>3@<domain>... ate achar um livre. Usa o proprio createUser como
// checagem de unicidade (fonte da verdade e o Supabase Auth, nao uma busca
// paralela que poderia ficar dessincronizada).
async function createUserWithUniqueEmail(
  admin: ReturnType<typeof createClient>,
  baseLocal: string,
  domain: string,
  password: string,
  fullName: string,
) {
  const MAX_ATTEMPTS = 30
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = i === 0 ? `${baseLocal}@${domain}` : `${baseLocal}${i + 1}@${domain}`
    const { data, error } = await admin.auth.admin.createUser({
      email: candidate,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (!error) return { data, email: candidate, error: null as string | null }
    if (!isEmailCollisionError(error.message)) return { data: null, email: candidate, error: error.message }
    // colidiu com outro funcionario desta org -- tenta o proximo sufixo
  }
  return { data: null, email: null, error: 'Não foi possível gerar um login único para este funcionário (muitas colisões). Tente outro login.' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const rawBody = await req.json()

    // Aceita os nomes enviados pelo frontend: { full_name, email, role, password, org_id }
    const { full_name, email, role, password, org_id } = rawBody
    const name   = full_name
    const handle = email
    const orgId  = org_id

    if (!name || !handle || !role || !password || !orgId) {
      return respond({ error: 'Campos obrigatórios ausentes.' })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Verificar JWT do chamador
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return respond({ error: 'Não autorizado.' })

    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (!caller) return respond({ error: 'Token inválido.' })

    // Verificar se o chamador é admin desta org
    const { data: cp } = await admin
      .from('profiles')
      .select('role, org_id')
      .eq('id', caller.id)
      .single()

    if (!cp || !['admin', 'superadmin'].includes(cp.role)) {
      return respond({ error: 'Apenas administradores podem criar funcionários.' })
    }
    if (cp.role !== 'superadmin' && cp.org_id !== orgId) {
      return respond({ error: 'Acesso negado a esta organização.' })
    }

    // Busca o slug da org -- e a base do dominio ficticio, sempre unico
    // (ja carrega sufixo quando ha conflito de nome no cadastro da loja).
    const { data: org } = await admin
      .from('organizations')
      .select('slug')
      .eq('id', orgId)
      .single()

    if (!org?.slug) {
      return respond({ error: 'Organização não encontrada ou sem slug definido.' })
    }

    // Se o handle ja e um email completo (contem @), usa direto. Caso
    // contrario, monta <login>@<slug-da-org>.local, resolvendo colisao de
    // login dentro da mesma org automaticamente (ana -> ana2 -> ana3...).
    let created, authEmail: string | null, createErrMsg: string | null
    if (handle.includes('@')) {
      authEmail = handle
      const result = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: name.trim() },
      })
      created = result.data
      createErrMsg = result.error?.message ?? null
    } else {
      const baseLocal = normalizeDomain(handle) || 'usuario'
      const domain = `${org.slug}.local`
      const result = await createUserWithUniqueEmail(admin, baseLocal, domain, password, name.trim())
      created = result.data
      authEmail = result.email
      createErrMsg = result.error
    }

    if (createErrMsg) {
      const msg = isEmailCollisionError(createErrMsg)
        ? `O e-mail "${authEmail}" já está em uso.`
        : createErrMsg
      return respond({ error: msg })
    }

    // Upsert no profiles (cobre casos com ou sem trigger)
    const { error: profileErr } = await admin.from('profiles').upsert({
      id:            created!.user.id,
      org_id:        orgId,
      full_name:     name.trim(),
      role,
      access_status: 'ativo',
    })

    if (profileErr) {
      // Usuário criado mas profile falhou — limpar para evitar estado inconsistente
      await admin.auth.admin.deleteUser(created!.user.id)
      return respond({ error: 'Erro ao criar perfil: ' + profileErr.message })
    }

    return respond({ success: true, email: authEmail, userId: created!.user.id })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
