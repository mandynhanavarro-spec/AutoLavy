-- Etapa "Preco e historico":
--   1. permissao can_edit_prices ("Alterar precos");
--   2. travas no banco para preco (can_edit_prices) e cadastro de produto
--      (can_manage_products) em products e product_variants;
--   3. replace_product_variants passa a ATUALIZAR as variacoes (mesma
--      assinatura) em vez de apagar e recriar tudo;
--   4. historico de alteracoes (change_log), gerado so por trigger e imutavel.
--
-- Compativel com o site no ar (regra 12.1): hoje so quem tem
-- can_manage_products edita produto pela tela (admin e modelos com a
-- permissao), e admin tem as duas permissoes. Estoque continua livre
-- (venda, estorno e "adicionar itens" mexem nele).

-- 1. Permissao efetiva: uma regra so ------------------------------------------
-- Espelha src/core/hooks/usePermissions.js. O cargo garante o minimo e
-- profiles.permissions so acrescenta -- EXCETO can_edit_prices, em que o
-- valor salvo vence (da para negar a um gerente especifico); sem a chave,
-- vale o padrao do cargo (admin sim, gerente sim, operador nao). Admin e
-- superadmin sempre podem tudo.
CREATE OR REPLACE FUNCTION public.perm_effective(p_role public.user_role, p_perms jsonb, p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_role::text IN ('admin', 'superadmin') THEN true
    WHEN p_key = 'can_edit_prices'
      THEN COALESCE((p_perms->>p_key)::boolean, p_role::text = 'gerente')
    WHEN p_role::text = 'gerente'
      AND p_key IN ('can_edit_stock', 'can_open_cash', 'can_do_sangria', 'can_view_reports', 'can_close_cash')
      THEN true
    WHEN p_key IN ('can_open_cash', 'can_do_sangria') THEN true
    ELSE COALESCE((p_perms->>p_key)::boolean, false)
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.perm_effective(public.user_role, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perm_effective(public.user_role, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT public.perm_effective(p.role, p.permissions, p_key)
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), false);
$function$;

-- Modelos de cargo globais ganham a chave nova
UPDATE public.role_templates
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || jsonb_build_object('can_edit_prices', base_role::text IN ('admin', 'gerente'))
WHERE org_id IS NULL AND NOT (COALESCE(permissions, '{}'::jsonb) ? 'can_edit_prices');

-- 2. Travas em products e product_variants -----------------------------------
-- Colunas livres (outras telas gravam para operador/gerente): estoque e
-- favorito. Preco/custo: can_edit_prices. O resto do cadastro:
-- can_manage_products. Servidor e superadmin isentos.
CREATE OR REPLACE FUNCTION public.products_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_free  text[] := ARRAY['stock_quantity', 'is_favorite'];
  v_price text[] := ARRAY['price', 'cost_price'];
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
     OR public.is_superadmin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    IF NOT public.has_permission('can_manage_products') THEN
      RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
  END IF;

  IF (NEW.price IS DISTINCT FROM OLD.price OR NEW.cost_price IS DISTINCT FROM OLD.cost_price)
     AND NOT public.has_permission('can_edit_prices') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRECO';
  END IF;

  IF (to_jsonb(NEW) - v_free - v_price) IS DISTINCT FROM (to_jsonb(OLD) - v_free - v_price)
     AND NOT public.has_permission('can_manage_products') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.products_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_guard ON public.products;
CREATE TRIGGER trg_products_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_guard();

CREATE OR REPLACE FUNCTION public.product_variants_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_free  text[] := ARRAY['stock_quantity'];
  v_price text[] := ARRAY['price_override'];
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
     OR public.is_superadmin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    IF NOT public.has_permission('can_manage_products') THEN
      RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
  END IF;

  IF NEW.price_override IS DISTINCT FROM OLD.price_override
     AND NOT public.has_permission('can_edit_prices') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRECO';
  END IF;

  IF (to_jsonb(NEW) - v_free - v_price) IS DISTINCT FROM (to_jsonb(OLD) - v_free - v_price)
     AND NOT public.has_permission('can_manage_products') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_PRODUTOS';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.product_variants_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_guard ON public.product_variants;
CREATE TRIGGER trg_product_variants_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.product_variants_guard();

-- 3. replace_product_variants por atualizacao (mesma assinatura) ------------
-- Casa cada linha pelo id da variacao (frontend novo envia) ou, sem id, pelos
-- atributos (site antigo). Atributo mudou = remove + cria. Ordem: remove as
-- que sairam, atualiza as que ficaram, cria as novas -- tudo numa transacao
-- (se algo falhar, nada muda). Codigo de barras duplicado continua barrado
-- pelos triggers/indice; a loja vem do proprio produto (RLS).
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
  v_org_id  uuid;
  v_elem    jsonb;
  v_attrs   jsonb;
  v_id      uuid;
  v_keep    uuid[] := '{}';
  v_plan    jsonb  := '[]'::jsonb;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'PRODUTO_INVALIDO';
  END IF;

  -- 1) casar cada linha com uma variacao existente
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb)) LOOP
    v_attrs := (v_elem->>'attributes')::jsonb;
    v_id := NULL;

    IF NULLIF(v_elem->>'id', '') IS NOT NULL THEN
      SELECT pv.id INTO v_id
      FROM public.product_variants pv
      WHERE pv.id = (v_elem->>'id')::uuid
        AND pv.product_id = p_product_id
        AND pv.org_id = v_org_id
        AND pv.attributes = v_attrs           -- atributo mudou = remove + cria
        AND NOT (pv.id = ANY (v_keep));
    ELSE
      SELECT pv.id INTO v_id
      FROM public.product_variants pv
      WHERE pv.product_id = p_product_id
        AND pv.org_id = v_org_id
        AND pv.attributes = v_attrs
        AND NOT (pv.id = ANY (v_keep))
      ORDER BY pv.created_at
      LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
      v_keep := v_keep || v_id;
    END IF;
    v_plan := v_plan || jsonb_build_array(v_elem || jsonb_build_object('_match', v_id));
  END LOOP;

  -- 2) remove as que sairam
  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND org_id = v_org_id
    AND NOT (id = ANY (v_keep));

  -- 3) atualiza as que ficaram e 4) cria as novas
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF v_elem->>'_match' IS NOT NULL THEN
      UPDATE public.product_variants
      SET attributes     = (v_elem->>'attributes')::jsonb,
          stock_quantity = NULLIF(v_elem->>'stock_quantity', '')::integer,
          price_override = NULLIF(v_elem->>'price_override', '')::numeric,
          sku_variant    = NULLIF(v_elem->>'sku_variant', ''),
          is_active      = true
      WHERE id = (v_elem->>'_match')::uuid;
    ELSE
      INSERT INTO public.product_variants (
        org_id, product_id, attributes, stock_quantity, price_override, sku_variant, is_active
      ) VALUES (
        v_org_id,
        p_product_id,
        (v_elem->>'attributes')::jsonb,
        NULLIF(v_elem->>'stock_quantity', '')::integer,
        NULLIF(v_elem->>'price_override', '')::numeric,
        NULLIF(v_elem->>'sku_variant', ''),
        true
      );
    END IF;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_product_variants(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_product_variants(uuid, jsonb) TO authenticated;

-- 4. Historico de alteracoes (change_log) ------------------------------------
-- Uma linha por campo que realmente mudou. Nomes gravados como estavam no
-- momento. user_id nulo = Sistema (servidor). So trigger escreve; leitura so
-- admin da propria loja e superadmin.
CREATE TABLE IF NOT EXISTS public.change_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id      uuid,
  user_name    text NOT NULL,
  entity       text NOT NULL CHECK (entity IN ('produto', 'variacao', 'funcionario')),
  entity_id    uuid,
  entity_name  text,
  field        text NOT NULL,
  old_value    text,
  new_value    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_log_org_created ON public.change_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_org_entity ON public.change_log (org_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_log_org_user ON public.change_log (org_id, user_id);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_log_select ON public.change_log
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin' AND p.org_id = change_log.org_id
    )
  );

REVOKE ALL ON public.change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_log TO authenticated;

-- grava uma linha (so chamada pelos triggers de log, que sao DEFINER)
CREATE OR REPLACE FUNCTION public.change_log_add(
  p_org_id uuid, p_entity text, p_entity_id uuid, p_entity_name text,
  p_field text, p_old text, p_new text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN;
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  END IF;
  INSERT INTO public.change_log (org_id, user_id, user_name, entity, entity_id, entity_name, field, old_value, new_value)
  VALUES (
    p_org_id, v_uid,
    CASE WHEN v_uid IS NULL THEN 'Sistema' ELSE COALESCE(NULLIF(v_name, ''), 'Usuário') END,
    p_entity, p_entity_id, p_entity_name, p_field, p_old, p_new
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.change_log_add(uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_product_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.change_log_add(NEW.org_id, 'produto', NEW.id, NEW.name, 'criado', NULL, NEW.price::text);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.change_log_add(OLD.org_id, 'produto', OLD.id, OLD.name, 'excluido', OLD.price::text, NULL);
  ELSE
    IF NEW.price IS DISTINCT FROM OLD.price THEN
      PERFORM public.change_log_add(NEW.org_id, 'produto', NEW.id, NEW.name, 'preco', OLD.price::text, NEW.price::text);
    END IF;
    IF NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
      PERFORM public.change_log_add(NEW.org_id, 'produto', NEW.id, NEW.name, 'custo', OLD.cost_price::text, NEW.cost_price::text);
    END IF;
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
      PERFORM public.change_log_add(NEW.org_id, 'produto', NEW.id, NEW.name, 'arquivado', NULL, NULL);
    ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
      PERFORM public.change_log_add(NEW.org_id, 'produto', NEW.id, NEW.name, 'reativado', NULL, NULL);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_product_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_product_changes ON public.products;
CREATE TRIGGER trg_log_product_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_changes();

CREATE OR REPLACE FUNCTION public.log_variant_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row  public.product_variants;
  v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  -- nome "Produto · P · 10un" como esta agora; sem produto (excluido junto,
  -- em cascata) nao registra: a exclusao do produto ja foi registrada
  SELECT p.name || COALESCE(' · ' || (
           SELECT string_agg(value, ' · ') FROM jsonb_each_text(v_row.attributes) WHERE value <> ''
         ), '')
  INTO v_name
  FROM public.products p WHERE p.id = v_row.product_id;
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.change_log_add(NEW.org_id, 'variacao', NEW.id, v_name, 'criado', NULL, NEW.price_override::text);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.change_log_add(OLD.org_id, 'variacao', OLD.id, v_name, 'excluido', OLD.price_override::text, NULL);
  ELSIF NEW.price_override IS DISTINCT FROM OLD.price_override THEN
    PERFORM public.change_log_add(NEW.org_id, 'variacao', NEW.id, v_name, 'preco', OLD.price_override::text, NEW.price_override::text);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_variant_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_variant_changes ON public.product_variants;
CREATE TRIGGER trg_log_variant_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.log_variant_changes();

-- Funcionario: cargo, situacao e cada permissao cuja regra efetiva mudou
-- (comparada no mesmo cargo, para registrar so o que foi mexido)
CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
  v_old boolean;
  v_new boolean;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.change_log_add(NEW.org_id, 'funcionario', NEW.id, NEW.full_name, 'cargo', OLD.role::text, NEW.role::text);
  END IF;
  IF NEW.access_status IS DISTINCT FROM OLD.access_status THEN
    PERFORM public.change_log_add(NEW.org_id, 'funcionario', NEW.id, NEW.full_name, 'situacao', OLD.access_status::text, NEW.access_status::text);
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    FOR v_key IN
      SELECT k FROM jsonb_object_keys(COALESCE(OLD.permissions, '{}'::jsonb)) AS k
      UNION
      SELECT k FROM jsonb_object_keys(COALESCE(NEW.permissions, '{}'::jsonb)) AS k
    LOOP
      v_old := public.perm_effective(NEW.role, OLD.permissions, v_key);
      v_new := public.perm_effective(NEW.role, NEW.permissions, v_key);
      IF v_old IS DISTINCT FROM v_new THEN
        PERFORM public.change_log_add(NEW.org_id, 'funcionario', NEW.id, NEW.full_name,
          'permissao:' || v_key, CASE WHEN v_old THEN 'sim' ELSE 'nao' END, CASE WHEN v_new THEN 'sim' ELSE 'nao' END);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_profile_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_profile_changes ON public.profiles;
CREATE TRIGGER trg_log_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_changes();
