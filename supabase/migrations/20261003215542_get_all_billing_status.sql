-- Wrapper em lote de get_billing_status(), pra tabela do SuperAdmin
-- nao precisar de uma chamada RPC por linha. Reusa a MESMA funcao
-- (LATERAL JOIN) -- nao duplica a logica do calculo de situacao.
CREATE OR REPLACE FUNCTION public.get_all_billing_status()
RETURNS TABLE (
  org_id uuid,
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
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  RETURN QUERY
  SELECT o.id, bs.situacao, bs.due_date, bs.trial_ends_at, bs.dias_atraso, bs.dias_para_vencer
  FROM public.organizations o
  CROSS JOIN LATERAL public.get_billing_status(o.id) bs;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_billing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_billing_status() TO authenticated;
