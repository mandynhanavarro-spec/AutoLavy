// DEPLOY: supabase functions deploy create-owner
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { full_name, email, password, org_id } = await req.json()

    if (!full_name || !email || !password || !org_id) {
      return respond({ error: 'Campos obrigatórios ausentes (full_name, email, password, org_id).' })
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

    // Apenas superadmin pode criar donos de organização
    const { data: cp } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!cp || cp.role !== 'superadmin') {
      return respond({ error: 'Apenas o SuperAdmin pode criar o acesso do dono da organização.' })
    }

    // Criar usuário no Supabase Auth com confirmação de e-mail automática
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    })

    if (createErr) {
      const isAlreadyExists =
        createErr.message.toLowerCase().includes('already registered') ||
        createErr.message.toLowerCase().includes('already exists') ||
        createErr.message.toLowerCase().includes('already been registered')
      const msg = isAlreadyExists
        ? `Este e-mail já possui uma conta cadastrada. Verifique e tente outro endereço.`
        : createErr.message
      return respond({ error: msg })
    }

    // Upsert no profiles — role 'admin' é o papel de dono dentro da organização
    const { error: profileErr } = await admin.from('profiles').upsert({
      id:            created.user.id,
      org_id,
      full_name:     full_name.trim(),
      role:          'admin',
      access_status: 'ativo',
    })

    if (profileErr) {
      // Profile falhou — remover auth user para evitar estado inconsistente
      await admin.auth.admin.deleteUser(created.user.id)
      return respond({ error: 'Erro ao criar perfil do dono: ' + profileErr.message })
    }

    return respond({ success: true, email: email.trim().toLowerCase(), userId: created.user.id })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
