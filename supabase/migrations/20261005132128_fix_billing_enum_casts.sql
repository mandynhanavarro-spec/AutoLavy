-- Corrige bug real achado em teste: method/status de saas_payments e
-- status/payment_status de saas_subscriptions sao enums
-- (payment_method_type, payment_status, subscription_status), e os
-- parametros das funcoes eram text sem cast -- register_manual_payment
-- falhava com "column is of type X but expression is of type text".

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
    p_org_id, v_sub.id, p_amount, p_method::payment_method_type, p_status::payment_status, v_new_due,
    CASE WHEN p_status = 'pago' THEN now() ELSE NULL END, p_notes
  )
  RETURNING * INTO v_payment;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.saas_subscriptions
    SET payment_status = p_status::payment_status,
        due_date = v_new_due,
        status = CASE WHEN p_status = 'cancelado' THEN 'cancelada'::subscription_status ELSE status END,
        updated_at = now()
    WHERE id = v_sub.id;
  END IF;

  RETURN v_payment;
END;
$$;

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
  SET status = p_status::subscription_status,
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
