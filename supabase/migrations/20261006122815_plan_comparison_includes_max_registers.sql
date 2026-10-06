DROP FUNCTION IF EXISTS public.get_plan_comparison();

CREATE FUNCTION public.get_plan_comparison()
 RETURNS TABLE(plan_id uuid, plan_name text, plan_price numeric, max_products integer, max_users integer, max_registers integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.name, p.price, pl.max_products, pl.max_users, pl.max_registers
  FROM public.saas_plans p
  LEFT JOIN public.saas_plan_limits pl ON pl.plan_id = p.id
  WHERE p.status = 'ativo'
    AND (
      p.vertical_code IS NULL
      OR p.vertical_code = (SELECT o.product_id FROM public.organizations o WHERE o.id = public.get_my_org_id())
    )
  ORDER BY p.price ASC NULLS LAST;
$function$;
