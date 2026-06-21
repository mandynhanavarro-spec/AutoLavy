-- ============================================================
-- AUTOLAVY - SETUP COMPLETO (versão final limpa)
-- Execute este script INTEIRO no Supabase SQL Editor
-- ============================================================

-- ── 1. profiles.permissions DEFAULT ──────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN permissions SET DEFAULT '{
    "can_void_sale": false,
    "can_edit_stock": false,
    "can_open_cash": true,
    "can_do_sangria": false,
    "can_view_reports": false,
    "can_close_cash": false,
    "can_manage_products": false
  }'::jsonb;

-- ── 2. role_templates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_templates (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  base_role   public.user_role DEFAULT 'operador',
  permissions JSONB       DEFAULT '{"can_void_sale":false,"can_edit_stock":false,"can_open_cash":true,"can_do_sangria":false,"can_view_reports":false,"can_close_cash":false,"can_manage_products":false}'::jsonb,
  is_default  BOOLEAN     DEFAULT false,
  created_by  UUID        REFERENCES public.profiles(id),
  org_id      UUID        REFERENCES public.organizations(id) NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_templates_rls ON public.role_templates;
CREATE POLICY role_templates_rls ON public.role_templates
  FOR ALL
  USING (
    (org_id IS NULL AND public.is_superadmin())
    OR (org_id = public.get_my_org_id())
    OR (org_id IS NULL AND auth.uid() IS NOT NULL)
  )
  WITH CHECK (
    (org_id IS NULL AND public.is_superadmin())
    OR (org_id = public.get_my_org_id())
  );

GRANT ALL ON public.role_templates TO authenticated, service_role;

INSERT INTO public.role_templates (name, description, base_role, permissions, is_default, org_id)
VALUES
  (
    'Operador Padrao',
    'Acesso basico: apenas abrir caixa e registrar vendas.',
    'operador',
    '{"can_void_sale":false,"can_edit_stock":false,"can_open_cash":true,"can_do_sangria":false,"can_view_reports":false,"can_close_cash":false,"can_manage_products":false}'::jsonb,
    true,
    NULL
  ),
  (
    'Gerente',
    'Gerencia caixa, estoque, sangria, relatorios e fechamento.',
    'gerente',
    '{"can_void_sale":false,"can_edit_stock":true,"can_open_cash":true,"can_do_sangria":true,"can_view_reports":true,"can_close_cash":true,"can_manage_products":false}'::jsonb,
    false,
    NULL
  ),
  (
    'Admin Completo',
    'Acesso total ao sistema.',
    'admin',
    '{"can_void_sale":true,"can_edit_stock":true,"can_open_cash":true,"can_do_sangria":true,"can_view_reports":true,"can_close_cash":true,"can_manage_products":true}'::jsonb,
    false,
    NULL
  ),
  (
    'Caixa Simples',
    'Apenas abertura do caixa e registro de vendas.',
    'operador',
    '{"can_void_sale":false,"can_edit_stock":false,"can_open_cash":true,"can_do_sangria":false,"can_view_reports":false,"can_close_cash":false,"can_manage_products":false}'::jsonb,
    false,
    NULL
  )
ON CONFLICT DO NOTHING;

-- ── 3. product_filter em cash_registers ──────────────────────
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS product_filter JSONB DEFAULT NULL;

-- ── 4. RLS explícita em cash_registers ───────────────────────
DROP POLICY IF EXISTS cash_registers_tenant_isolation ON public.cash_registers;
DROP POLICY IF EXISTS cash_registers_select           ON public.cash_registers;
DROP POLICY IF EXISTS cash_registers_insert           ON public.cash_registers;
DROP POLICY IF EXISTS cash_registers_update           ON public.cash_registers;
DROP POLICY IF EXISTS cash_registers_delete           ON public.cash_registers;

CREATE POLICY cash_registers_select ON public.cash_registers
  FOR SELECT USING (org_id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY cash_registers_insert ON public.cash_registers
  FOR INSERT WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY cash_registers_update ON public.cash_registers
  FOR UPDATE
  USING  (org_id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY cash_registers_delete ON public.cash_registers
  FOR DELETE USING (org_id = public.get_my_org_id() OR public.is_superadmin());

-- ── 5. RPC get_my_registers() ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_registers();

CREATE OR REPLACE FUNCTION public.get_my_registers()
RETURNS TABLE (
  id             UUID,
  org_id         UUID,
  name           TEXT,
  description    TEXT,
  is_active      BOOLEAN,
  product_filter JSONB,
  created_at     TIMESTAMPTZ
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
    SELECT 1 FROM public.cash_registers WHERE public.cash_registers.org_id = v_org_id
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
    r.product_filter,
    r.created_at
  FROM public.cash_registers r
  WHERE r.org_id = v_org_id
  ORDER BY r.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_registers() TO authenticated, service_role;

-- ── 6. Reload schema ─────────────────────────────────────────
SELECT pg_notify('pgrst', 'reload schema');
