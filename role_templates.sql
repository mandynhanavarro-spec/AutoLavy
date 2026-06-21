-- ============================================================
-- AUTOLAVY - ROLE TEMPLATES + PERMISSOES ESTENDIDAS
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- 1. Adicionar permissoes que ainda nao existem na coluna de profiles
-- (can_close_cash e can_manage_products nao estavam no DEFAULT original)
-- A coluna ja existe, apenas atualizamos o DEFAULT para novos profiles:
ALTER TABLE public.profiles
  ALTER COLUMN permissions SET DEFAULT '{
    "can_void_sale": false,
    "can_edit_stock": false,
    "can_open_cash": true,
    "can_do_sangria": false,
    "can_view_reports": false,
    "can_close_cash": false,
    "can_manage_products": false
  }'::jsonb;

-- 2. Criar tabela role_templates
CREATE TABLE IF NOT EXISTS public.role_templates (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  base_role   public.user_role DEFAULT 'operador',
  permissions JSONB       DEFAULT '{
    "can_void_sale": false,
    "can_edit_stock": false,
    "can_open_cash": true,
    "can_do_sangria": false,
    "can_view_reports": false,
    "can_close_cash": false,
    "can_manage_products": false
  }'::jsonb,
  is_default  BOOLEAN     DEFAULT false,
  created_by  UUID        REFERENCES public.profiles(id),
  org_id      UUID        REFERENCES public.organizations(id) NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- org_id NULL = template global (superadmin)
-- org_id preenchido = template customizado por cliente

-- 3. Habilitar RLS
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

-- 4. Politica RLS:
--    - superadmin gerencia todos os globais (org_id IS NULL)
--    - cada org gerencia os proprios (org_id = sua org)
--    - todos os usuarios autenticados podem LER templates globais
DROP POLICY IF EXISTS role_templates_rls ON public.role_templates;
CREATE POLICY role_templates_rls ON public.role_templates
  FOR ALL
  USING (
    (org_id IS NULL AND public.is_superadmin())
    OR (org_id = public.get_my_org_id())
    OR (org_id IS NULL AND auth.uid() IS NOT NULL)
  )
  WITH CHECK (
    (org_id IS NULL AND public.is_superadmin())
    OR (org_id = public.get_my_org_id())
  );

-- 5. Grants
GRANT ALL ON public.role_templates TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 6. Templates globais padrao
INSERT INTO public.role_templates (name, description, base_role, permissions, is_default, org_id)
VALUES
  (
    'Operador Padrao',
    'Acesso basico: apenas abrir caixa e registrar vendas.',
    'operador',
    '{
      "can_void_sale": false,
      "can_edit_stock": false,
      "can_open_cash": true,
      "can_do_sangria": false,
      "can_view_reports": false,
      "can_close_cash": false,
      "can_manage_products": false
    }'::jsonb,
    true,
    NULL
  ),
  (
    'Gerente',
    'Gerencia caixa, estoque, sangria, relatorios e fechamento.',
    'gerente',
    '{
      "can_void_sale": false,
      "can_edit_stock": true,
      "can_open_cash": true,
      "can_do_sangria": true,
      "can_view_reports": true,
      "can_close_cash": true,
      "can_manage_products": false
    }'::jsonb,
    false,
    NULL
  ),
  (
    'Admin Completo',
    'Acesso total ao sistema, incluindo estorno de vendas e gerenciamento de produtos.',
    'admin',
    '{
      "can_void_sale": true,
      "can_edit_stock": true,
      "can_open_cash": true,
      "can_do_sangria": true,
      "can_view_reports": true,
      "can_close_cash": true,
      "can_manage_products": true
    }'::jsonb,
    false,
    NULL
  ),
  (
    'Caixa Simples',
    'Apenas abertura do caixa e registro de vendas. Ideal para operadores de turno.',
    'operador',
    '{
      "can_void_sale": false,
      "can_edit_stock": false,
      "can_open_cash": true,
      "can_do_sangria": false,
      "can_view_reports": false,
      "can_close_cash": false,
      "can_manage_products": false
    }'::jsonb,
    false,
    NULL
  )
ON CONFLICT DO NOTHING;

-- 7. Notificar PostgREST para recarregar schema
NOTIFY pgrst, 'reload schema';
