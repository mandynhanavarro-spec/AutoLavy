-- O front fazia DELETE + INSERT de product_variants em duas chamadas
-- separadas (duas requisicoes HTTP = duas transacoes). Se o INSERT falhasse
-- (ex.: codigo de barras duplicado, pelos triggers da migration
-- sku_variant_conflict_check), o DELETE ja tinha sido commitado -- o
-- produto ficava sem nenhuma variacao, silenciosamente. Essa funcao faz as
-- duas coisas numa unica transacao: se o INSERT falhar, o DELETE tambem e
-- desfeito.
CREATE OR REPLACE FUNCTION public.replace_product_variants(
  p_product_id uuid,
  p_org_id uuid,
  p_variants jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'PRODUTO_INVALIDO';
  END IF;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND org_id = p_org_id;

  INSERT INTO public.product_variants (
    org_id, product_id, attributes, stock_quantity, price_override, sku_variant, is_active
  )
  SELECT
    p_org_id,
    p_product_id,
    (elem->>'attributes')::jsonb,
    NULLIF(elem->>'stock_quantity', '')::integer,
    NULLIF(elem->>'price_override', '')::numeric,
    NULLIF(elem->>'sku_variant', ''),
    true
  FROM jsonb_array_elements(p_variants) AS elem;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.replace_product_variants(uuid, uuid, jsonb) TO authenticated;
