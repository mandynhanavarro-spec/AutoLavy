-- ============================================================
-- SALÃO STUDIO — Schema do Banco de Dados
-- Execute este script no Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- ─── Tabela de Clientes ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  notes       TEXT,
  alert_days  INTEGER,                        -- null = usa o padrão global
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabela de Serviços / Atendimentos ───────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id          TEXT        PRIMARY KEY,
  client_id   TEXT        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  description TEXT        NOT NULL,
  value       NUMERIC     NOT NULL DEFAULT 0,
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabela de Configuração (1 linha por salão) ──────────
CREATE TABLE IF NOT EXISTS public.config (
  id                  INTEGER  PRIMARY KEY DEFAULT 1,
  default_alert_days  INTEGER  NOT NULL DEFAULT 30
);

-- Insere a linha padrão de config se ainda não existir
INSERT INTO public.config (id, default_alert_days)
VALUES (1, 30)
ON CONFLICT (id) DO NOTHING;

-- ─── Índices para performance ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_services_client_id ON public.services(client_id);
CREATE INDEX IF NOT EXISTS idx_services_date       ON public.services(date DESC);
CREATE INDEX IF NOT EXISTS idx_clients_name        ON public.clients(name);

-- ─── Row Level Security (RLS) ────────────────────────────
-- Por enquanto desativado (app sem autenticação).
-- Quando adicionar auth, ative o RLS e adicione políticas por user_id.
ALTER TABLE public.clients  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.config   DISABLE ROW LEVEL SECURITY;

-- ─── Permissões para a chave anônima ────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config   TO anon;

-- ============================================================
-- PRÓXIMO PASSO (produção com múltiplos usuários):
-- 1. Adicione coluna user_id em clients e services
-- 2. Ative RLS nas três tabelas
-- 3. Crie políticas: WHERE user_id = auth.uid()
-- 4. Integre Supabase Auth no frontend
-- ============================================================
