-- ============================================================
-- AUTOLAVY — BASELINE DO SCHEMA REAL (reconstruído via introspecção)
-- ============================================================
--
-- Este arquivo é uma "foto" do schema real do projeto Supabase
-- hhnbazjwdtymlouhufue, reconstruída em 2026-07-24 via introspecção
-- direta do banco (pg_catalog / information_schema / pg_policies),
-- e não uma migration originalmente escrita à mão.
--
-- Motivo de existir: até esta migration, TODO o schema (tabelas,
-- funções, triggers, RLS, policies) foi criado manualmente no SQL
-- Editor do dashboard do Supabase, sem passar pelo fluxo de
-- migrations do CLI. Rodar `supabase migration list` mostrava, antes
-- deste arquivo, apenas as duas migrations de correção de segurança
-- de 2026-07-24 (fix_store_invites_public_exposure e
-- fix_role_templates_delete_exposure) — nada do restante do schema
-- estava rastreado. Sem isto, não era possível recriar o banco do
-- zero a partir do repositório Git.
--
-- Todos os comandos abaixo são idempotentes (IF NOT EXISTS ou
-- DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;),
-- então esta migration é segura de rodar mesmo já tendo sido
-- aplicada no remoto.
--
-- IMPORTANTE: duplicatas de policies/triggers que existem hoje em
-- produção (ex.: "Tenant Isolation" + "products_tenant_isolation"
-- fazendo a mesma checagem) foram preservadas EXATAMENTE como estão,
-- com os mesmos nomes. Não corrigimos isso aqui — é assunto de uma
-- limpeza futura separada, documentada no CHECKUP_TECNICO.md.
--
-- Dali para frente, toda mudança de schema deve nascer como uma
-- migration nova (`supabase migration new <nome>` + `supabase db
-- push`), nunca mais direto no SQL Editor do dashboard.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('operador', 'gerente', 'admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_status AS ENUM ('ativo', 'suspenso', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_status AS ENUM ('ativo', 'bloqueado', 'excluido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_status AS ENUM ('ativo', 'inativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('ativa', 'suspensa', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method_type AS ENUM ('pix', 'cartao', 'boleto', 'dinheiro', 'transferencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.saas_admin_profile AS ENUM ('super_admin', 'administrador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABELAS (colunas)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  user_id uuid,
  action_type text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.autolavy_products (
  id text NOT NULL,
  slug text NOT NULL,
  internal_name text NOT NULL,
  display_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.beleza_clients (
  id text NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  notes text,
  alert_days integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.beleza_config (
  tenant_id uuid NOT NULL,
  default_alert_days integer NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS public.beleza_services (
  id text NOT NULL,
  tenant_id uuid NOT NULL,
  client_id text NOT NULL,
  description text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  closed_by uuid,
  closed_at timestamp with time zone DEFAULT now(),
  date date NOT NULL,
  total_sales numeric(10,2) DEFAULT 0,
  total_transactions integer DEFAULT 0,
  total_dinheiro numeric(10,2) DEFAULT 0,
  total_pix numeric(10,2) DEFAULT 0,
  total_cartao numeric(10,2) DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  register_id uuid,
  total_debito numeric(10,2) DEFAULT 0,
  total_credito numeric(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  register_id uuid,
  session_id uuid,
  type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  product_filter jsonb
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  register_id uuid,
  user_id uuid,
  opened_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  opening_balance numeric(10,2) DEFAULT 0,
  closing_balance_real numeric(10,2),
  closing_balance_expected numeric(10,2),
  status text DEFAULT 'open'::text
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  segment_id text DEFAULT 'geral'::text,
  min_stock_alert integer
);

CREATE TABLE IF NOT EXISTS public.grade_templates (
  id text NOT NULL,
  name text NOT NULL,
  description text,
  cores jsonb DEFAULT '[]'::jsonb,
  tamanhos jsonb DEFAULT '[]'::jsonb,
  numeros jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.organization_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  segment_id text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  cnpj text,
  phone text,
  address text,
  theme_color text DEFAULT '#3b82f6'::text,
  logo_url text,
  plan_type text DEFAULT 'basic'::text,
  max_registers integer DEFAULT 1,
  is_active boolean DEFAULT true,
  product_id text DEFAULT 'loja'::text,
  created_at timestamp with time zone DEFAULT now(),
  responsible_name text,
  contact_email text,
  whatsapp text,
  notes text,
  customer_status customer_status DEFAULT 'ativo'::customer_status,
  access_status access_status DEFAULT 'ativo'::access_status,
  suspended_at timestamp with time zone,
  canceled_at timestamp with time zone,
  plan_id uuid,
  updated_at timestamp with time zone DEFAULT now(),
  segment text DEFAULT 'geral'::text,
  grade_config jsonb DEFAULT '{"cores": [], "numeros": [], "tamanhos": []}'::jsonb,
  onboarding_completed boolean DEFAULT false,
  min_stock_alert integer DEFAULT 5
);

CREATE TABLE IF NOT EXISTS public.product_attributes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  product_id uuid,
  serial_number text,
  imei text,
  warranty_months integer,
  warranty_from date,
  warranty_until date,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  product_id uuid,
  sku_variant text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  stock_quantity integer DEFAULT 0,
  price_override numeric,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  sku text,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  cost_price numeric(10,2) DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  min_stock_alert integer DEFAULT 5,
  category_id uuid,
  is_favorite boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  is_demo boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  org_id uuid,
  full_name text,
  role user_role DEFAULT 'operador'::user_role,
  permissions jsonb DEFAULT '{"can_open_cash": true, "can_void_sale": false, "can_close_cash": false, "can_do_sangria": false, "can_edit_stock": false, "can_view_reports": false, "can_manage_products": false}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  last_login_at timestamp with time zone,
  access_status access_status DEFAULT 'ativo'::access_status,
  phone text,
  template_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  base_role user_role DEFAULT 'operador'::user_role,
  permissions jsonb DEFAULT '{"can_open_cash": true, "can_void_sale": false, "can_close_cash": false, "can_do_sangria": false, "can_edit_stock": false, "can_view_reports": false, "can_manage_products": false}'::jsonb,
  is_default boolean DEFAULT false,
  created_by uuid,
  org_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_administrators (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  profile saas_admin_profile DEFAULT 'administrador'::saas_admin_profile,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_gateway_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  public_key text,
  secret_key text,
  webhook_secret text,
  is_enabled boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  subscription_id uuid,
  amount numeric(10,2) NOT NULL,
  method payment_method_type DEFAULT 'pix'::payment_method_type,
  status payment_status DEFAULT 'pendente'::payment_status,
  due_date date,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_plan_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  feature_key text NOT NULL,
  enabled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_plan_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  max_users integer DEFAULT 0,
  max_clients integer DEFAULT 0,
  max_products integer DEFAULT 0,
  max_services integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  price numeric(10,2) DEFAULT 0,
  description text,
  status plan_status DEFAULT 'ativo'::plan_status,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  plan_id uuid,
  billing_amount numeric(10,2) DEFAULT 0,
  due_date date,
  payment_status payment_status DEFAULT 'pendente'::payment_status,
  status subscription_status DEFAULT 'ativa'::subscription_status,
  started_at timestamp with time zone DEFAULT now(),
  suspended_at timestamp with time zone,
  canceled_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text,
  actor_user_id uuid,
  organization_id uuid,
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  sale_id uuid,
  product_id uuid,
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  unit_cost numeric(10,2) DEFAULT 0,
  subtotal numeric(10,2) NOT NULL,
  variant_id uuid
);

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  payment_method text NOT NULL,
  amount numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid DEFAULT get_my_org_id(),
  session_id uuid,
  user_id uuid,
  total_amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  register_id uuid,
  status text NOT NULL DEFAULT 'completed'::text,
  voided_at timestamp with time zone,
  voided_by uuid,
  void_reason text
);

CREATE TABLE IF NOT EXISTS public.segment_attribute_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  segment_id text,
  attribute text NOT NULL,
  label text NOT NULL,
  type text NOT NULL,
  options jsonb,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.segments (
  id text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  product_id text
);

CREATE TABLE IF NOT EXISTS public.store_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL,
  store_name text NOT NULL,
  plan_type text DEFAULT 'basic'::text,
  max_registers integer DEFAULT 1,
  product_id text DEFAULT 'loja'::text,
  is_used boolean DEFAULT false,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone DEFAULT now(),
  responsible_name text,
  company_document text,
  contact_email text,
  whatsapp text,
  address text,
  notes text,
  login_email text,
  initial_password text,
  updated_at timestamp with time zone DEFAULT now(),
  preset_categories jsonb DEFAULT '[]'::jsonb
);

-- ============================================================
-- 3. CONSTRAINTS (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY)
-- ============================================================

-- ── 3.1 PRIMARY KEYs ──────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.autolavy_products ADD CONSTRAINT autolavy_products_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.beleza_clients ADD CONSTRAINT beleza_clients_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.beleza_config ADD CONSTRAINT beleza_config_pkey PRIMARY KEY (tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.beleza_services ADD CONSTRAINT beleza_services_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_closings ADD CONSTRAINT cash_closings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_registers ADD CONSTRAINT cash_registers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.grade_templates ADD CONSTRAINT grade_templates_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organization_segments ADD CONSTRAINT organization_segments_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.role_templates ADD CONSTRAINT role_templates_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_administrators ADD CONSTRAINT saas_administrators_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_gateway_configs ADD CONSTRAINT saas_gateway_configs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_payments ADD CONSTRAINT saas_payments_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_features ADD CONSTRAINT saas_plan_features_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_limits ADD CONSTRAINT saas_plan_limits_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plans ADD CONSTRAINT saas_plans_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_subscriptions ADD CONSTRAINT saas_subscriptions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_system_logs ADD CONSTRAINT saas_system_logs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.segment_attribute_templates ADD CONSTRAINT segment_attribute_templates_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.segments ADD CONSTRAINT segments_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.store_invites ADD CONSTRAINT store_invites_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3.2 UNIQUE ────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.autolavy_products ADD CONSTRAINT autolavy_products_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organization_segments ADD CONSTRAINT organization_segments_org_id_segment_id_key UNIQUE (org_id, segment_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT unique_sku_per_org UNIQUE (org_id, sku); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_administrators ADD CONSTRAINT saas_administrators_email_unique UNIQUE (email); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_gateway_configs ADD CONSTRAINT saas_gateway_configs_provider_unique UNIQUE (provider); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_features ADD CONSTRAINT saas_plan_features_plan_feature_unique UNIQUE (plan_id, feature_key); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_limits ADD CONSTRAINT saas_plan_limits_plan_unique UNIQUE (plan_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plans ADD CONSTRAINT saas_plans_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_subscriptions ADD CONSTRAINT saas_subscriptions_org_unique UNIQUE (organization_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.store_invites ADD CONSTRAINT store_invites_token_key UNIQUE (token); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3.3 CHECK ─────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_amount_check CHECK ((amount > (0)::numeric)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_type_check CHECK ((type = ANY (ARRAY['sangria'::text, 'reforco'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'debito'::text, 'credito'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'voided'::text]))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3.4 FOREIGN KEY ───────────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.beleza_services ADD CONSTRAINT beleza_services_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.beleza_clients(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_closings ADD CONSTRAINT cash_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_closings ADD CONSTRAINT cash_closings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_closings ADD CONSTRAINT cash_closings_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_sessions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_registers ADD CONSTRAINT cash_registers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.categories ADD CONSTRAINT categories_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.categories ADD CONSTRAINT categories_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organization_segments ADD CONSTRAINT organization_segments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organization_segments ADD CONSTRAINT organization_segments_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.saas_plans(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.autolavy_products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_segment_fkey FOREIGN KEY (segment) REFERENCES public.segments(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.role_templates(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.role_templates ADD CONSTRAINT role_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.role_templates ADD CONSTRAINT role_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_payments ADD CONSTRAINT saas_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_payments ADD CONSTRAINT saas_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.saas_subscriptions(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_features ADD CONSTRAINT saas_plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.saas_plans(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_plan_limits ADD CONSTRAINT saas_plan_limits_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.saas_plans(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_subscriptions ADD CONSTRAINT saas_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_subscriptions ADD CONSTRAINT saas_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.saas_plans(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_system_logs ADD CONSTRAINT saas_system_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saas_system_logs ADD CONSTRAINT saas_system_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_sessions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.segment_attribute_templates ADD CONSTRAINT segment_attribute_templates_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.segments ADD CONSTRAINT segments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.autolavy_products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.store_invites ADD CONSTRAINT store_invites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.autolavy_products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 4. ÍNDICES (além dos criados implicitamente pelas constraints acima)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_beleza_clients_name ON public.beleza_clients USING btree (name);
CREATE INDEX IF NOT EXISTS idx_beleza_clients_tenant_id ON public.beleza_clients USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_beleza_services_client_id ON public.beleza_services USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_beleza_services_date ON public.beleza_services USING btree (date DESC);
CREATE INDEX IF NOT EXISTS idx_beleza_services_tenant_id ON public.beleza_services USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_closings_register_id ON public.cash_closings USING btree (register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON public.cash_movements USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_org_id ON public.cash_movements USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_register_id ON public.cash_movements USING btree (register_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_org_id ON public.cash_registers USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_id ON public.cash_sessions USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_categories_org_id ON public.categories USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_org_segments_org_id ON public.organization_segments USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_access_status ON public.organizations USING btree (access_status);
CREATE INDEX IF NOT EXISTS idx_organizations_customer_status ON public.organizations USING btree (customer_status);
CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id ON public.product_attributes USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_org_id ON public.product_variants USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_products_org_id ON public.products USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_saas_gateway_configs_provider ON public.saas_gateway_configs USING btree (provider);
CREATE INDEX IF NOT EXISTS idx_saas_payments_org_id ON public.saas_payments USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_saas_payments_status ON public.saas_payments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_payment_status ON public.saas_subscriptions USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON public.saas_subscriptions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_saas_system_logs_created_at ON public.saas_system_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_org_id ON public.sale_items USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id ON public.sale_items USING btree (variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON public.sale_payments USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_id ON public.sales USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_store_invites_is_used ON public.store_invites USING btree (is_used);
CREATE INDEX IF NOT EXISTS idx_store_invites_is_used_expires_at ON public.store_invites USING btree (is_used, expires_at);
CREATE INDEX IF NOT EXISTS idx_store_invites_token ON public.store_invites USING btree (token);

-- ============================================================
-- 5. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.profiles WHERE id = auth.uid()), FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.slugify(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, 'org')), '[^a-z0-9]+', '-', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_registers()
 RETURNS TABLE(id uuid, name text, description text, is_active boolean, product_filter jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE public.cash_registers.org_id = v_org_id
  ) THEN
    INSERT INTO public.cash_registers (org_id, name, description, is_active)
    VALUES (v_org_id, 'Caixa Principal', 'Caixa criado automaticamente.', TRUE);
  END IF;
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.description,
    r.is_active,
    r.product_filter
  FROM public.cash_registers r
  WHERE r.org_id = v_org_id
  ORDER BY r.name ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_store_onboarding(invite_token text, user_id uuid, p_cnpj text, p_phone text, p_address text, p_theme_color text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  WHERE id = user_id;

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

  -- Criar categorias pré-definidas pelo SuperAdmin
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

CREATE OR REPLACE FUNCTION public.complete_store_onboarding(invite_token text, p_cnpj text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_theme_color text DEFAULT '#3b82f6'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  PERFORM public.complete_store_onboarding(invite_token, auth.uid(), p_cnpj, p_phone, p_address, p_theme_color);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_invite(invite_token text)
 RETURNS TABLE(store_name text, plan_type text, max_registers integer, product_id text, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT store_name, plan_type, max_registers, product_id, expires_at
  FROM public.store_invites
  WHERE token = invite_token AND is_used = FALSE AND expires_at > NOW()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(invite_token text)
 RETURNS TABLE(id uuid, store_name text, plan_type text, max_registers integer, product_id text, responsible_name text, company_document text, contact_email text, whatsapp text, address text, login_email text, initial_password text, preset_categories jsonb, is_used boolean, expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, store_name, plan_type, max_registers, product_id,
         responsible_name, company_document, contact_email, whatsapp,
         address, login_email, initial_password, preset_categories,
         is_used, expires_at
  from store_invites
  where token = invite_token
    and is_used = false
    and expires_at > now();
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS set_updated_at_organizations ON public.organizations;
CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_administrators_updated_at ON public.saas_administrators;
CREATE TRIGGER trg_saas_administrators_updated_at BEFORE UPDATE ON public.saas_administrators FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_gateway_configs_updated_at ON public.saas_gateway_configs;
CREATE TRIGGER trg_saas_gateway_configs_updated_at BEFORE UPDATE ON public.saas_gateway_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_plan_limits_updated_at ON public.saas_plan_limits;
CREATE TRIGGER trg_saas_plan_limits_updated_at BEFORE UPDATE ON public.saas_plan_limits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_plans_updated_at ON public.saas_plans;
CREATE TRIGGER trg_saas_plans_updated_at BEFORE UPDATE ON public.saas_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_subscriptions_updated_at ON public.saas_subscriptions;
CREATE TRIGGER trg_saas_subscriptions_updated_at BEFORE UPDATE ON public.saas_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_store_invites_updated_at ON public.store_invites;
CREATE TRIGGER trg_store_invites_updated_at BEFORE UPDATE ON public.store_invites FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 7. ROW LEVEL SECURITY (habilitar em todas as tabelas)
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autolavy_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beleza_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beleza_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beleza_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_gateway_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_attribute_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. POLICIES
-- ============================================================
-- Nomes e duplicatas preservados exatamente como estão em produção.

-- ── audit_logs ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.audit_logs FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── autolavy_products ────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Public read products" ON public.autolavy_products FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "autolavy_products_public_read" ON public.autolavy_products FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── beleza_clients ───────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "beleza_clients_tenant_access" ON public.beleza_clients FOR ALL
    USING ((tenant_id = ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── beleza_config ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "beleza_config_tenant_access" ON public.beleza_config FOR ALL
    USING ((tenant_id = ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── beleza_services ──────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "beleza_services_tenant_access" ON public.beleza_services FOR ALL
    USING ((tenant_id = ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── cash_closings ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "cash_closings_rls" ON public.cash_closings FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── cash_movements ───────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "movimentacoes da propria org" ON public.cash_movements FOR ALL
    USING (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()))
    WITH CHECK (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── cash_registers ───────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.cash_registers FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cash_registers_delete" ON public.cash_registers FOR DELETE
    USING (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cash_registers_insert" ON public.cash_registers FOR INSERT
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cash_registers_select" ON public.cash_registers FOR SELECT
    USING (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cash_registers_update" ON public.cash_registers FOR UPDATE
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── cash_sessions ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.cash_sessions FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cash_sessions_tenant_isolation" ON public.cash_sessions FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── categories ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.categories FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "categories_tenant_isolation" ON public.categories FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── grade_templates ──────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "templates publicos para leitura" ON public.grade_templates FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── organization_segments ────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "superadmin gerencia segmentos" ON public.organization_segments FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::user_role)) )))
    WITH CHECK ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::user_role)) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "segmentos da propria org" ON public.organization_segments FOR SELECT
    TO authenticated
    USING ((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── organizations ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Org delete superadmin" ON public.organizations FOR DELETE
    USING (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "organizations_delete_superadmin" ON public.organizations FOR DELETE
    USING (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org insert superadmin" ON public.organizations FOR INSERT
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "organizations_insert_superadmin" ON public.organizations FOR INSERT
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org isolation" ON public.organizations FOR SELECT
    USING (((id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org select" ON public.organizations FOR SELECT
    USING (((id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "organizations_select_own_or_superadmin" ON public.organizations FOR SELECT
    USING (((id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org update" ON public.organizations FOR UPDATE
    USING ((is_superadmin() OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.org_id = organizations.id) AND (p.role = ANY (ARRAY['admin'::user_role, 'gerente'::user_role]))) ))))
    WITH CHECK ((is_superadmin() OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.org_id = organizations.id) AND (p.role = ANY (ARRAY['admin'::user_role, 'gerente'::user_role]))) ))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "organizations_update_own_or_superadmin" ON public.organizations FOR UPDATE
    USING (((id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── product_attributes ───────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "attributes da propria org" ON public.product_attributes FOR ALL
    USING (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()))
    WITH CHECK (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── product_variants ─────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "variants da propria org" ON public.product_variants FOR ALL
    USING (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()))
    WITH CHECK (((org_id IN ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── products ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.products FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "products_tenant_isolation" ON public.products FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── profiles ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Profile isolation" ON public.profiles FOR ALL
    USING (((id = auth.uid()) OR (org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_delete_superadmin" ON public.profiles FOR DELETE
    USING (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_insert_superadmin" ON public.profiles FOR INSERT
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Profile select" ON public.profiles FOR SELECT
    USING (((id = auth.uid()) OR (org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_select_isolated" ON public.profiles FOR SELECT
    USING (((id = auth.uid()) OR (org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "superadmin lê todos os profiles" ON public.profiles FOR SELECT
    USING ((EXISTS ( SELECT 1 FROM saas_administrators sa WHERE (sa.email = auth.email()) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Profile update" ON public.profiles FOR UPDATE
    USING ((is_superadmin() OR (id = auth.uid()) OR (org_id = get_my_org_id())))
    WITH CHECK ((is_superadmin() OR (id = auth.uid()) OR (org_id = get_my_org_id())));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_update_isolated" ON public.profiles FOR UPDATE
    USING (((id = auth.uid()) OR (org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((id = auth.uid()) OR (org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── role_templates ───────────────────────────────────────────
-- (versão corrigida em 2026-07-24 pela migration fix_role_templates_delete_exposure)
DO $$ BEGIN
  CREATE POLICY "role_templates_write" ON public.role_templates FOR ALL
    USING ((((org_id IS NULL) AND is_superadmin()) OR (org_id = get_my_org_id())))
    WITH CHECK ((((org_id IS NULL) AND is_superadmin()) OR (org_id = get_my_org_id())));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "role_templates_select" ON public.role_templates FOR SELECT
    USING ((is_superadmin() OR (org_id = get_my_org_id()) OR (org_id IS NULL)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_administrators ──────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_administrators_superadmin_manage" ON public.saas_administrators FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_gateway_configs ─────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_gateway_configs_superadmin_manage" ON public.saas_gateway_configs FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_payments ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_payments_superadmin_manage" ON public.saas_payments FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_plan_features ───────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_plan_features_superadmin_manage" ON public.saas_plan_features FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "usuarios podem ler features do seu plano" ON public.saas_plan_features FOR SELECT
    TO authenticated
    USING ((plan_id IN ( SELECT organizations.plan_id FROM organizations WHERE (organizations.id = ( SELECT profiles.org_id FROM profiles WHERE (profiles.id = auth.uid()) )) )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_plan_limits ─────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_plan_limits_superadmin_manage" ON public.saas_plan_limits FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_plans ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_plans_superadmin_manage" ON public.saas_plans FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_subscriptions ───────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_subscriptions_superadmin_manage" ON public.saas_subscriptions FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── saas_system_logs ─────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "saas_system_logs_superadmin_manage" ON public.saas_system_logs FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── sale_items ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.sale_items FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sale_items_tenant_isolation" ON public.sale_items FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── sale_payments ────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "sale_payments_delete" ON public.sale_payments FOR DELETE
    USING (((EXISTS ( SELECT 1 FROM sales s WHERE ((s.id = sale_payments.sale_id) AND (s.org_id = get_my_org_id())) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sale_payments_insert" ON public.sale_payments FOR INSERT
    WITH CHECK (((EXISTS ( SELECT 1 FROM sales s WHERE ((s.id = sale_payments.sale_id) AND (s.org_id = get_my_org_id())) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sale_payments_select" ON public.sale_payments FOR SELECT
    USING (((EXISTS ( SELECT 1 FROM sales s WHERE ((s.id = sale_payments.sale_id) AND (s.org_id = get_my_org_id())) )) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── sales ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Tenant Isolation" ON public.sales FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_tenant_isolation" ON public.sales FOR ALL
    USING (((org_id = get_my_org_id()) OR is_superadmin()))
    WITH CHECK (((org_id = get_my_org_id()) OR is_superadmin()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── segment_attribute_templates ──────────────────────────────
DO $$ BEGIN
  CREATE POLICY "templates publicos para leitura" ON public.segment_attribute_templates FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── segments ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "segmentos publicos para leitura" ON public.segments FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── store_invites ────────────────────────────────────────────
-- (versão corrigida em 2026-07-24 pela migration fix_store_invites_public_exposure:
--  não existe mais policy pública de SELECT — acesso do onboarding público
--  passou a ser feito via get_invite_by_token()/validate_invite())
DO $$ BEGIN
  CREATE POLICY "SuperAdmin manages invites" ON public.store_invites FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "store_invites_superadmin_manage" ON public.store_invites FOR ALL
    USING (is_superadmin())
    WITH CHECK (is_superadmin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
