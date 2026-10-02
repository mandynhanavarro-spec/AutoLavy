-- ============================================================
-- Arquivar produto (em vez de so excluir).
--
-- Contexto: sale_items.product_id nao tem CASCADE pra products
-- (de proposito -- preserva o historico de vendas), entao excluir
-- um produto ja vendido sempre falhava com erro de FK cru. Agora
-- o produto pode ser "arquivado": some do caixa e da lista padrao,
-- mas continua existindo pra historico/relatorios/mais vendidos.
--
-- (a) archived_at timestamptz, NULL = ativo. Sem backfill -- todo
--     produto existente continua ativo.
-- (b) indice parcial pra cobrir a consulta mais quente (caixa e
--     lista de produtos: WHERE org_id = X AND archived_at IS NULL).
-- (c) check_plan_limit(): produtos arquivados NAO contam no limite
--     do plano; reativar passa pela checagem (arquivar nunca
--     bloqueia). unique_sku_per_org continua valendo pra
--     arquivados de proposito (decisao do produto: um codigo de
--     barras nao pode "sumir" pra um produto novo enquanto ainda
--     aponta pra um arquivado -- o frontend oferece reativar o
--     arquivado em vez de deixar cadastrar um novo com o mesmo
--     codigo).
-- ============================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_org_active
  ON public.products (org_id) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.check_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org_id uuid;
  v_plan_id uuid;
  v_max integer;
  v_count integer;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    -- No UPDATE, so reage quando archived_at de fato mudou. Arquivar
    -- (NULL -> NOT NULL) nunca bloqueia; so reativar (NOT NULL -> NULL)
    -- passa pela checagem de limite abaixo.
    IF TG_OP = 'UPDATE' THEN
      IF NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN
        RETURN NEW;
      END IF;
      IF NEW.archived_at IS NOT NULL THEN
        RETURN NEW; -- arquivando
      END IF;
      -- reativando (cai no check abaixo)
    END IF;

    v_org_id := NEW.org_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    SELECT plan_id INTO v_plan_id FROM public.organizations WHERE id = v_org_id;
    IF v_plan_id IS NULL THEN RETURN NEW; END IF;

    SELECT max_products INTO v_max FROM public.saas_plan_limits WHERE plan_id = v_plan_id;
    IF v_max IS NULL THEN RETURN NEW; END IF;

    -- product_variants NAO conta aqui -- so produtos-pai (tabela products).
    -- Produtos arquivados tambem NAO contam.
    SELECT count(*) INTO v_count
    FROM public.products
    WHERE org_id = v_org_id AND archived_at IS NULL;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'LIMITE_PLANO:produtos:%', v_max;
    END IF;

  ELSIF TG_TABLE_NAME = 'profiles' THEN
    -- No UPDATE, so reage quando org_id de fato mudou (ex.:
    -- complete_store_onboarding vinculando o dono a org nova
    -- recem criada). set_updated_at e outros updates de profile
    -- que nao tocam org_id nao disparam a checagem.
    IF TG_OP = 'UPDATE' AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN
      RETURN NEW;
    END IF;

    v_org_id := NEW.org_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    SELECT plan_id INTO v_plan_id FROM public.organizations WHERE id = v_org_id;
    IF v_plan_id IS NULL THEN RETURN NEW; END IF;

    SELECT max_users INTO v_max FROM public.saas_plan_limits WHERE plan_id = v_plan_id;
    IF v_max IS NULL THEN RETURN NEW; END IF;

    -- O dono da loja CONTA no limite (Essencial = dono + 1 funcionario).
    SELECT count(*) INTO v_count
    FROM public.profiles
    WHERE org_id = v_org_id AND id IS DISTINCT FROM NEW.id;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'LIMITE_PLANO:usuarios:%', v_max;
    END IF;

  ELSIF TG_TABLE_NAME = 'cash_registers' THEN
    v_org_id := NEW.org_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    -- max_registers vive em organizations (override por cliente),
    -- NAO em saas_plan_limits -- essa tabela nao tem essa coluna.
    SELECT max_registers INTO v_max FROM public.organizations WHERE id = v_org_id;
    IF v_max IS NULL THEN RETURN NEW; END IF;

    SELECT count(*) INTO v_count FROM public.cash_registers WHERE org_id = v_org_id;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'LIMITE_PLANO:caixas:%', v_max;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_plan_limit_products ON public.products;
CREATE TRIGGER trg_check_plan_limit_products
  BEFORE INSERT OR UPDATE OF archived_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.check_plan_limit();
