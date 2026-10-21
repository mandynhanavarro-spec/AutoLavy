-- organizations: so o admin da propria loja altera, e so as colunas que as
-- telas da loja gravam. Plano, limites, status, slug, produto e segmento:
-- so superadmin ou servidor.
--
-- Antes: a policy organizations_update_own_or_superadmin (id =
-- get_my_org_id()) somava com "Org update" (admin/gerente) e deixava
-- QUALQUER funcionario alterar a propria loja inteira -- inclusive trocar
-- plan_id (modulos pagos) e max_registers.
--
-- Colunas que o app grava fora do SuperAdmin (lista permitida ao admin):
--   Configuracoes (dados da loja): name, phone, cnpj, address,
--     contact_email, whatsapp
--   Configuracoes: grade_config, min_stock_alert
--   WhiteLabelSection: logo_url, theme_color, secondary_color, slogan
--   Onboarding: onboarding_completed
--   (updated_at: trigger)
-- Qualquer coluna nova fica protegida por padrao (lista de permitidas, nao
-- de proibidas).
--
-- Contexto confiavel (current_user postgres/service_role/...): funcoes
-- SECURITY DEFINER (complete_store_onboarding, set_subscription_status) e
-- edge functions. Retrocompativel: as telas da loja ja so liberam isso ao
-- admin (Configuracoes); a marca era liberada ao gerente e deixa de ser
-- (WhiteLabelSection ajustada no mesmo commit).

CREATE OR REPLACE FUNCTION public.organizations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed text[] := ARRAY[
    'name', 'phone', 'cnpj', 'address', 'contact_email', 'whatsapp',
    'grade_config', 'min_stock_alert',
    'logo_url', 'theme_color', 'secondary_color', 'slogan',
    'onboarding_completed', 'updated_at'
  ];
  v_role public.user_role;
  v_org  uuid;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
     OR public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  SELECT role, org_id INTO v_role, v_org
  FROM public.profiles WHERE id = auth.uid();

  IF v_role IS DISTINCT FROM 'admin' OR v_org IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'LOJA_SEM_PERMISSAO';
  END IF;

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'LOJA_CAMPO_PROTEGIDO';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.organizations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_organizations_guard ON public.organizations;
CREATE TRIGGER trg_organizations_guard
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_guard();

-- Policies por comando (saem as duplicadas e a permissiva)
DROP POLICY IF EXISTS "Org delete superadmin" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_superadmin" ON public.organizations;
DROP POLICY IF EXISTS "Org insert superadmin" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_superadmin" ON public.organizations;
DROP POLICY IF EXISTS "Org isolation" ON public.organizations;
DROP POLICY IF EXISTS "Org select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_own_or_superadmin" ON public.organizations;
DROP POLICY IF EXISTS "Org update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_own_or_superadmin" ON public.organizations;

CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_my_org_id() OR public.is_superadmin());

-- quem pode TENTAR; cargo e colunas sao decididos pelo trigger
CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY organizations_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY organizations_delete ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organizations FROM anon;
REVOKE TRUNCATE ON public.organizations FROM authenticated;
