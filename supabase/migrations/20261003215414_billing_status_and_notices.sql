-- ============================================================
-- Fase 1 de cobranca: situacao calculada na leitura, pagamento
-- manual com avanco de vencimento, avisos de "Ja paguei" e
-- configuracao central de PIX/QR/WhatsApp.
--
-- Nao ha pg_cron: toda a situacao (teste/em_dia/vence_em_breve/
-- atrasado/suspenso/cancelado) e computada sob demanda pela
-- funcao get_billing_status(), chamada pelo App.jsx, pelo
-- SuperAdmin e pela tela Meu Plano -- uma regra, um lugar so.
-- ============================================================

-- ------------------------------------------------------------
-- 1. saas_subscriptions: + trial_ends_at (periodo de teste)
-- ------------------------------------------------------------
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ------------------------------------------------------------
-- 2. saas_billing_settings: configuracao global (linha unica)
--    de PIX/QR/WhatsApp, editada so pelo SuperAdmin. Clientes
--    nunca leem a tabela direto -- so via get_billing_contact().
-- ------------------------------------------------------------
CREATE TABLE public.saas_billing_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  pix_key text,
  pix_recipient_name text,
  qr_code_url text,
  support_whatsapp text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.saas_billing_settings (id) VALUES ('00000000-0000-0000-0000-000000000001'::uuid);

ALTER TABLE public.saas_billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_billing_settings_superadmin ON public.saas_billing_settings
  FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

GRANT SELECT, UPDATE ON public.saas_billing_settings TO authenticated;

-- ------------------------------------------------------------
-- 3. payment_notices: avisos de "Ja paguei". So um pendente
--    por loja por vez (indice parcial unico).
-- ------------------------------------------------------------
CREATE TABLE public.payment_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2),
  note text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'recusado')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX payment_notices_one_pending_per_org
  ON public.payment_notices (org_id)
  WHERE status = 'pendente';

CREATE INDEX idx_payment_notices_org_id ON public.payment_notices (org_id);

ALTER TABLE public.payment_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_notices_select ON public.payment_notices
  FOR SELECT
  USING (org_id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY payment_notices_insert ON public.payment_notices
  FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id() AND user_id = auth.uid());

-- Sem policy de UPDATE/DELETE para o cliente -- confirmar/recusar
-- e feito so pelas funcoes SECURITY DEFINER abaixo (superadmin).

GRANT SELECT, INSERT ON public.payment_notices TO authenticated;

-- ------------------------------------------------------------
-- 4. get_org_usage: contagem de uso pro plano -- mesma regra do
--    trigger check_plan_limit() (arquivados nao contam em
--    produtos; cash_registers conta tudo, sem conceito de
--    arquivado hoje). Usada pela tela Meu Plano e pelo SuperAdmin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_usage(p_org_id uuid)
RETURNS TABLE (
  produtos_usados integer,
  produtos_max integer,
  usuarios_usados integer,
  usuarios_max integer,
  caixas_usados integer,
  caixas_max integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM public.get_my_org_id() AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM public.products WHERE org_id = p_org_id AND archived_at IS NULL),
    (SELECT pl.max_products FROM public.saas_plan_limits pl
       JOIN public.organizations o ON o.plan_id = pl.plan_id WHERE o.id = p_org_id),
    (SELECT count(*)::int FROM public.profiles WHERE org_id = p_org_id),
    (SELECT pl.max_users FROM public.saas_plan_limits pl
       JOIN public.organizations o ON o.plan_id = pl.plan_id WHERE o.id = p_org_id),
    (SELECT count(*)::int FROM public.cash_registers WHERE org_id = p_org_id),
    (SELECT o.max_registers FROM public.organizations o WHERE o.id = p_org_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_org_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_usage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5. get_billing_status: situacao calculada na leitura.
--    Suspensao/cancelamento MANUAL (saas_subscriptions.status)
--    tem prioridade absoluta sobre o calculo por data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_status(p_org_id uuid)
RETURNS TABLE (
  situacao text,
  due_date date,
  trial_ends_at timestamptz,
  dias_atraso integer,
  dias_para_vencer integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.saas_subscriptions;
  v_dias_atraso integer := 0;
  v_dias_para_vencer integer;
  v_situacao text;
BEGIN
  IF p_org_id IS DISTINCT FROM public.get_my_org_id() AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT * INTO v_sub FROM public.saas_subscriptions WHERE organization_id = p_org_id;

  IF v_sub.id IS NULL THEN
    RETURN QUERY SELECT 'em_dia'::text, NULL::date, NULL::timestamptz, 0, NULL::integer;
    RETURN;
  END IF;

  IF v_sub.status = 'cancelada' THEN
    v_situacao := 'cancelado';
  ELSIF v_sub.status = 'suspensa' THEN
    v_situacao := 'suspenso';
  ELSIF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now() THEN
    v_situacao := 'teste';
  ELSIF v_sub.due_date IS NULL THEN
    v_situacao := 'em_dia';
  ELSIF v_sub.due_date >= CURRENT_DATE THEN
    v_dias_para_vencer := v_sub.due_date - CURRENT_DATE;
    v_situacao := CASE WHEN v_dias_para_vencer <= 5 THEN 'vence_em_breve' ELSE 'em_dia' END;
  ELSE
    v_dias_atraso := CURRENT_DATE - v_sub.due_date;
    v_situacao := CASE
      WHEN v_dias_atraso <= 5 THEN 'atrasado'
      WHEN v_dias_atraso <= 30 THEN 'suspenso'
      ELSE 'cancelado'
    END;
  END IF;

  RETURN QUERY SELECT v_situacao, v_sub.due_date, v_sub.trial_ends_at, v_dias_atraso, v_dias_para_vencer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_status(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6. get_billing_contact: subset nao-sensivel de
--    saas_billing_settings, liberado pra qualquer autenticado
--    (e so o que a tela de bloqueio/Meu Plano precisa mostrar).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_contact()
RETURNS TABLE (
  pix_key text,
  pix_recipient_name text,
  qr_code_url text,
  support_whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pix_key, pix_recipient_name, qr_code_url, support_whatsapp
  FROM public.saas_billing_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_contact() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_contact() TO authenticated;

-- ------------------------------------------------------------
-- 7. register_manual_payment: usada pelo PagamentosTab existente
--    e por confirm_payment_notice. Pagamento 'pago' SEMPRE avanca
--    o vencimento em 1 mes A PARTIR DO VENCIMENTO ANTERIOR (nao
--    da data do pagamento) -- protege contra "empilhar" meses se
--    o pagamento for registrado com atraso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_manual_payment(
  p_org_id uuid,
  p_amount numeric,
  p_method text,
  p_status text,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.saas_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.saas_subscriptions;
  v_new_due date;
  v_payment public.saas_payments;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT * INTO v_sub FROM public.saas_subscriptions WHERE organization_id = p_org_id FOR UPDATE;

  IF p_status = 'pago' THEN
    v_new_due := COALESCE(v_sub.due_date, CURRENT_DATE) + INTERVAL '1 month';
  ELSE
    v_new_due := COALESCE(p_due_date, v_sub.due_date);
  END IF;

  INSERT INTO public.saas_payments (
    organization_id, subscription_id, amount, method, status, due_date, paid_at, notes
  )
  VALUES (
    p_org_id, v_sub.id, p_amount, p_method, p_status, v_new_due,
    CASE WHEN p_status = 'pago' THEN now() ELSE NULL END, p_notes
  )
  RETURNING * INTO v_payment;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.saas_subscriptions
    SET payment_status = p_status,
        due_date = v_new_due,
        status = CASE WHEN p_status = 'cancelado' THEN 'cancelada' ELSE status END,
        updated_at = now()
    WHERE id = v_sub.id;
  END IF;

  RETURN v_payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_manual_payment(uuid, numeric, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_payment(uuid, numeric, text, text, date, text) TO authenticated;

-- ------------------------------------------------------------
-- 8. confirm_payment_notice / reject_payment_notice
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_payment_notice(
  p_notice_id uuid,
  p_method text DEFAULT 'pix'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notice public.payment_notices;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT * INTO v_notice FROM public.payment_notices WHERE id = p_notice_id AND status = 'pendente' FOR UPDATE;
  IF v_notice.id IS NULL THEN
    RAISE EXCEPTION 'AVISO_NAO_ENCONTRADO';
  END IF;

  PERFORM public.register_manual_payment(
    v_notice.org_id,
    COALESCE(v_notice.amount, 0),
    p_method,
    'pago',
    NULL,
    'Confirmado via aviso de "Ja paguei"'
  );

  UPDATE public.payment_notices
  SET status = 'confirmado', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_notice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment_notice(
  p_notice_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO';
  END IF;

  UPDATE public.payment_notices
  SET status = 'recusado', rejection_reason = p_reason, resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_notice_id AND status = 'pendente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AVISO_NAO_ENCONTRADO';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_payment_notice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_payment_notice(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_payment_notice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_payment_notice(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 9. set_subscription_status: suspender/reativar/cancelar manual.
--    Reativar EXIGE novo vencimento -- senao a loja voltaria a
--    ficar suspensa no mesmo instante pelo calculo por data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_subscription_status(
  p_org_id uuid,
  p_status text,
  p_new_due_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;
  IF p_status NOT IN ('ativa', 'suspensa', 'cancelada') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;
  IF p_status = 'ativa' AND p_new_due_date IS NULL THEN
    RAISE EXCEPTION 'VENCIMENTO_OBRIGATORIO';
  END IF;

  UPDATE public.saas_subscriptions
  SET status = p_status,
      due_date = COALESCE(p_new_due_date, due_date),
      suspended_at = CASE WHEN p_status = 'suspensa' THEN now() ELSE NULL END,
      canceled_at = CASE WHEN p_status = 'cancelada' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE organization_id = p_org_id;

  UPDATE public.organizations
  SET customer_status = CASE p_status
        WHEN 'ativa' THEN 'ativo'::customer_status
        WHEN 'suspensa' THEN 'suspenso'::customer_status
        WHEN 'cancelada' THEN 'cancelado'::customer_status
      END,
      access_status = CASE WHEN p_status = 'ativa' THEN 'ativo'::access_status ELSE 'bloqueado'::access_status END,
      is_active = (p_status = 'ativa'),
      suspended_at = CASE WHEN p_status = 'suspensa' THEN now() ELSE NULL END
  WHERE id = p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_subscription_status(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_subscription_status(uuid, text, date) TO authenticated;

-- ------------------------------------------------------------
-- 10. Bucket de storage pro QR Code (mesmo padrao do org-logos:
--     publico pra leitura, escrita so pelo superadmin).
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('billing-assets', 'billing-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Billing assets write" ON storage.objects
  FOR ALL
  USING (bucket_id = 'billing-assets' AND public.is_superadmin())
  WITH CHECK (bucket_id = 'billing-assets' AND public.is_superadmin());
