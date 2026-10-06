-- PREP-1: convite passa a guardar os segmentos escolhidos (ate entao só
-- existiam no clientForm e eram descartados no insert). preset_categories
-- passa a aceitar tanto o formato antigo (array de strings) quanto o novo
-- (array de objetos {name, segment_id}), pra loja com varios segmentos
-- saber a qual categoria pertence cada um.
ALTER TABLE public.store_invites
  ADD COLUMN IF NOT EXISTS preset_segments jsonb DEFAULT '[]'::jsonb;

-- Limite de caixas por plano (ate aqui nao existia nenhuma fonte de
-- verdade por plano -- o frontend reaproveitava max_users por engano).
ALTER TABLE public.saas_plan_limits
  ADD COLUMN IF NOT EXISTS max_registers integer DEFAULT 1;

UPDATE public.saas_plan_limits pl
SET max_registers = CASE p.slug
  WHEN 'essencial'    THEN 1
  WHEN 'profissional' THEN 2
  WHEN 'negocio'      THEN 5
  ELSE 1
END
FROM public.saas_plans p
WHERE p.id = pl.plan_id;

-- Loja Teste (e4e8e6b1...) criada durante os testes de PREP-1/2 -- corrige
-- o max_registers errado (2, herdado do bug de max_users) para 1.
UPDATE public.organizations
SET max_registers = 1
WHERE id = 'e4e8e6b1-d189-4cf6-a7ef-acb2f7d9985c';

CREATE OR REPLACE FUNCTION public.complete_store_onboarding(invite_token text, p_cnpj text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_theme_color text DEFAULT '#3b82f6'::text, p_terms_version text DEFAULT NULL::text, p_privacy_version text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_existing_org_id UUID;
  v_invite public.store_invites;
  v_org_id UUID;
  v_plan_id UUID;
  v_plan_price DECIMAL(10,2);
  v_slug TEXT;
  v_trial_days integer;
  v_due_date date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  IF p_terms_version IS NULL OR p_privacy_version IS NULL THEN
    RAISE EXCEPTION 'TERMOS_NAO_ACEITOS';
  END IF;

  SELECT org_id INTO v_existing_org_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'USUARIO_JA_VINCULADO';
  END IF;

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

  SELECT COALESCE(trial_days, 15) INTO v_trial_days
  FROM public.saas_billing_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
  v_trial_days := COALESCE(v_trial_days, 15);
  v_due_date := CURRENT_DATE + v_trial_days;

  v_slug := public.slugify(v_invite.store_name);

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6);
  END IF;

  INSERT INTO public.organizations (
    name, slug, cnpj, phone, address, theme_color, plan_type,
    max_registers, product_id, responsible_name, contact_email,
    whatsapp, notes, customer_status, access_status, plan_id,
    segment
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
    'ativo', 'ativo', v_plan_id,
    COALESCE(v_invite.preset_segments->>0, 'geral')
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

  INSERT INTO public.terms_acceptances (user_id, org_id, terms_version, privacy_version, user_agent)
  VALUES (v_user_id, v_org_id, p_terms_version, p_privacy_version, p_user_agent);

  INSERT INTO public.cash_registers (org_id, name, description, is_active)
  VALUES (v_org_id, 'Caixa Principal', 'Caixa criado automaticamente no onboarding.', TRUE);

  INSERT INTO public.saas_subscriptions (
    organization_id, plan_id, billing_amount, due_date, trial_ends_at,
    billing_cycle, billing_day, payment_status, status
  )
  VALUES (
    v_org_id, v_plan_id, COALESCE(v_plan_price, 0),
    v_due_date,
    CASE WHEN v_trial_days > 0 THEN (v_due_date::timestamptz + INTERVAL '23 hours 59 minutes 59 seconds') ELSE NULL END,
    'mensal', EXTRACT(DAY FROM v_due_date)::int,
    'pendente', 'ativa'
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    billing_amount = EXCLUDED.billing_amount,
    due_date = EXCLUDED.due_date,
    trial_ends_at = EXCLUDED.trial_ends_at,
    billing_cycle = EXCLUDED.billing_cycle,
    billing_day = EXCLUDED.billing_day,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    updated_at = NOW();

  -- Segmentos escolhidos no convite (PREP-1): replica em organization_segments
  -- (mesma tabela que a edicao de loja ativa ja usa em ClientesTab).
  IF v_invite.preset_segments IS NOT NULL
     AND jsonb_array_length(v_invite.preset_segments) > 0 THEN
    INSERT INTO public.organization_segments (org_id, segment_id)
    SELECT v_org_id, seg
    FROM jsonb_array_elements_text(v_invite.preset_segments) AS seg;
  END IF;

  -- Categorias do convite (PREP-1): aceita formato antigo (string) e novo
  -- ({name, segment_id}), pra loja com varios segmentos saber a qual
  -- categoria cada item pertence. Texto solto cai no primeiro segmento
  -- escolhido (ou fica sem segmento, se nenhum foi escolhido).
  IF v_invite.preset_categories IS NOT NULL
     AND jsonb_array_length(v_invite.preset_categories) > 0 THEN
    INSERT INTO public.categories (org_id, name, segment_id)
    SELECT
      v_org_id,
      CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'name' ELSE elem#>>'{}' END,
      CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'segment_id' ELSE v_invite.preset_segments->>0 END
    FROM jsonb_array_elements(v_invite.preset_categories) AS elem
    WHERE trim(CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'name' ELSE elem#>>'{}' END) <> '';
  END IF;

  UPDATE public.store_invites
  SET is_used = TRUE, updated_at = NOW()
  WHERE id = v_invite.id;
END;
$function$;
