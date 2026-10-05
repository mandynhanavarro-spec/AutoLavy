-- Corrige bug real: due_date NULL fazia a loja ficar "em_dia" pra
-- sempre -- nunca seria cobrada nem bloqueada. Agora:
-- - devido (due_date) NULL com trial_ends_at ja vencido usa a data do
--   fim do teste como vencimento efetivo pro calculo.
-- - sem due_date e sem trial_ends_at -> situacao 'sem_vencimento'
--   (alerta pro SuperAdmin, nunca bloqueia sozinho).
-- Mesma assinatura da funcao -- retrocompativel, pode ir junto com o
-- deploy do frontend sem quebrar nada que ja esta no ar.
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
  v_effective_due date;
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

  -- Vencimento efetivo: o due_date gravado, ou -- se nao houver --
  -- a data do fim do periodo de teste. So fica NULL de verdade quando
  -- a assinatura nao tem nem um nem outro.
  v_effective_due := COALESCE(v_sub.due_date, v_sub.trial_ends_at::date);

  IF v_sub.status = 'cancelada' THEN
    v_situacao := 'cancelado';
  ELSIF v_sub.status = 'suspensa' THEN
    v_situacao := 'suspenso';
  ELSIF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now() THEN
    v_situacao := 'teste';
  ELSIF v_effective_due IS NULL THEN
    v_situacao := 'sem_vencimento';
  ELSIF v_effective_due >= CURRENT_DATE THEN
    v_dias_para_vencer := v_effective_due - CURRENT_DATE;
    v_situacao := CASE WHEN v_dias_para_vencer <= 5 THEN 'vence_em_breve' ELSE 'em_dia' END;
  ELSE
    v_dias_atraso := CURRENT_DATE - v_effective_due;
    v_situacao := CASE
      WHEN v_dias_atraso <= 5 THEN 'atrasado'
      WHEN v_dias_atraso <= 30 THEN 'suspenso'
      ELSE 'cancelado'
    END;
  END IF;

  RETURN QUERY SELECT v_situacao, v_effective_due, v_sub.trial_ends_at, v_dias_atraso, v_dias_para_vencer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_status(uuid) TO authenticated;
