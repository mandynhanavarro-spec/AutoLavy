-- Código de barras por variação (product_variants.sku_variant): impede que
-- duas variações (da mesma loja, de produtos iguais ou diferentes) tenham o
-- mesmo código. NULL continua permitido em qualquer quantidade (produto sem
-- código de barras na variação).
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_org_sku_variant_key
  ON public.product_variants (org_id, sku_variant)
  WHERE sku_variant IS NOT NULL;

-- Evita colisão ENTRE um sku_variant (variação) e o sku de um produto
-- simples da mesma loja -- as duas tabelas não têm como compartilhar uma
-- unique constraint direta, por isso são dois triggers simétricos.
CREATE OR REPLACE FUNCTION public.check_sku_variant_vs_product_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF NEW.sku_variant IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_name
  FROM public.products
  WHERE org_id = NEW.org_id AND sku = NEW.sku_variant
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION 'SKU_DUPLICADO:%', v_name;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_sku_variant_vs_product_sku ON public.product_variants;
CREATE TRIGGER trg_check_sku_variant_vs_product_sku
  BEFORE INSERT OR UPDATE OF sku_variant ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_sku_variant_vs_product_sku();

CREATE OR REPLACE FUNCTION public.check_product_sku_vs_sku_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF NEW.sku IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_name
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.org_id = NEW.org_id
    AND pv.sku_variant = NEW.sku
    AND pv.product_id IS DISTINCT FROM NEW.id
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION 'SKU_DUPLICADO:%', v_name;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_product_sku_vs_sku_variant ON public.products;
CREATE TRIGGER trg_check_product_sku_vs_sku_variant
  BEFORE INSERT OR UPDATE OF sku ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.check_product_sku_vs_sku_variant();
