ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS min_stock_alert integer DEFAULT 5;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS min_stock_alert integer;
