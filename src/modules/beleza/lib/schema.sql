-- ============================================================
-- AUTOLAVY — Módulo Beleza (Meu Studio)
-- Execute no Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- ─── Tabela de Clientes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.beleza_clients (
  id          TEXT        PRIMARY KEY,
  tenant_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  notes       TEXT,
  alert_days  INTEGER,                        -- null = usa o padrão global do tenant
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabela de Serviços / Atendimentos ───────────────────────
CREATE TABLE IF NOT EXISTS public.beleza_services (
  id          TEXT        PRIMARY KEY,
  tenant_id   TEXT        NOT NULL,
  client_id   TEXT        NOT NULL REFERENCES public.beleza_clients(id) ON DELETE CASCADE,
  description TEXT        NOT NULL,
  value       NUMERIC     NOT NULL DEFAULT 0,
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabela de Configuração (1 linha por tenant) ─────────────
CREATE TABLE IF NOT EXISTS public.beleza_config (
  tenant_id           TEXT     PRIMARY KEY,
  default_alert_days  INTEGER  NOT NULL DEFAULT 30
);

-- ─── Índices para performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_beleza_clients_tenant_id    ON public.beleza_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_beleza_clients_name         ON public.beleza_clients(name);
CREATE INDEX IF NOT EXISTS idx_beleza_services_tenant_id   ON public.beleza_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_beleza_services_client_id   ON public.beleza_services(client_id);
CREATE INDEX IF NOT EXISTS idx_beleza_services_date        ON public.beleza_services(date DESC);
CREATE INDEX IF NOT EXISTS idx_beleza_config_tenant_id     ON public.beleza_config(tenant_id);

-- ─── Row Level Security (RLS) ─────────────────────────────────
ALTER TABLE public.beleza_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beleza_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beleza_config   ENABLE ROW LEVEL SECURITY;

-- ─── Políticas RLS ────────────────────────────────────────────
-- Acesso somente ao tenant do usuário autenticado
-- (baseado na FK profiles.org_id → organizations.id = tenant_id)

CREATE POLICY "beleza_clients_tenant_access" ON public.beleza_clients
  FOR ALL USING (
    tenant_id = (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "beleza_services_tenant_access" ON public.beleza_services
  FOR ALL USING (
    tenant_id = (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "beleza_config_tenant_access" ON public.beleza_config
  FOR ALL USING (
    tenant_id = (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─── Permissões ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beleza_clients  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beleza_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beleza_config   TO authenticated;
