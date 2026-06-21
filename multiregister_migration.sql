-- ============================================================
-- MULTI-CAIXA — Execute no Supabase SQL Editor
-- ============================================================

-- 1. register_id em sales (liga cada venda ao caixa)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES public.cash_registers(id);

-- 2. Tabela cash_closings com register_id
--    Se ainda não existir: cria completa.
--    Se já existir sem register_id: ADD COLUMN.
CREATE TABLE IF NOT EXISTS public.cash_closings (
  id                 UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id             UUID    REFERENCES public.organizations(id),
  register_id        UUID    REFERENCES public.cash_registers(id),
  closed_by          UUID    REFERENCES public.profiles(id),
  closed_at          TIMESTAMPTZ DEFAULT NOW(),
  date               DATE    NOT NULL,
  total_sales        DECIMAL(10,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_dinheiro     DECIMAL(10,2) DEFAULT 0,
  total_pix          DECIMAL(10,2) DEFAULT 0,
  total_cartao       DECIMAL(10,2) DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cash_closings
  ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES public.cash_registers(id);

-- 3. RLS em cash_closings
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_closings_rls ON public.cash_closings;
CREATE POLICY cash_closings_rls ON public.cash_closings
  FOR ALL
  USING  (org_id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closings TO authenticated, service_role;

-- 4. Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
