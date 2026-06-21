-- ============================================================
-- get_my_registers() — versão corrigida (sem created_at)
-- Execute no Supabase SQL Editor
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_registers();

CREATE OR REPLACE FUNCTION public.get_my_registers()
RETURNS TABLE (
  id             UUID,
  org_id         UUID,
  name           TEXT,
  description    TEXT,
  is_active      BOOLEAN,
  product_filter JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_my_org_id();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE public.cash_registers.org_id = v_org_id
  ) THEN
    INSERT INTO public.cash_registers (org_id, name, description, is_active)
    VALUES (v_org_id, 'Caixa Principal', 'Caixa criado automaticamente.', TRUE);
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.org_id,
    r.name,
    r.description,
    r.is_active,
    r.product_filter
  FROM public.cash_registers r
  WHERE r.org_id = v_org_id
  ORDER BY r.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_registers() TO authenticated, service_role;

-- Confirmar:
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_my_registers';
