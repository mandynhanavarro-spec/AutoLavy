-- ============================================================
-- Ciclo de cobranca (mensal/anual) e dia preferido de vencimento.
-- Migration aditiva, retrocompativel (secao 12.1): nenhuma funcao
-- muda de assinatura, so de comportamento interno.
-- ============================================================

-- ------------------------------------------------------------
-- 1. saas_subscriptions: + billing_cycle, billing_day.
--    Backfill: billing_day = dia do vencimento atual (ou do fim
--    do teste, se nao houver vencimento gravado).
-- ------------------------------------------------------------
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'mensal'
    CHECK (billing_cycle IN ('mensal', 'anual')),
  ADD COLUMN IF NOT EXISTS billing_day integer
    CHECK (billing_day IS NULL OR (billing_day BETWEEN 1 AND 31));

UPDATE public.saas_subscriptions
SET billing_day = EXTRACT(DAY FROM COALESCE(due_date, trial_ends_at::date))::int
WHERE billing_day IS NULL
  AND COALESCE(due_date, trial_ends_at::date) IS NOT NULL;

-- ------------------------------------------------------------
-- 2. saas_billing_settings: + trial_days, annual_months_charged.
-- ------------------------------------------------------------
ALTER TABLE public.saas_billing_settings
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS annual_months_charged integer NOT NULL DEFAULT 10;

-- ------------------------------------------------------------
-- 3. next_due_date: unica fonte do calculo de proximo vencimento.
--    mensal = +1 mes, anual = +12 meses, sempre a partir do
--    vencimento anterior, com o dia = billing_day limitado ao
--    ultimo dia do mes de destino (31 -> 28/29 em fevereiro,
--    volta a 31 assim que o mes tiver 31 dias de novo).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_due_date(
  p_due_date date,
  p_billing_cycle text,
  p_billing_day integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_months integer;
  v_target_month date;
  v_last_day integer;
  v_day integer;
BEGIN
  IF p_due_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_months := CASE WHEN p_billing_cycle = 'anual' THEN 12 ELSE 1 END;
  v_target_month := (date_trunc('month', p_due_date) + (v_months || ' months')::interval)::date;
  v_last_day := EXTRACT(DAY FROM (v_target_month + INTERVAL '1 month - 1 day'))::int;
  v_day := LEAST(COALESCE(p_billing_day, EXTRACT(DAY FROM p_due_date)::int), v_last_day);

  RETURN (v_target_month + (v_day - 1) * INTERVAL '1 day')::date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_due_date(date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_due_date(date, text, integer) TO authenticated;

-- ------------------------------------------------------------
-- 4. register_manual_payment: usa next_due_date() em vez de
--    "+1 mes" fixo -- agora respeita ciclo e dia preferido.
--    confirm_payment_notice chama esta funcao por dentro, entao
--    herda o fix automaticamente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_manual_payment(
  p_org_id uuid,
  p_amount numeric,
  p_method text,
  p_status text,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.saas_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.saas_subscriptions;
  v_new_due date;
  v_payment public.saas_payments;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT * INTO v_sub FROM public.saas_subscriptions WHERE organization_id = p_org_id FOR UPDATE;

  IF p_status = 'pago' THEN
    v_new_due := public.next_due_date(
      COALESCE(v_sub.due_date, CURRENT_DATE),
      COALESCE(v_sub.billing_cycle, 'mensal'),
      v_sub.billing_day
    );
  ELSE
    v_new_due := COALESCE(p_due_date, v_sub.due_date);
  END IF;

  INSERT INTO public.saas_payments (
    organization_id, subscription_id, amount, method, status, due_date, paid_at, notes
  )
  VALUES (
    p_org_id, v_sub.id, p_amount, p_method::payment_method_type, p_status::payment_status, v_new_due,
    CASE WHEN p_status = 'pago' THEN now() ELSE NULL END, p_notes
  )
  RETURNING * INTO v_payment;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.saas_subscriptions
    SET payment_status = p_status::payment_status,
        due_date = v_new_due,
        status = CASE WHEN p_status = 'cancelado' THEN 'cancelada'::subscription_status ELSE status END,
        updated_at = now()
    WHERE id = v_sub.id;
  END IF;

  RETURN v_payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_manual_payment(uuid, numeric, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_payment(uuid, numeric, text, text, date, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. get_billing_status: "vence_em_breve" agora depende do ciclo
--    -- 5 dias antes no mensal, 15 dias antes no anual. Resto
--    (atraso, suspensao, cancelamento, prioridade manual) igual.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_status(p_org_id uuid)
RETURNS TABLE (
  situacao text,
  due_date date,
  trial_ends_at timestamptz,
  dias_atraso integer,
  dias_para_vencer integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.saas_subscriptions;
  v_effective_due date;
  v_dias_atraso integer := 0;
  v_dias_para_vencer integer;
  v_situacao text;
  v_warn_days integer;
BEGIN
  IF p_org_id IS DISTINCT FROM public.get_my_org_id() AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT * INTO v_sub FROM public.saas_subscriptions WHERE organization_id = p_org_id;

  IF v_sub.id IS NULL THEN
    RETURN QUERY SELECT 'em_dia'::text, NULL::date, NULL::timestamptz, 0, NULL::integer;
    RETURN;
  END IF;

  v_effective_due := COALESCE(v_sub.due_date, v_sub.trial_ends_at::date);
  v_warn_days := CASE WHEN v_sub.billing_cycle = 'anual' THEN 15 ELSE 5 END;

  IF v_sub.status = 'cancelada' THEN
    v_situacao := 'cancelado';
  ELSIF v_sub.status = 'suspensa' THEN
    v_situacao := 'suspenso';
  ELSIF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now() THEN
    v_situacao := 'teste';
  ELSIF v_effective_due IS NULL THEN
    v_situacao := 'sem_vencimento';
  ELSIF v_effective_due >= CURRENT_DATE THEN
    v_dias_para_vencer := v_effective_due - CURRENT_DATE;
    v_situacao := CASE WHEN v_dias_para_vencer <= v_warn_days THEN 'vence_em_breve' ELSE 'em_dia' END;
  ELSE
    v_dias_atraso := CURRENT_DATE - v_effective_due;
    v_situacao := CASE
      WHEN v_dias_atraso <= 5 THEN 'atrasado'
      WHEN v_dias_atraso <= 30 THEN 'suspenso'
      ELSE 'cancelado'
    END;
  END IF;

  RETURN QUERY SELECT v_situacao, v_effective_due, v_sub.trial_ends_at, v_dias_atraso, v_dias_para_vencer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_status(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6. get_my_plan: + billing_cycle, billing_amount, billing_day
--    (Meu Plano precisa mostrar "Mensal/Anual" e o valor do ciclo,
--    nao so o preco de tabela do plano). Precisa DROP porque o
--    tipo de retorno (colunas) mudou.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_plan();

CREATE OR REPLACE FUNCTION public.get_my_plan()
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  plan_price numeric,
  max_products integer,
  max_users integer,
  max_registers integer,
  billing_cycle text,
  billing_amount numeric,
  billing_day integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.name, p.price,
    pl.max_products, pl.max_users, o.max_registers,
    s.billing_cycle, s.billing_amount, s.billing_day
  FROM public.organizations o
  LEFT JOIN public.saas_plans p ON p.id = o.plan_id
  LEFT JOIN public.saas_plan_limits pl ON pl.plan_id = o.plan_id
  LEFT JOIN public.saas_subscriptions s ON s.organization_id = o.id
  WHERE o.id = public.get_my_org_id();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_plan() TO authenticated;

-- ------------------------------------------------------------
-- 7. complete_store_onboarding: trial_days vem de
--    saas_billing_settings (nao mais fixo em 15), e billing_day
--    passa a ser gravado tambem (dia do fim do teste). Mesma
--    assinatura -- retrocompativel.
-- ------------------------------------------------------------
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
