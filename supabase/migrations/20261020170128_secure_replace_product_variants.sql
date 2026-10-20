-- Correcao de seguranca (regra 12.2) de replace_product_variants e dos
-- triggers de sku da migration sku_variant_conflict_check.
--
-- replace_product_variants era SECURITY DEFINER, recebia p_org_id do
-- chamador e tinha EXECUTE para PUBLIC/anon: qualquer pessoa (ate deslogada)
-- que soubesse o id de um produto podia apagar/trocar as variacoes de outra
-- loja. Agora:
--   - SECURITY INVOKER: a RLS de products/product_variants vale (produto de
--     outra loja nao aparece -> PRODUTO_INVALIDO; o modo suporte do
--     superadmin continua funcionando pela propria RLS via is_superadmin());
--   - org_id vem do proprio produto, nao do chamador;
--   - EXECUTE so para authenticated.
-- A assinatura muda (sai p_org_id): o frontend em producao nao chama essa
-- funcao, so o codigo da Parte 2 que sobe junto com esta migration.
DROP FUNCTION IF EXISTS public.replace_product_variants(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.replace_product_variants(
  p_product_id uuid,
  p_variants jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'PRODUTO_INVALIDO';
  END IF;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND org_id = v_org_id;

  INSERT INTO public.product_variants (
    org_id, product_id, attributes, stock_quantity, price_override, sku_variant, is_active
  )
  SELECT
    v_org_id,
    p_product_id,
    (elem->>'attributes')::jsonb,
    NULLIF(elem->>'stock_quantity', '')::integer,
    NULLIF(elem->>'price_override', '')::numeric,
    NULLIF(elem->>'sku_variant', ''),
    true
  FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb)) AS elem;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_product_variants(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_product_variants(uuid, jsonb) TO authenticated;

-- Funcoes de trigger: o trigger dispara sem precisar de grant, entao
-- ninguem precisa poder chama-las via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.check_product_sku_vs_sku_variant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_sku_variant_vs_product_sku() FROM PUBLIC, anon, authenticated;
