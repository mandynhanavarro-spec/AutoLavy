-- Corrige alerta real do get_advisors: next_due_date ficou sem
-- search_path fixo (boa pratica de seguranca pra toda funcao, nao
-- so SECURITY DEFINER). Mesma assinatura e comportamento.
CREATE OR REPLACE FUNCTION public.next_due_date(
  p_due_date date,
  p_billing_cycle text,
  p_billing_day integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_months integer;
  v_target_month date;
  v_last_day integer;
  v_day integer;
BEGIN
  IF p_due_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_months := CASE WHEN p_billing_cycle = 'anual' THEN 12 ELSE 1 END;
  v_target_month := (date_trunc('month', p_due_date) + (v_months || ' months')::interval)::date;
  v_last_day := EXTRACT(DAY FROM (v_target_month + INTERVAL '1 month - 1 day'))::int;
  v_day := LEAST(COALESCE(p_billing_day, EXTRACT(DAY FROM p_due_date)::int), v_last_day);

  RETURN (v_target_month + (v_day - 1) * INTERVAL '1 day')::date;
END;
$$;
