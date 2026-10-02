-- ============================================================
-- Limites de plano aplicados no banco (trigger), nao so na UI.
--
-- (a) Ajuste do plano Essencial: max_users 1 -> 2 (dono + 1
--     funcionario). Profissional (5) e Negocio (10) ficam como
--     estao.
--
-- (b) Funcao check_plan_limit() -- um unico trigger function
--     usado por 3 triggers BEFORE (products, profiles,
--     cash_registers), branch por TG_TABLE_NAME. Fonte de
--     verdade: organizations.plan_id -> saas_plan_limits
--     (organizations.plan_type e legado, ignorado aqui).
--
--     cash_registers e um caso a parte: max_registers NAO existe
--     em saas_plan_limits -- e um override por organizacao
--     (coluna organizations.max_registers, default 1, ajustavel
--     pelo SuperAdmin por cliente). Mantido assim de proposito
--     (ver relatorio da Fase 0/2).
--
--     Regra geral de "nao bloquear": org sem plan_id, plano sem
--     limite cadastrado em saas_plan_limits, ou (cash_registers)
--     organizations.max_registers NULL -- em qualquer desses
--     casos a checagem e pulada (permite o insert).
--
--     Erro: RAISE EXCEPTION 'LIMITE_PLANO:<recurso>:<limite>'
--     (recursos: produtos, usuarios, caixas) -- o frontend
--     (src/shared/lib/planLimitError.js) reconhece esse padrao e
--     traduz pra linguagem simples.
-- ============================================================

-- (a) Ajuste do plano Essencial.
UPDATE public.saas_plan_limits pl
SET max_users = 2, updated_at = now()
FROM public.saas_plans sp
WHERE pl.plan_id = sp.id AND sp.slug = 'essencial';

-- (b) Funcao de enforcement.
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
    v_org_id := NEW.org_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    SELECT plan_id INTO v_plan_id FROM public.organizations WHERE id = v_org_id;
    IF v_plan_id IS NULL THEN RETURN NEW; END IF;

    SELECT max_products INTO v_max FROM public.saas_plan_limits WHERE plan_id = v_plan_id;
    IF v_max IS NULL THEN RETURN NEW; END IF;

    -- product_variants NAO conta aqui -- so produtos-pai (tabela products).
    SELECT count(*) INTO v_count FROM public.products WHERE org_id = v_org_id;
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

REVOKE EXECUTE ON FUNCTION public.check_plan_limit() FROM PUBLIC, anon, authenticated;

-- (c) Triggers.
DROP TRIGGER IF EXISTS trg_check_plan_limit_products ON public.products;
CREATE TRIGGER trg_check_plan_limit_products
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.check_plan_limit();

DROP TRIGGER IF EXISTS trg_check_plan_limit_profiles ON public.profiles;
CREATE TRIGGER trg_check_plan_limit_profiles
  BEFORE INSERT OR UPDATE OF org_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_plan_limit();

DROP TRIGGER IF EXISTS trg_check_plan_limit_cash_registers ON public.cash_registers;
CREATE TRIGGER trg_check_plan_limit_cash_registers
  BEFORE INSERT ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.check_plan_limit();
