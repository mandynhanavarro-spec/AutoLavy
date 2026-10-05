-- Expoe plano atual da propria loja e catalogo de planos pra
-- comparacao -- saas_plans/saas_subscriptions/saas_plan_limits sao
-- RLS superadmin-only hoje, entao a tela Meu Plano (loja) precisa
-- dessas funcoes pra ler sem dar SELECT direto nas tabelas.

CREATE OR REPLACE FUNCTION public.get_my_plan()
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  plan_price numeric,
  max_products integer,
  max_users integer,
  max_registers integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.name, p.price,
    pl.max_products, pl.max_users, o.max_registers
  FROM public.organizations o
  LEFT JOIN public.saas_plans p ON p.id = o.plan_id
  LEFT JOIN public.saas_plan_limits pl ON pl.plan_id = o.plan_id
  WHERE o.id = public.get_my_org_id();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_plan() TO authenticated;

-- Catalogo de planos pra comparacao, filtrado pela vertical da
-- propria loja. Dado nao sensivel (mesmo preco mostrado hoje no
-- onboarding do SuperAdmin) -- liberado pra qualquer autenticado.
CREATE OR REPLACE FUNCTION public.get_plan_comparison()
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  plan_price numeric,
  max_products integer,
  max_users integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.name, p.price, pl.max_products, pl.max_users
  FROM public.saas_plans p
  LEFT JOIN public.saas_plan_limits pl ON pl.plan_id = p.id
  WHERE p.status = 'ativo'
    AND (
      p.vertical_code IS NULL
      OR p.vertical_code = (SELECT o.product_id FROM public.organizations o WHERE o.id = public.get_my_org_id())
    )
  ORDER BY p.price ASC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.get_plan_comparison() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_comparison() TO authenticated;
