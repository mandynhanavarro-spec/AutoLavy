// DEPLOY: supabase functions deploy reset-employee-password
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
    const { memberId, password } = await req.json()

    if (!memberId || !password) {
      return respond({ error: 'Campos obrigatórios ausentes.' })
    }
    if (password.length < 6) {
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

    // Verificar se o chamador é admin
    const { data: cp } = await admin
      .from('profiles')
      .select('role, org_id')
      .eq('id', caller.id)
      .single()

    if (!cp || !['admin', 'superadmin'].includes(cp.role)) {
      return respond({ error: 'Apenas administradores podem resetar senhas.' })
    }

    // Verificar se o alvo pertence à mesma org
    const { data: target } = await admin
      .from('profiles')
      .select('org_id, full_name')
      .eq('id', memberId)
      .single()

    if (!target) return respond({ error: 'Funcionário não encontrado.' })
    if (cp.role !== 'superadmin' && target.org_id !== cp.org_id) {
      return respond({ error: 'Acesso negado a este funcionário.' })
    }

    // Resetar a senha via Admin API
    const { error: updateErr } = await admin.auth.admin.updateUserById(memberId, { password })
    if (updateErr) return respond({ error: updateErr.message })

    return respond({ success: true })
  } catch (err) {
    return respond({ error: String((err as Error).message ?? err) })
  }
})
