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

// Nível de autenticação (aal1/aal2) do token de quem chama. O token já foi
// validado por admin.auth.getUser antes de chegar aqui. Superadmin só age
// com o autenticador confirmado nesta sessão (aal2).
function jwtAal(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))
    return JSON.parse(json).aal ?? null
  } catch {
    return null
  }
}
const MFA_ERROR = 'Confirme o código do autenticador para continuar.'

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
    if (jwtAal(jwt) !== 'aal2') return respond({ error: MFA_ERROR })

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

    // Mantém o cadastro em saas_administrators (lista de administradores da
    // plataforma; a permissão de verdade vem de profiles.role + MFA no banco)
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
