-- ============================================================
-- White label (etapa banco/backend) — colunas de marca em
-- organizations, feature 'white_label' no plano Negocio, e RPC
-- publica get_org_branding_by_slug() pra resolver branding antes
-- do login (usada pela tela de login por slug, ainda nao
-- implementada no frontend).
-- ============================================================

-- (a) Novas colunas de branding em organizations.
-- slogan: sem limite rigido no banco -- o FRONTEND deve limitar a
-- ~60 caracteres na UI (nao enforced aqui de proposito, pra nao
-- travar dados legados/edicoes futuras via SQL).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS slogan text;

COMMENT ON COLUMN public.organizations.slogan IS
  'Frase curta de marca exibida no branding white label. Sem limite de tamanho no banco -- o frontend deve limitar a ~60 caracteres.';

-- (b) Feature 'white_label' habilitada apenas no plano "Negocio".
-- Confirmado no codigo (src/App.jsx, loadUserContext): saas_plan_features
-- e lida com `.eq('enabled', true)` e o array resultante e so as
-- feature_keys presentes -- ausencia de linha para um plano/feature
-- e tratada como desabilitada (equivalente a enabled=false). Por isso
-- NAO inserimos linhas enabled=false para os outros planos: omitir
-- basta.
INSERT INTO public.saas_plan_features (plan_id, feature_key, enabled)
SELECT sp.id, 'white_label', true
FROM public.saas_plans sp
WHERE sp.slug = 'negocio'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;

-- (c) RPC publica de resolucao de branding por slug.
-- Retorna SEMPRE exatamente 1 linha, com todos os campos preenchidos
-- (org ativa + plano com 'white_label' habilitada) ou todos os campos
-- NULL (qualquer outra situacao: slug inexistente, org inativa/bloqueada,
-- ou plano sem a feature). As duas situacoes de falha sao indistinguiveis
-- de proposito -- nao da pra descobrir por tentativa e erro se um slug
-- existe mas so nao tem o plano certo. Nenhum outro campo de
-- organizations (cnpj, phone, address, contact_email, whatsapp, etc.)
-- e exposto.
CREATE OR REPLACE FUNCTION public.get_org_branding_by_slug(p_slug text)
RETURNS TABLE (
  name text,
  logo_url text,
  theme_color text,
  secondary_color text,
  slogan text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_org_found boolean := false;
  v_feature_enabled boolean := false;
BEGIN
  SELECT * INTO v_org
  FROM public.organizations o
  WHERE o.slug = p_slug
    AND o.is_active = true
    AND o.access_status = 'ativo'
  LIMIT 1;

  v_org_found := FOUND;

  IF v_org_found AND v_org.plan_id IS NOT NULL THEN
    SELECT pf.enabled INTO v_feature_enabled
    FROM public.saas_plan_features pf
    WHERE pf.plan_id = v_org.plan_id
      AND pf.feature_key = 'white_label'
    LIMIT 1;
    v_feature_enabled := COALESCE(v_feature_enabled, false);
  END IF;

  IF v_org_found AND v_feature_enabled THEN
    RETURN QUERY SELECT v_org.name, v_org.logo_url, v_org.theme_color, v_org.secondary_color, v_org.slogan;
  ELSE
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
  END IF;
END;
$function$;

-- Acesso minimo e explicito: publico (PUBLIC) nao pode chamar por
-- default a partir de agora; so 'anon' pode (roda antes do login).
REVOKE ALL ON FUNCTION public.get_org_branding_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_branding_by_slug(text) TO anon;

-- (d) RLS de organizations: nenhuma mudanca necessaria. Verificado
-- manualmente (SET LOCAL ROLE anon; SELECT count(*) FROM organizations)
-- que a policy existente ja bloqueia SELECT direto para anon (0 linhas).
-- A RPC acima e SECURITY DEFINER e e a UNICA via de leitura de dado de
-- organizations liberada para anon.
