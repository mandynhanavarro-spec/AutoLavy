-- ############################################################
-- AUTOLAVY SAAS MULTI-TENANT - SCHEMA COMPLETO DA VERSAO MAIOR
-- ############################################################

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('operador', 'gerente', 'admin', 'superadmin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.customer_status AS ENUM ('ativo', 'suspenso', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.access_status AS ENUM ('ativo', 'bloqueado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.plan_status AS ENUM ('ativo', 'inativo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('ativa', 'suspensa', 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.payment_method_type AS ENUM ('pix', 'cartao', 'boleto', 'dinheiro', 'transferencia');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.saas_admin_profile AS ENUM ('super_admin', 'administrador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.autolavy_products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  internal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.autolavy_products (id, slug, internal_name, display_name)
VALUES
  ('loja', 'meu-caixa', 'loja', 'Meu Caixa'),
  ('servico', 'meu-servico', 'servico', 'Meu Servico'),
  ('beleza', 'meu-studio', 'beleza', 'Meu Studio')
ON CONFLICT (id) DO UPDATE
SET
  slug = EXCLUDED.slug,
  internal_name = EXCLUDED.internal_name,
  display_name = EXCLUDED.display_name,
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  cnpj TEXT,
  phone TEXT,
  address TEXT,
  theme_color TEXT DEFAULT '#3b82f6',
  logo_url TEXT,
  plan_type TEXT DEFAULT 'basic',
  max_registers INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  product_id TEXT REFERENCES public.autolavy_products(id) DEFAULT 'loja',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  full_name TEXT,
  role public.user_role DEFAULT 'operador',
  permissions JSONB DEFAULT '{
    "can_void_sale": false,
    "can_edit_stock": false,
    "can_open_cash": true,
    "can_do_sangria": false,
    "can_view_reports": false
  }'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_registers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  sku TEXT,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 5,
  category_id UUID REFERENCES public.categories(id),
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_sku_per_org UNIQUE (org_id, sku)
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  register_id UUID REFERENCES public.cash_registers(id),
  user_id UUID REFERENCES public.profiles(id),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_balance DECIMAL(10,2) DEFAULT 0,
  closing_balance_real DECIMAL(10,2),
  closing_balance_expected DECIMAL(10,2),
  status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  session_id UUID REFERENCES public.cash_sessions(id),
  user_id UUID REFERENCES public.profiles(id),
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  user_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  store_name TEXT NOT NULL,
  plan_type TEXT DEFAULT 'basic',
  max_registers INTEGER DEFAULT 1,
  product_id TEXT REFERENCES public.autolavy_products(id) DEFAULT 'loja',
  is_used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  status public.plan_status DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_plan_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.saas_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT saas_plan_features_plan_feature_unique UNIQUE (plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.saas_plan_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.saas_plans(id) ON DELETE CASCADE,
  max_users INTEGER DEFAULT 0,
  max_clients INTEGER DEFAULT 0,
  max_products INTEGER DEFAULT 0,
  max_services INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT saas_plan_limits_plan_unique UNIQUE (plan_id)
);

CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.saas_plans(id),
  billing_amount DECIMAL(10,2) DEFAULT 0,
  due_date DATE,
  payment_status public.payment_status DEFAULT 'pendente',
  status public.subscription_status DEFAULT 'ativa',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  suspended_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT saas_subscriptions_org_unique UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.saas_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.saas_subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  method public.payment_method_type DEFAULT 'pix',
  status public.payment_status DEFAULT 'pendente',
  due_date DATE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_gateway_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  public_key TEXT,
  secret_key TEXT,
  webhook_secret TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT saas_gateway_configs_provider_unique UNIQUE (provider)
);

CREATE TABLE IF NOT EXISTS public.saas_administrators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  profile public.saas_admin_profile DEFAULT 'administrador',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT saas_administrators_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.saas_system_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  description TEXT,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS customer_status public.customer_status DEFAULT 'ativo';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS access_status public.access_status DEFAULT 'ativo';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan_id UUID;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_status public.access_status DEFAULT 'ativo';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS company_document TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS login_email TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS initial_password TEXT;
ALTER TABLE public.store_invites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_plan_id_fkey'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.saas_plans(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_store_invites_token ON public.store_invites(token);
CREATE INDEX IF NOT EXISTS idx_store_invites_is_used ON public.store_invites(is_used);
CREATE INDEX IF NOT EXISTS idx_organizations_customer_status ON public.organizations(customer_status);
CREATE INDEX IF NOT EXISTS idx_organizations_access_status ON public.organizations(access_status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON public.saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_payment_status ON public.saas_subscriptions(payment_status);
CREATE INDEX IF NOT EXISTS idx_saas_payments_status ON public.saas_payments(status);
CREATE INDEX IF NOT EXISTS idx_saas_payments_org_id ON public.saas_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_saas_system_logs_created_at ON public.saas_system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_gateway_configs_provider ON public.saas_gateway_configs(provider);

INSERT INTO public.saas_plans (name, slug, price, description, status)
VALUES
  ('Basico', 'basic', 79.90, 'Plano inicial para pequenas operacoes.', 'ativo'),
  ('Pro', 'pro', 149.90, 'Plano intermediario com mais recursos e usuarios.', 'ativo'),
  ('Premium', 'premium', 249.90, 'Plano avancado para operacao completa do SaaS.', 'ativo')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO public.saas_plan_limits (plan_id, max_users, max_clients, max_products, max_services)
SELECT
  p.id,
  limits.max_users,
  limits.max_clients,
  limits.max_products,
  limits.max_services
FROM public.saas_plans p
JOIN (
  VALUES
    ('basic', 1, 200, 500, 50),
    ('pro', 3, 1000, 3000, 300),
    ('premium', 10, 5000, 10000, 2000)
) AS limits(plan_slug, max_users, max_clients, max_products, max_services)
  ON limits.plan_slug = p.slug
ON CONFLICT (plan_id) DO UPDATE
SET
  max_users = EXCLUDED.max_users,
  max_clients = EXCLUDED.max_clients,
  max_products = EXCLUDED.max_products,
  max_services = EXCLUDED.max_services,
  updated_at = NOW();

INSERT INTO public.saas_plan_features (plan_id, feature_key, enabled)
SELECT
  p.id,
  features.feature_key,
  features.enabled
FROM public.saas_plans p
JOIN (
  VALUES
    ('basic', 'loja', TRUE),
    ('basic', 'servicos', FALSE),
    ('basic', 'clientes', TRUE),
    ('basic', 'produtos', TRUE),
    ('basic', 'agenda', FALSE),
    ('basic', 'relatorios', TRUE),
    ('basic', 'api', FALSE),
    ('basic', 'integracoes', FALSE),
    ('pro', 'loja', TRUE),
    ('pro', 'servicos', TRUE),
    ('pro', 'clientes', TRUE),
    ('pro', 'produtos', TRUE),
    ('pro', 'agenda', TRUE),
    ('pro', 'relatorios', TRUE),
    ('pro', 'api', FALSE),
    ('pro', 'integracoes', TRUE),
    ('premium', 'loja', TRUE),
    ('premium', 'servicos', TRUE),
    ('premium', 'clientes', TRUE),
    ('premium', 'produtos', TRUE),
    ('premium', 'agenda', TRUE),
    ('premium', 'relatorios', TRUE),
    ('premium', 'api', TRUE),
    ('premium', 'integracoes', TRUE)
) AS features(plan_slug, feature_key, enabled)
  ON features.plan_slug = p.slug
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.profiles WHERE id = auth.uid()), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, 'org')), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.cash_registers ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.categories ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.products ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.cash_sessions ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.sales ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.sale_items ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();
ALTER TABLE public.audit_logs ALTER COLUMN org_id SET DEFAULT public.get_my_org_id();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_store_invites_updated_at ON public.store_invites;
CREATE TRIGGER trg_store_invites_updated_at
BEFORE UPDATE ON public.store_invites
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_plans_updated_at ON public.saas_plans;
CREATE TRIGGER trg_saas_plans_updated_at
BEFORE UPDATE ON public.saas_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_plan_limits_updated_at ON public.saas_plan_limits;
CREATE TRIGGER trg_saas_plan_limits_updated_at
BEFORE UPDATE ON public.saas_plan_limits
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_subscriptions_updated_at ON public.saas_subscriptions;
CREATE TRIGGER trg_saas_subscriptions_updated_at
BEFORE UPDATE ON public.saas_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_gateway_configs_updated_at ON public.saas_gateway_configs;
CREATE TRIGGER trg_saas_gateway_configs_updated_at
BEFORE UPDATE ON public.saas_gateway_configs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_administrators_updated_at ON public.saas_administrators;
CREATE TRIGGER trg_saas_administrators_updated_at
BEFORE UPDATE ON public.saas_administrators
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, org_id, phone, access_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'operador'),
    (NEW.raw_user_meta_data->>'org_id')::uuid,
    NEW.raw_user_meta_data->>'phone',
    'ativo'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    org_id = COALESCE(EXCLUDED.org_id, public.profiles.org_id),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    access_status = COALESCE(EXCLUDED.access_status, public.profiles.access_status),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user();

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
    name,
    slug,
    cnpj,
    phone,
    address,
    theme_color,
    plan_type,
    max_registers,
    product_id,
    responsible_name,
    contact_email,
    whatsapp,
    notes,
    customer_status,
    access_status,
    plan_id
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
    organization_id,
    plan_id,
    billing_amount,
    due_date,
    payment_status,
    status
  )
  VALUES (
    v_org_id,
    v_plan_id,
    COALESCE(v_plan_price, 0),
    CURRENT_DATE + 30,
    'pendente',
    'ativa'
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    billing_amount = EXCLUDED.billing_amount,
    due_date = EXCLUDED.due_date,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    updated_at = NOW();

  UPDATE public.store_invites
  SET
    is_used = TRUE,
    updated_at = NOW()
  WHERE id = v_invite.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.autolavy_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_gateway_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autolavy_products_public_read ON public.autolavy_products;
CREATE POLICY autolavy_products_public_read
ON public.autolavy_products
FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS organizations_select_own_or_superadmin ON public.organizations;
CREATE POLICY organizations_select_own_or_superadmin
ON public.organizations
FOR SELECT
USING (id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS organizations_update_own_or_superadmin ON public.organizations;
CREATE POLICY organizations_update_own_or_superadmin
ON public.organizations
FOR UPDATE
USING (id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS organizations_insert_superadmin ON public.organizations;
CREATE POLICY organizations_insert_superadmin
ON public.organizations
FOR INSERT
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS organizations_delete_superadmin ON public.organizations;
CREATE POLICY organizations_delete_superadmin
ON public.organizations
FOR DELETE
USING (public.is_superadmin());

DROP POLICY IF EXISTS profiles_select_isolated ON public.profiles;
CREATE POLICY profiles_select_isolated
ON public.profiles
FOR SELECT
USING (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS profiles_update_isolated ON public.profiles;
CREATE POLICY profiles_update_isolated
ON public.profiles
FOR UPDATE
USING (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS profiles_insert_superadmin ON public.profiles;
CREATE POLICY profiles_insert_superadmin
ON public.profiles
FOR INSERT
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS profiles_delete_superadmin ON public.profiles;
CREATE POLICY profiles_delete_superadmin
ON public.profiles
FOR DELETE
USING (public.is_superadmin());

DROP POLICY IF EXISTS cash_registers_tenant_isolation ON public.cash_registers;
CREATE POLICY cash_registers_tenant_isolation
ON public.cash_registers
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS categories_tenant_isolation ON public.categories;
CREATE POLICY categories_tenant_isolation
ON public.categories
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS products_tenant_isolation ON public.products;
CREATE POLICY products_tenant_isolation
ON public.products
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS cash_sessions_tenant_isolation ON public.cash_sessions;
CREATE POLICY cash_sessions_tenant_isolation
ON public.cash_sessions
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS sales_tenant_isolation ON public.sales;
CREATE POLICY sales_tenant_isolation
ON public.sales
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS sale_items_tenant_isolation ON public.sale_items;
CREATE POLICY sale_items_tenant_isolation
ON public.sale_items
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS audit_logs_tenant_isolation ON public.audit_logs;
CREATE POLICY audit_logs_tenant_isolation
ON public.audit_logs
FOR ALL
USING (org_id = public.get_my_org_id() OR public.is_superadmin())
WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());

DROP POLICY IF EXISTS store_invites_superadmin_manage ON public.store_invites;
CREATE POLICY store_invites_superadmin_manage
ON public.store_invites
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS store_invites_public_read_signup ON public.store_invites;
CREATE POLICY store_invites_public_read_signup
ON public.store_invites
FOR SELECT
USING (is_used = FALSE AND expires_at > NOW());

DROP POLICY IF EXISTS saas_plans_superadmin_manage ON public.saas_plans;
CREATE POLICY saas_plans_superadmin_manage
ON public.saas_plans
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_plan_features_superadmin_manage ON public.saas_plan_features;
CREATE POLICY saas_plan_features_superadmin_manage
ON public.saas_plan_features
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_plan_limits_superadmin_manage ON public.saas_plan_limits;
CREATE POLICY saas_plan_limits_superadmin_manage
ON public.saas_plan_limits
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_subscriptions_superadmin_manage ON public.saas_subscriptions;
CREATE POLICY saas_subscriptions_superadmin_manage
ON public.saas_subscriptions
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_payments_superadmin_manage ON public.saas_payments;
CREATE POLICY saas_payments_superadmin_manage
ON public.saas_payments
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_administrators_superadmin_manage ON public.saas_administrators;
CREATE POLICY saas_administrators_superadmin_manage
ON public.saas_administrators
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_system_logs_superadmin_manage ON public.saas_system_logs;
CREATE POLICY saas_system_logs_superadmin_manage
ON public.saas_system_logs
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS saas_gateway_configs_superadmin_manage ON public.saas_gateway_configs;
CREATE POLICY saas_gateway_configs_superadmin_manage
ON public.saas_gateway_configs
FOR ALL
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.autolavy_products TO anon, authenticated, service_role;
GRANT SELECT ON public.store_invites TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_invites TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plan_features TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plan_limits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_subscriptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_payments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_administrators TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_system_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_gateway_configs TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_store_onboarding(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
