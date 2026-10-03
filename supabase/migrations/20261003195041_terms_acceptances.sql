-- ============================================================
-- Aceite versionado dos Termos de Uso / Politica de Privacidade.
--
-- (a) Tabela terms_acceptances -- um registro por aceite (cadastro
--     inicial, ou re-aceite quando a versao muda). Nunca e
--     atualizada nem apagada -- historico imutavel.
-- (b) RLS: usuario le/insere so os proprios registros; superadmin
--     le todos; ninguem faz UPDATE/DELETE (sem policy pra esses
--     comandos -- RLS nega por padrao).
-- (c) complete_store_onboarding passa a receber p_terms_version,
--     p_privacy_version e p_user_agent, e grava o aceite NA MESMA
--     TRANSACAO da criacao da organizacao -- cadastro sem aceite
--     nao pode existir (RAISE EXCEPTION se vierem nulos).
-- ============================================================

CREATE TABLE public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);

CREATE INDEX idx_terms_acceptances_user_id ON public.terms_acceptances (user_id);
CREATE INDEX idx_terms_acceptances_org_id ON public.terms_acceptances (org_id);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

-- So le os proprios registros; superadmin le todos.
CREATE POLICY terms_acceptances_select ON public.terms_acceptances
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_superadmin());

-- So insere pra si mesmo (o fluxo normal -- onboarding -- insere via
-- complete_store_onboarding, que e SECURITY DEFINER e por isso
-- ignora RLS; esta policy cobre o insert direto do modal de
-- "nova versao" feito pelo proprio usuario logado).
CREATE POLICY terms_acceptances_insert ON public.terms_acceptances
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Nenhuma policy de UPDATE/DELETE de proposito -- RLS nega por
-- padrao quando nao ha policy pro comando. Historico imutavel.

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;

-- ------------------------------------------------------------
-- complete_store_onboarding: + p_terms_version, p_privacy_version,
-- p_user_agent (todos obrigatorios de fato -- DEFAULT NULL so pra
-- nao quebrar a regra de sintaxe do Postgres de nao poder ter
-- parametro sem default depois de um que tem; a obrigatoriedade
-- real e forcada pelo RAISE EXCEPTION logo no inicio).
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.complete_store_onboarding(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.complete_store_onboarding(
  invite_token text,
  p_cnpj text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_theme_color text DEFAULT '#3b82f6'::text,
  p_terms_version text DEFAULT NULL::text,
  p_privacy_version text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
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

  -- Cadastro sem aceite dos termos nao pode existir.
  IF p_terms_version IS NULL OR p_privacy_version IS NULL THEN
    RAISE EXCEPTION 'TERMOS_NAO_ACEITOS';
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

  -- Aceite dos termos, na MESMA transacao -- se qualquer passo
  -- seguinte falhar, o aceite tambem e revertido junto.
  INSERT INTO public.terms_acceptances (user_id, org_id, terms_version, privacy_version, user_agent)
  VALUES (v_user_id, v_org_id, p_terms_version, p_privacy_version, p_user_agent);

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

REVOKE EXECUTE ON FUNCTION public.complete_store_onboarding(text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_store_onboarding(text, text, text, text, text, text, text, text) TO authenticated;
