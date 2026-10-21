-- M1 (itens "alto"): vendas, caixa, caixas e audit_logs.
--
-- Antes: policies FOR ALL "org_id = get_my_org_id()" deixavam qualquer
-- funcionario, direto pela API, apagar/alterar vendas e itens, estornar sem
-- can_void_sale, fechar/alterar sessao de caixa sem can_close_cash, apagar
-- sangria, apagar caixas e apagar audit_logs.
--
-- Compativel com o site no ar (frontend do Commit C, regra 12.1): o app so
--   - insere venda (user_id = quem vende), itens e pagamentos logo depois;
--   - altera venda no estorno e no "adicionar itens" (Historico, can_void_sale);
--   - insere sangria (can_do_sangria) e reforco (admin/gerente);
--   - abre/fecha caixa pelas RPCs;
--   - o admin edita caixas (Configuracoes).
-- Fica de fora (Etapa 4): estoque e preco de produto continuam alteraveis
-- por funcionario pela API.

-- 1. Vendas ------------------------------------------------------------------

-- So o estorno (completed -> voided, por quem tem can_void_sale, gravando
-- quem estornou) e o ajuste do "adicionar itens" (total/forma de pagamento,
-- can_void_sale). Venda estornada nao muda mais.
CREATE OR REPLACE FUNCTION public.sales_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed text[] := ARRAY['status', 'voided_at', 'voided_by', 'void_reason', 'total_amount', 'payment_method'];
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
     OR public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_permission('can_void_sale') THEN
    RAISE EXCEPTION 'VENDA_SEM_PERMISSAO';
  END IF;

  IF OLD.status = 'voided'
     OR (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'VENDA_CAMPO_PROTEGIDO';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status <> 'voided' OR NEW.voided_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'VENDA_CAMPO_PROTEGIDO';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sales_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sales_guard ON public.sales;
CREATE TRIGGER trg_sales_guard
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard();

DROP POLICY IF EXISTS "Tenant Isolation" ON public.sales;
DROP POLICY IF EXISTS "sales_tenant_isolation" ON public.sales;

CREATE POLICY sales_select ON public.sales
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());
-- quem vende e quem registra: nao da pra lancar venda em nome de outro
CREATE POLICY sales_insert ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND user_id = auth.uid());
CREATE POLICY sales_update ON public.sales
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());
CREATE POLICY sales_delete ON public.sales
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- Itens e pagamentos: entram na venda que a pessoa acabou de registrar
-- (fluxo do Caixa) ou, com can_void_sale, numa venda valida da loja
-- ("adicionar itens" do Historico). Ninguem altera nem apaga, so superadmin.
CREATE OR REPLACE FUNCTION public.can_add_to_sale(p_sale_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = p_sale_id
      AND s.org_id = public.get_my_org_id()
      AND s.status = 'completed'
      AND (
        (s.user_id = auth.uid() AND s.created_at > now() - interval '10 minutes')
        OR public.has_permission('can_void_sale')
      )
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.can_add_to_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_add_to_sale(uuid) TO authenticated;

DROP POLICY IF EXISTS "Tenant Isolation" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_tenant_isolation" ON public.sale_items;

CREATE POLICY sale_items_select ON public.sale_items
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());
CREATE POLICY sale_items_insert ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.can_add_to_sale(sale_id));
CREATE POLICY sale_items_update ON public.sale_items
  FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY sale_items_delete ON public.sale_items
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS "sale_payments_insert" ON public.sale_payments;
DROP POLICY IF EXISTS "sale_payments_delete" ON public.sale_payments;

CREATE POLICY sale_payments_insert ON public.sale_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_add_to_sale(sale_id));
CREATE POLICY sale_payments_update ON public.sale_payments
  FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY sale_payments_delete ON public.sale_payments
  FOR DELETE TO authenticated
  USING (public.is_superadmin());
-- sale_payments_select fica como esta

-- 2. Sessao e fechamento de caixa: so pelas RPCs -----------------------------

-- Viram SECURITY DEFINER para escrever sem policy de escrita para o
-- cliente. Mantem: loja por get_my_org_id() (superadmin no modo suporte nao
-- abre nem fecha caixa de cliente), has_permission, search_path fixo,
-- EXECUTE so para authenticated.
ALTER FUNCTION public.open_cash_session(uuid, numeric) SECURITY DEFINER;
ALTER FUNCTION public.close_cash_session(uuid, numeric, text) SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated;

DROP POLICY IF EXISTS "Tenant Isolation" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_tenant_isolation" ON public.cash_sessions;
CREATE POLICY cash_sessions_select ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS "cash_closings_rls" ON public.cash_closings;
CREATE POLICY cash_closings_select ON public.cash_closings
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());

-- 3. Movimentacoes -----------------------------------------------------------
-- Cliente so lanca sangria (can_do_sangria) e reforco (admin/gerente, como a
-- tela). O 'estorno' vem so do trigger register_cash_refund, que passa a
-- SECURITY DEFINER para isso. Ninguem altera nem apaga, so superadmin.
ALTER FUNCTION public.register_cash_refund() SECURITY DEFINER;

DROP POLICY IF EXISTS "movimentacoes da propria org" ON public.cash_movements;
CREATE POLICY cash_movements_select ON public.cash_movements
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());
CREATE POLICY cash_movements_insert ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND (
      (type = 'sangria' AND public.has_permission('can_do_sangria'))
      OR (type = 'reforco' AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
      ))
    )
  );
CREATE POLICY cash_movements_update ON public.cash_movements
  FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY cash_movements_delete ON public.cash_movements
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- 4. Caixas (cash_registers) -------------------------------------------------
-- Criar/editar: admin da loja (Configuracoes) ou superadmin. Apagar: so
-- superadmin. get_my_registers (DEFINER) continua criando o 1o caixa.
DROP POLICY IF EXISTS "Tenant Isolation" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers_select" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers_insert" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers_update" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers_delete" ON public.cash_registers;

CREATE POLICY cash_registers_select ON public.cash_registers
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());
CREATE POLICY cash_registers_insert ON public.cash_registers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (org_id = public.get_my_org_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
  );
CREATE POLICY cash_registers_update ON public.cash_registers
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR (org_id = public.get_my_org_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (org_id = public.get_my_org_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
  );
CREATE POLICY cash_registers_delete ON public.cash_registers
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- 5. audit_logs: leitura da loja; escrita so superadmin/servidor -------------
DROP POLICY IF EXISTS "Tenant Isolation" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());
CREATE POLICY audit_logs_write_superadmin ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- 6. anon nunca escreve; TRUNCATE ignora RLS ---------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.sales, public.sale_items, public.sale_payments,
  public.cash_sessions, public.cash_closings, public.cash_movements,
  public.cash_registers, public.audit_logs
FROM anon;
REVOKE TRUNCATE ON
  public.sales, public.sale_items, public.sale_payments,
  public.cash_sessions, public.cash_closings, public.cash_movements,
  public.cash_registers, public.audit_logs
FROM authenticated;
