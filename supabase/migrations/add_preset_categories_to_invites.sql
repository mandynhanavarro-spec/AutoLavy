-- ============================================================
-- Categorias pré-configuradas no convite de cadastro
-- Execute INTEIRO no Supabase SQL Editor antes de testar
-- ============================================================

-- 1. Adicionar coluna preset_categories em store_invites
ALTER TABLE public.store_invites
  ADD COLUMN IF NOT EXISTS preset_categories JSONB DEFAULT '[]'::jsonb;

-- 2. Atualizar RPC complete_store_onboarding para criar as categorias
--    automaticamente quando o cliente completa o /registrar
CREATE OR REPLACE FUNCTION public.complete_store_onboarding(
  invite_token TEXT,
  user_id UUID,
  p_cnpj TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_theme_color TEXT DEFAULT '#3b82f6'
)
RETURNS VOID AS $$
DECLARE
  v_invite public.store_invites;
  v_org_id UUID;
  v_plan_id UUID;
  v_plan_price DECIMAL(10,2);
  v_slug TEXT;
BEGIN
  SELECT *
  INTO v_invite
  FROM public.store_invites
  WHERE token = invite_token
    AND is_used = FALSE
    AND expires_at > NOW();

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
    name, slug, cnpj, phone, address, theme_color,
    plan_type, max_registers, product_id,
    responsible_name, contact_email, whatsapp, notes,
    customer_status, access_status, plan_id
  )
  VALUES (
    v_invite.store_name,
    v_slug,
    COALESCE(v_invite.company_document, p_cnpj),
    COALESCE(v_invite.whatsapp, p_phone),
    COALESCE(v_invite.address, p_address),
    p_theme_color,
    COALESCE(v_invite.plan_type, 'basic'),
    COALESCE(v_invite.max_registers, 1),
    COALESCE(v_invite.product_id, 'loja'),
    v_invite.responsible_name,
    COALESCE(v_invite.contact_email, v_invite.login_email),
    v_invite.whatsapp,
    v_invite.notes,
    'ativo',
    'ativo',
    v_plan_id
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
  WHERE id = user_id;

  INSERT INTO public.cash_registers (org_id, name, description, is_active)
  VALUES (v_org_id, 'Caixa Principal', 'Caixa criado automaticamente no onboarding.', TRUE);

  INSERT INTO public.saas_subscriptions (
    organization_id, plan_id, billing_amount,
    due_date, payment_status, status
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

  -- Criar categorias pré-configuradas pelo superadmin no convite
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_store_onboarding(TEXT, UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
