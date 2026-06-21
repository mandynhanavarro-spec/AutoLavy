-- ============================================================
-- CATEGORIAS + FILTRO PDV — Execute no Supabase SQL Editor
-- ============================================================

-- 1. description em categories (coluna ainda não existe no schema)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. product_filter em cash_registers (adicionado no setup anterior, confirma)
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS product_filter JSONB DEFAULT NULL;

-- 3. category_id em products (já no schema, confirma existência)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id);

-- 4. Reload schema cache do PostgREST
SELECT pg_notify('pgrst', 'reload schema');
