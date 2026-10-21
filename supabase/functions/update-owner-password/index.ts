// DEPLOY: supabase functions deploy update-owner-password
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
    const { org_id, new_password } = await req.json()

    if (!org_id || !new_password) {
      return respond({ error: 'Campos obrigatórios ausentes (org_id, new_password).' })
    }
    if (new_password.length < 6) {
      return respond({ error: 'A senha deve ter pelo menos 6 caracteres.' })
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

    // Apenas superadmin pode redefinir senha do dono
    const { data: cp } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!cp || cp.role !== 'superadmin') {
      return respond({ error: 'Apenas o SuperAdmin pode redefinir a senha do dono da organização.' })
    }
    if (jwtAal(jwt) !== 'aal2') return respond({ error: MFA_ERROR })

    // Encontrar o dono: primeiro admin criado nessa org (created_at ASC garante o original)
    const { data: ownerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('id')
      .eq('org_id', org_id)
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (profileErr || !ownerProfile) {
      return respond({ error: 'Dono da organização não encontrado. Verifique se o login foi criado.' })
    }

    // Atualizar senha no Supabase Auth — updateUserById retorna o usuário atualizado com o email
    const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(
      ownerProfile.id,
      { password: new_password },
    )

    if (updateErr) return respond({ error: updateErr.message })

    return respond({ success: true, email: updated.user.email ?? '' })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
