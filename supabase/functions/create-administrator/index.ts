// DEPLOY: supabase functions deploy create-administrator
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
    const { name, email, profile, redirectTo } = await req.json()

    if (!name || !email || !profile) {
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

    // Verificar se o chamador é superadmin
    const { data: cp } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!cp || cp.role !== 'superadmin') {
      return respond({ error: 'Apenas superadministradores podem criar administradores.' })
    }

    // Convidar usuário por e-mail (a pessoa define a própria senha no primeiro acesso)
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: name.trim() },
    })

    if (inviteErr) {
      const msg = inviteErr.message.includes('already registered') || inviteErr.message.includes('already exists')
        ? 'Este e-mail já possui uma conta no sistema.'
        : inviteErr.message
      return respond({ error: msg })
    }

    // Upsert no profiles (cobre casos com ou sem trigger)
    const { error: profileErr } = await admin.from('profiles').upsert({
      id:            invited.user.id,
      role:          'superadmin',
      full_name:     name.trim(),
      access_status: 'ativo',
    })

    if (profileErr) {
      // Usuário criado mas profile falhou — limpar para evitar estado inconsistente
      await admin.auth.admin.deleteUser(invited.user.id)
      return respond({ error: 'Erro ao criar perfil: ' + profileErr.message })
    }

    // Mantém o registro em saas_administrators, ainda referenciado por policy de RLS em profiles
    const { error: adminErr } = await admin.from('saas_administrators').upsert(
      { name: name.trim(), email, profile },
      { onConflict: 'email' },
    )

    if (adminErr) {
      await admin.auth.admin.deleteUser(invited.user.id)
      return respond({ error: 'Erro ao registrar administrador: ' + adminErr.message })
    }

    return respond({ success: true, email })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
