// DEPLOY: supabase functions deploy delete-organization
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

async function del(
  admin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string,
) {
  const { error } = await admin.from(table).delete().eq(column, value)
  if (error) {
    console.error(`[delete-org] ERRO em ${table}:`, error.message)
    throw new Error(`Erro ao deletar ${table}: ${error.message}`)
  }
  console.log(`[delete-org] ${table} OK`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { orgId, callerEmail, password } = await req.json()
    if (!orgId) return respond({ error: 'orgId é obrigatório.' })
    if (!callerEmail || !password) return respond({ error: 'Credenciais não fornecidas.' })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Verificar JWT e papel do chamador
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return respond({ error: 'Não autorizado.' })

    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (!caller) return respond({ error: 'Token inválido.' })

    const { data: cp } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (cp?.role !== 'superadmin') {
      return respond({ error: 'Apenas superadmins podem excluir organizações.' })
    }

    // Verificar senha server-side (não afeta a sessão do browser)
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error: pwError } = await anonClient.auth.signInWithPassword({ email: callerEmail, password })
    console.log('[delete-org] verificação de senha:', pwError ? pwError.message : 'OK')
    if (pwError) return respond({ error: 'Senha incorreta.' })

    // Confirmar que a org existe
    const { data: org } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()
    if (!org) return respond({ error: 'Organização não encontrada.' })
    console.log('[delete-org] iniciando exclusão de:', org.name)

    // Coletar user_ids dos profiles ANTES de deletar qualquer coisa
    const { data: orgProfiles } = await admin
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
    const userIds: string[] = (orgProfiles ?? []).map((p: { id: string }) => p.id)
    console.log('[delete-org] usuários encontrados:', userIds.length)

    // ── Ordem de deleção ────────────────────────────────────────
    // Regra: deletar dependentes antes dos pais para evitar FK violations

    // 1. sale_items (referencia sales, products, product_variants)
    await del(admin, 'sale_items', 'org_id', orgId)

    // 2. product_variants (referencia products — precisa vir antes de products)
    try { await del(admin, 'product_variants', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 3. product_attributes (referencia products)
    try { await del(admin, 'product_attributes', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 4. sales
    await del(admin, 'sales', 'org_id', orgId)

    // 5. cash_closings (se existir)
    try { await del(admin, 'cash_closings', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 6. cash_movements (referencia cash_registers via register_id — DEVE vir antes de cash_registers)
    await del(admin, 'cash_movements', 'org_id', orgId)

    // 7. cash_sessions
    await del(admin, 'cash_sessions', 'org_id', orgId)

    // 8. products
    await del(admin, 'products', 'org_id', orgId)

    // 9. categories
    await del(admin, 'categories', 'org_id', orgId)

    // 10. cash_registers — agora seguro (cash_movements e cash_sessions já foram deletados)
    await del(admin, 'cash_registers', 'org_id', orgId)

    // 11. store_invites — não tem coluna org_id (convite é anterior à org)
    //    já está is_used=true após onboarding, não bloqueia nada — pulado intencionalmente

    // 12. audit_logs
    try { await del(admin, 'audit_logs', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 13. organization_segments (referencia organizations)
    try { await del(admin, 'organization_segments', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 14. role_templates com org_id (templates locais da org)
    try { await del(admin, 'role_templates', 'org_id', orgId) } catch (_) { /* tabela pode não existir */ }

    // 15. profiles — ANTES de organizations (quebra o FK profiles.org_id → organizations.id)
    await del(admin, 'profiles', 'org_id', orgId)

    // 16. organizations — saas_subscriptions e saas_payments têm ON DELETE CASCADE
    const { error: orgErr } = await admin.from('organizations').delete().eq('id', orgId)
    if (orgErr) {
      console.error('[delete-org] ERRO ao deletar organizations:', orgErr.message)
      return respond({ error: 'Erro ao excluir a organização: ' + orgErr.message })
    }
    console.log('[delete-org] organizations OK')

    // 12. auth.users — após organizations (profiles já foi deletado em #10)
    let deletedUsers = 0
    for (const userId of userIds) {
      const { error: uErr } = await admin.auth.admin.deleteUser(userId)
      if (uErr) console.error(`[delete-org] ERRO ao deletar auth.user ${userId}:`, uErr.message)
      else { console.log(`[delete-org] auth.user ${userId} OK`); deletedUsers++ }
    }

    console.log('[delete-org] ✔ exclusão completa — usuários deletados:', deletedUsers)
    return respond({ success: true, deletedUsers })
  } catch (err) {
    console.error('[delete-org] exception:', (err as Error).message)
    return respond({ error: (err as Error).message ?? 'Erro interno.' })
  }
})
