-- VD-01: abrir/fechar caixa por sessao (cash_sessions).
--
-- Retrocompativel com o site atual: so adiciona colunas/indices/funcoes e
-- triggers que PREENCHEM session_id quando ele vem vazio. A regra que
-- EXIGE sessao aberta para vender fica numa migration separada, aplicada so
-- depois de o frontend novo estar no ar (regra 12.1).
--
-- Regras (decisao da Mandy):
--   - uma sessao aberta por caixa (nao por operador); troca de turno =
--     fechar e abrir de novo;
--   - esperado em dinheiro = abertura + vendas em dinheiro - estornos em
--     dinheiro + reforcos - sangrias;
--   - abrir: quem tem can_open_cash (todos os papeis); fechar (inclusive a
--     sessao aberta por outra pessoa): quem tem can_close_cash.

-- 1. Estrutura -------------------------------------------------------------

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.cash_sessions
  DROP CONSTRAINT IF EXISTS cash_sessions_status_check;
ALTER TABLE public.cash_sessions
  ADD CONSTRAINT cash_sessions_status_check CHECK (status IN ('open', 'closed'));

-- uma sessao aberta por caixa
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_register
  ON public.cash_sessions (register_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cash_sessions_register_id ON public.cash_sessions (register_id);
CREATE INDEX IF NOT EXISTS idx_sales_session_id ON public.sales (session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON public.cash_movements (session_id);

ALTER TABLE public.cash_closings
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

-- estorno em dinheiro vira movimentacao do caixa
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_type_check;
ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_type_check CHECK (type IN ('sangria', 'reforco', 'estorno'));

-- 2. Permissao no banco ----------------------------------------------------
-- Mesma regra de src/core/hooks/usePermissions.js: o papel garante o
-- minimo; profiles.permissions so ACRESCENTA. Le so o perfil de quem chama
-- (a RLS de profiles libera id = auth.uid(), entao INVOKER basta).
CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.role::text IN ('admin', 'superadmin') THEN true
      WHEN p.role::text = 'gerente'
        AND p_key IN ('can_edit_stock', 'can_open_cash', 'can_do_sangria', 'can_view_reports', 'can_close_cash')
        THEN true
      WHEN p_key IN ('can_open_cash', 'can_do_sangria') THEN true
      ELSE COALESCE((p.permissions->>p_key)::boolean, false)
    END
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), false);
$function$;

REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- 3. Valor em dinheiro de uma venda ---------------------------------------
-- sale_payments e a fonte (venda simples tambem grava uma linha); venda
-- antiga sem sale_payments cai no payment_method da propria venda.
CREATE OR REPLACE FUNCTION public.sale_cash_amount(p_sale public.sales)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id = p_sale.id)
      THEN COALESCE((
        SELECT sum(sp.amount) FROM public.sale_payments sp
        WHERE sp.sale_id = p_sale.id AND sp.payment_method = 'dinheiro'
      ), 0)
    WHEN p_sale.payment_method = 'dinheiro' THEN p_sale.total_amount
    ELSE 0
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sale_cash_amount(public.sales) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sale_cash_amount(public.sales) TO authenticated;

-- 4. Preencher session_id (venda e movimentacao) ---------------------------
-- Se o frontend nao mandar (site antigo), usa a sessao aberta do caixa.
CREATE OR REPLACE FUNCTION public.fill_cash_session_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.session_id IS NULL AND NEW.register_id IS NOT NULL THEN
    SELECT id INTO NEW.session_id
    FROM public.cash_sessions
    WHERE register_id = NEW.register_id AND status = 'open'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fill_cash_session_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_session_id ON public.sales;
CREATE TRIGGER trg_fill_session_id
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.fill_cash_session_id();

DROP TRIGGER IF EXISTS trg_fill_session_id ON public.cash_movements;
CREATE TRIGGER trg_fill_session_id
  BEFORE INSERT ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.fill_cash_session_id();

-- 5. Estorno em dinheiro -> movimentacao 'estorno' -------------------------
-- Ao marcar a venda como estornada, o dinheiro sai do caixa que estiver
-- aberto AGORA naquele caixa (pode ser outra sessao, se a venda for de um
-- turno anterior). Sem sessao aberta, fica sem session_id.
CREATE OR REPLACE FUNCTION public.register_cash_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cash numeric;
BEGIN
  v_cash := public.sale_cash_amount(NEW);
  IF v_cash > 0 THEN
    INSERT INTO public.cash_movements (org_id, register_id, type, amount, reason, created_by)
    VALUES (
      NEW.org_id, NEW.register_id, 'estorno', v_cash,
      'Estorno da venda #' || upper(right(NEW.id::text, 6)),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_cash_refund() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_register_cash_refund ON public.sales;
CREATE TRIGGER trg_register_cash_refund
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'voided' AND NEW.status = 'voided')
  EXECUTE FUNCTION public.register_cash_refund();

-- 6. Resumo da sessao (usado pela tela e pelo fechamento) -----------------
-- Totais por forma de pagamento: so vendas validas (como o fechamento
-- antigo). Dinheiro esperado: vendas em dinheiro da sessao (inclusive as
-- estornadas depois) - estornos registrados na sessao, pra nao descontar
-- duas vezes.
CREATE OR REPLACE FUNCTION public.cash_session_summary(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s        public.cash_sessions;
  v_result   jsonb;
BEGIN
  SELECT * INTO v_s FROM public.cash_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'SESSAO_INVALIDA';
  END IF;

  WITH s AS (
    SELECT sa.*, public.sale_cash_amount(sa) AS cash
    FROM public.sales sa
    WHERE sa.session_id = p_session_id
  ),
  pay AS (
    SELECT sp.payment_method, sum(sp.amount) AS amount
    FROM s JOIN public.sale_payments sp ON sp.sale_id = s.id
    WHERE s.status <> 'voided'
    GROUP BY sp.payment_method
  ),
  mv AS (
    SELECT type, sum(amount) AS amount
    FROM public.cash_movements
    WHERE session_id = p_session_id
    GROUP BY type
  ),
  t AS (
    SELECT
      COALESCE((SELECT sum(total_amount) FROM s WHERE status <> 'voided'), 0) AS total_sales,
      (SELECT count(*) FROM s WHERE status <> 'voided')                       AS sales_count,
      (SELECT count(*) FROM s WHERE status = 'voided')                        AS voided_count,
      COALESCE((SELECT sum(cash) FROM s), 0)                                  AS cash_sales,
      COALESCE((SELECT amount FROM pay WHERE payment_method = 'dinheiro'), 0) AS dinheiro,
      COALESCE((SELECT amount FROM pay WHERE payment_method = 'pix'), 0)      AS pix,
      COALESCE((SELECT amount FROM pay WHERE payment_method = 'debito'), 0)   AS debito,
      COALESCE((SELECT amount FROM pay WHERE payment_method = 'credito'), 0)  AS credito,
      COALESCE((SELECT amount FROM mv WHERE type = 'reforco'), 0)             AS reforcos,
      COALESCE((SELECT amount FROM mv WHERE type = 'sangria'), 0)             AS sangrias,
      COALESCE((SELECT amount FROM mv WHERE type = 'estorno'), 0)             AS estornos
  )
  SELECT jsonb_build_object(
    'session_id',      v_s.id,
    'register_id',     v_s.register_id,
    'status',          v_s.status,
    'opened_at',       v_s.opened_at,
    'opening_balance', v_s.opening_balance,
    'total_sales',     t.total_sales,
    'sales_count',     t.sales_count,
    'voided_count',    t.voided_count,
    'dinheiro',        t.dinheiro,
    'pix',             t.pix,
    'debito',          t.debito,
    'credito',         t.credito,
    'cash_sales',      t.cash_sales,
    'estornos',        t.estornos,
    'reforcos',        t.reforcos,
    'sangrias',        t.sangrias,
    'expected_cash',   v_s.opening_balance + t.cash_sales - t.estornos + t.reforcos - t.sangrias
  ) INTO v_result
  FROM t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cash_session_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_session_summary(uuid) TO authenticated;

-- 7. Abrir caixa -----------------------------------------------------------
-- SECURITY INVOKER (RLS vale) e, alem disso, o caixa precisa ser da loja de
-- quem chama: org_id = get_my_org_id(), nunca parametro (regra 12.2). Por
-- isso o superadmin em modo suporte nao abre caixa de cliente.
-- can_open_cash e garantido a todos os papeis.
CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_register_id uuid,
  p_opening_balance numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
  v_id     uuid;
BEGIN
  IF NOT public.has_permission('can_open_cash') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_ABRIR';
  END IF;

  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id AND is_active AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'CAIXA_INVALIDO';
  END IF;
  IF COALESCE(p_opening_balance, 0) < 0 THEN
    RAISE EXCEPTION 'VALOR_INVALIDO';
  END IF;

  BEGIN
    INSERT INTO public.cash_sessions (org_id, register_id, user_id, opening_balance, status)
    VALUES (v_org_id, p_register_id, auth.uid(), COALESCE(p_opening_balance, 0), 'open')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CAIXA_JA_ABERTO';
  END;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated;

-- 8. Fechar caixa ----------------------------------------------------------
-- Mesma regra: so sessao da loja de quem chama (get_my_org_id()).
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_counted numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s   public.cash_sessions;
  v_sum jsonb;
BEGIN
  IF NOT public.has_permission('can_close_cash') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_FECHAR';
  END IF;

  SELECT * INTO v_s FROM public.cash_sessions
  WHERE id = p_session_id AND org_id = public.get_my_org_id()
  FOR UPDATE;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'SESSAO_INVALIDA';
  END IF;
  IF v_s.status <> 'open' THEN
    RAISE EXCEPTION 'CAIXA_JA_FECHADO';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN
    RAISE EXCEPTION 'VALOR_INVALIDO';
  END IF;

  v_sum := public.cash_session_summary(p_session_id);

  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      closing_balance_expected = (v_sum->>'expected_cash')::numeric,
      closing_balance_real = p_counted,
      notes = NULLIF(trim(COALESCE(p_notes, '')), '')
  WHERE id = p_session_id;

  INSERT INTO public.cash_closings (
    org_id, closed_by, register_id, session_id, date,
    total_sales, total_transactions,
    total_dinheiro, total_pix, total_debito, total_credito, notes
  ) VALUES (
    v_s.org_id, auth.uid(), v_s.register_id, v_s.id,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    (v_sum->>'total_sales')::numeric, (v_sum->>'sales_count')::integer,
    (v_sum->>'dinheiro')::numeric, (v_sum->>'pix')::numeric,
    (v_sum->>'debito')::numeric, (v_sum->>'credito')::numeric,
    NULLIF(trim(COALESCE(p_notes, '')), '')
  );

  RETURN v_sum || jsonb_build_object(
    'counted', p_counted,
    'difference', p_counted - (v_sum->>'expected_cash')::numeric
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated;
