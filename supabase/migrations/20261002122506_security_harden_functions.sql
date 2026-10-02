-- ============================================================
-- Hardening de segurança nas funções públicas (SECURITY DEFINER
-- e triggers). Contexto completo no relatório da Fase 0 desta
-- sessão. Resumo do que muda:
--
-- 1) complete_store_onboarding tinha 2 overloads. A de 6
--    parametros (que recebia user_id) confiava nesse parametro
--    sem checar se batia com quem estava chamando -- qualquer
--    portador de um invite_token valido podia sequestrar o
--    profile de OUTRO usuario (promove-lo a admin da org nova).
--    Essa era a versao realmente usada pelo frontend
--    (src/core/pages/Register/index.jsx). A outra overload (5
--    parametros, sem user_id) fazia a coisa certa (usava
--    auth.uid()) mas nao era chamada por ningum -- codigo morto.
--    Correcao: fundir as duas em UMA funcao de 5 parametros que
--    usa auth.uid() internamente, nunca um parametro. A versao
--    de 6 parametros e dropada.
--
-- 2) validate_invite era uma duplicata morta de
--    get_invite_by_token (nunca migrada no frontend, conforme
--    CHECKUP_TECNICO.md). Dropada.
--
-- 3) search_path fixo em todas as funcoes publicas (linter
--    function_search_path_mutable) -- protege contra
--    search_path hijacking em SECURITY DEFINER.
--
-- 4) Grants: Supabase concede EXECUTE via PUBLIC por padrao, o
--    que nao basta revogar so de anon/authenticated. Revogamos
--    de PUBLIC + anon + authenticated e reconcedemos so o
--    necessario:
--      - antes do login (convite, branding por slug): anon
--      - pos-login / usadas em RLS: authenticated
--      - trigger / event trigger / helper interno: nenhum grant
-- ============================================================


-- ------------------------------------------------------------
-- (1) search_path fixo nas funcoes que NAO estao sendo
--     recriadas nesta migration (complete_store_onboarding e
--     tratada abaixo, no bloco que a recria).
-- ------------------------------------------------------------

ALTER FUNCTION public.get_invite_by_token(text)      SET search_path = public, pg_temp;
ALTER FUNCTION public.get_org_branding_by_slug(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_org_id()                SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_registers()             SET search_path = public, pg_temp;
ALTER FUNCTION public.is_superadmin()                SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()              SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()               SET search_path = public, pg_temp;
ALTER FUNCTION public.slugify(text)                  SET search_path = public, pg_temp;
-- rls_auto_enable() ja tem search_path = pg_catalog (correto pro que ela faz
-- -- le pg_event_trigger_ddl_commands(), que vive em pg_catalog) -- nao precisa mudar.


-- ------------------------------------------------------------
-- (2) validate_invite: morta, duplicada de get_invite_by_token.
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.validate_invite(text);


-- ------------------------------------------------------------
-- (3) complete_store_onboarding: funde as duas overloads em
--     uma so, com auth.uid() como unica fonte de identidade.
-- ------------------------------------------------------------

-- Remove a overload vulneravel (6 parametros, confiava em user_id).
DROP FUNCTION IF EXISTS public.complete_store_onboarding(text, uuid, text, text, text, text);

-- Recria a overload de 5 parametros com o corpo real (antes so
-- delegava pra overload de 6; agora faz tudo e usa auth.uid()).
CREATE OR REPLACE FUNCTION public.complete_store_onboarding(
  invite_token text,
  p_cnpj text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_theme_color text DEFAULT '#3b82f6'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id UUID;
  v_existing_org_id UUID;
  v_invite public.store_invites;
  v_org_id UUID;
  v_plan_id UUID;
  v_plan_price DECIMAL(10,2);
  v_slug TEXT;
BEGIN
  -- Identidade vem SEMPRE da sessao autenticada, nunca de parametro.
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  -- Impede reaproveitar um convite pra trocar de loja / virar admin
  -- de outra organizacao se o usuario ja estiver vinculado a uma.
  SELECT org_id INTO v_existing_org_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'USUARIO_JA_VINCULADO';
  END IF;

  -- Trava a linha do convite pra evitar corrida entre duas chamadas
  -- concorrentes com o mesmo token (dupla criacao de organizacao).
  SELECT *
  INTO v_invite
  FROM public.store_invites
  WHERE token = invite_token
    AND is_used = FALSE
    AND expires_at > NOW()
    AND cancelled_at IS NULL
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Convite invalido ou expirado';
  END IF;

  SELECT id, price
  INTO v_plan_id, v_plan_price
  FROM public.saas_plans
  WHERE slug = COALESCE(v_invite.plan_type, 'basic')
  ORDER BY created_at ASC
  LIMIT 1;

  v_slug := public.slugify(v_invite.store_name);

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6);
  END IF;

  INSERT INTO public.organizations (
    name, slug, cnpj, phone, address, theme_color, plan_type,
    max_registers, product_id, responsible_name, contact_email,
    whatsapp, notes, customer_status, access_status, plan_id
  )
  VALUES (
    v_invite.store_name, v_slug,
    COALESCE(v_invite.company_document, p_cnpj),
    COALESCE(v_invite.whatsapp, p_phone),
    COALESCE(v_invite.address, p_address),
    p_theme_color,
    COALESCE(v_invite.plan_type, 'basic'),
    COALESCE(v_invite.max_registers, 1),
    COALESCE(v_invite.product_id, 'loja'),
    v_invite.responsible_name,
    COALESCE(v_invite.contact_email, v_invite.login_email),
    v_invite.whatsapp, v_invite.notes,
    'ativo', 'ativo', v_plan_id
  )
  RETURNING id INTO v_org_id;

  UPDATE public.profiles
  SET
    org_id = v_org_id,
    role = 'admin',
    full_name = COALESCE(NULLIF(full_name, ''), v_invite.responsible_name),
    phone = COALESCE(p_phone, v_invite.whatsapp, phone),
    access_status = 'ativo',
    updated_at = NOW()
  WHERE id = v_user_id;

  INSERT INTO public.cash_registers (org_id, name, description, is_active)
  VALUES (v_org_id, 'Caixa Principal', 'Caixa criado automaticamente no onboarding.', TRUE);

  INSERT INTO public.saas_subscriptions (
    organization_id, plan_id, billing_amount, due_date, payment_status, status
  )
  VALUES (
    v_org_id, v_plan_id, COALESCE(v_plan_price, 0),
    CURRENT_DATE + 30, 'pendente', 'ativa'
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    billing_amount = EXCLUDED.billing_amount,
    due_date = EXCLUDED.due_date,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    updated_at = NOW();

  -- Categorias pre-definidas pelo SuperAdmin no convite.
  IF v_invite.preset_categories IS NOT NULL
     AND jsonb_array_length(v_invite.preset_categories) > 0 THEN
    INSERT INTO public.categories (org_id, name)
    SELECT v_org_id, cat_name
    FROM jsonb_array_elements_text(v_invite.preset_categories) AS cat_name
    WHERE trim(cat_name) <> '';
  END IF;

  UPDATE public.store_invites
  SET is_used = TRUE, updated_at = NOW()
  WHERE id = v_invite.id;
END;
$function$;


-- ------------------------------------------------------------
-- (4) Grants: revoga de PUBLIC + anon + authenticated primeiro
--     (Supabase concede via PUBLIC por padrao), depois reconcede
--     so o necessario.
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_invite_by_token(text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_org_branding_by_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_store_onboarding(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_org_id()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_superadmin()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_registers()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.slugify(text)       FROM PUBLIC, anon, authenticated;

-- Usadas antes do login (tela de convite, tela de login por slug):
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_branding_by_slug(text) TO anon, authenticated;

-- Chamada so depois que ja existe sessao autenticada (signUp/signIn
-- acontecem antes, no fluxo de Register) + usadas em RLS/pos-login:
GRANT EXECUTE ON FUNCTION public.complete_store_onboarding(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_org_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_registers() TO authenticated;

-- handle_new_user, rls_auto_enable, set_updated_at, slugify: nenhum
-- grant pra anon/authenticated. Disparam via trigger/event trigger
-- (nao exigem EXECUTE de quem gerou o evento) ou sao usadas so
-- internamente por outra SECURITY DEFINER dona (postgres), que tem
-- EXECUTE implicito nas proprias funcoes independente de GRANT.
