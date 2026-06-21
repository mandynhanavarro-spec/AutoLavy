// DEPLOY: supabase functions deploy create-employee
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pela plataforma Supabase.

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
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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

    // Buscar nome da org para montar o domínio fictício limpo
    const { data: org } = await admin
      .from('organizations')
      .select('slug, name')
      .eq('id', orgId)
      .single()

    // Se o handle já é um email completo (contém @), usa direto;
    // caso contrário gera email fictício: handle@nome-normalizado.com
    const authEmail = handle.includes('@')
      ? handle
      : `${handle}@${normalizeDomain(org?.name ?? 'empresa')}.com`

    // Criar usuário no Supabase Auth
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim() },
    })

    if (createErr) {
      const msg = createErr.message.includes('already registered') || createErr.message.includes('already exists')
        ? `O e-mail "${authEmail}" já está em uso.`
        : createErr.message
      return respond({ error: msg })
    }

    // Upsert no profiles (cobre casos com ou sem trigger)
    const { error: profileErr } = await admin.from('profiles').upsert({
      id:            created.user.id,
      org_id:        orgId,
      full_name:     name.trim(),
      role,
      access_status: 'ativo',
    })

    if (profileErr) {
      // Usuário criado mas profile falhou — limpar para evitar estado inconsistente
      await admin.auth.admin.deleteUser(created.user.id)
      return respond({ error: 'Erro ao criar perfil: ' + profileErr.message })
    }

    return respond({ success: true, email: authEmail, userId: created.user.id })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
