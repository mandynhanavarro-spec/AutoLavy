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

// Cargos que o dono pode dar. 'admin' existe de propósito (loja com 2
// sócios); 'superadmin' é da plataforma e nunca sai daqui -- o banco também
// barra superadmin com loja (trigger profiles_guard).
const EMPLOYEE_ROLES = ['operador', 'gerente', 'admin']

// Permissões extras aceitas no cadastro (mesmas chaves de usePermissions).
const PERM_KEYS = [
  'can_open_cash', 'can_do_sangria', 'can_void_sale', 'can_edit_stock',
  'can_manage_products', 'can_view_reports', 'can_close_cash', 'can_edit_prices',
]

// Nível de autenticação (aal1/aal2) do token de quem chama. O token já foi
// validado por admin.auth.getUser antes de chegar aqui.
function jwtAal(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))
    return JSON.parse(json).aal ?? null
  } catch {
    return null
  }
}

function sanitizePermissions(raw: unknown): Record<string, boolean> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, boolean> = {}
  for (const k of PERM_KEYS) {
    if (k in (raw as Record<string, unknown>)) out[k] = (raw as Record<string, unknown>)[k] === true
  }
  return out
}

function normalizeDomain(name: string): string {
  return (name || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
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

    // Aceita os nomes enviados pelo frontend:
    // { full_name, email, role, password, org_id, permissions?, template_id? }
    const { full_name, email, role, password, org_id, permissions, template_id } = rawBody
    const name   = full_name
    const handle = email

    if (!name || !handle || !role || !password) {
      return respond({ error: 'Campos obrigatórios ausentes.' })
    }
    if (!EMPLOYEE_ROLES.includes(role)) {
      return respond({ error: 'Cargo inválido. Escolha Operador, Gerente ou Admin.' })
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

    // Chamador: admin ATIVO de uma loja, ou superadmin ATIVO
    const { data: cp } = await admin
      .from('profiles')
      .select('role, org_id, access_status')
      .eq('id', caller.id)
      .single()

    if (!cp || !['admin', 'superadmin'].includes(cp.role) || cp.access_status !== 'ativo') {
      return respond({ error: 'Apenas o administrador da loja pode criar funcionários.' })
    }
    // superadmin só age com o autenticador confirmado nesta sessão (aal2)
    if (cp.role === 'superadmin' && jwtAal(jwt) !== 'aal2') {
      return respond({ error: 'Confirme o código do autenticador para continuar.' })
    }

    // Admin: a loja vem SEMPRE do perfil dele, nunca do corpo do pedido.
    // Superadmin (Com Implementação / suporte): não tem loja no perfil, então
    // informa a loja no corpo -- validada abaixo (precisa existir).
    let orgId: string
    if (cp.role === 'admin') {
      if (!cp.org_id) return respond({ error: 'Acesso negado a esta organização.' })
      if (org_id && org_id !== cp.org_id) return respond({ error: 'Acesso negado a esta organização.' })
      orgId = cp.org_id
    } else {
      if (!org_id) return respond({ error: 'Campos obrigatórios ausentes.' })
      orgId = org_id
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

    // Modelo de cargo: global (org_id nulo) ou da própria loja
    let templateId: string | null = null
    if (template_id) {
      const { data: tpl } = await admin
        .from('role_templates')
        .select('id, org_id')
        .eq('id', template_id)
        .single()
      if (!tpl || (tpl.org_id && tpl.org_id !== orgId)) {
        return respond({ error: 'Modelo de cargo inválido.' })
      }
      templateId = tpl.id
    }
    const cleanPermissions = sanitizePermissions(permissions)

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
      ...(cleanPermissions ? { permissions: cleanPermissions } : {}),
      ...(templateId ? { template_id: templateId } : {}),
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
