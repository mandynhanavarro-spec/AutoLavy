-- ============================================================
-- saas_plans: vincula cada plano a uma vertical (autolavy_products)
-- e desativa o plano "Startup2" (slug 'comecando'), que nao tem
-- nenhuma organizacao associada.
--
-- Contexto (auditoria de 2026-09-15): os 4 planos existentes
-- (Essencial, Profissional, Negocio, Startup2) foram todos criados
-- pensando na vertical "loja". Antes de white label / novos planos
-- por vertical, precisamos que saas_plans saiba a qual vertical
-- pertence.
--
-- NOTA (debito temporario): src/admin/pages/SuperAdminDashboard/PlanosTab.jsx
-- (tela "Novo Plano") ainda nao envia vertical_code no INSERT -- so tem
-- campo pra name/slug/price/description/status. Ate essa tela ganhar um
-- seletor de vertical, o DEFAULT 'loja' abaixo evita quebrar a criacao de
-- plano (unica vertical operacional hoje). Quando a tela for ajustada pra
-- enviar vertical_code explicitamente, remover este DEFAULT numa migration
-- futura para forcar escolha explicita.
-- ============================================================

-- (a) Nova coluna com default temporario 'loja' (ver nota acima).
-- O default tambem preenche as linhas existentes automaticamente, mas o
-- UPDATE do passo (b) fica como backfill explicito/idempotente.
ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS vertical_code text DEFAULT 'loja';

DO $$ BEGIN
  ALTER TABLE public.saas_plans
    ADD CONSTRAINT saas_plans_vertical_code_fkey
    FOREIGN KEY (vertical_code) REFERENCES public.autolavy_products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (b) Backfill: os 4 planos existentes pertencem a "loja"
UPDATE public.saas_plans
SET vertical_code = 'loja'
WHERE vertical_code IS NULL;

-- (c) Agora que todo mundo tem valor, torna a coluna obrigatoria.
-- O DEFAULT 'loja' do passo (a) continua valendo: um INSERT que nao
-- informe vertical_code (caso do PlanosTab.jsx hoje) continua funcionando,
-- so nao pode mais ser gravado como NULL explicitamente.
ALTER TABLE public.saas_plans
  ALTER COLUMN vertical_code SET NOT NULL;

-- (d) Desativa o plano Startup2 (sem organizacoes associadas)
UPDATE public.saas_plans
SET status = 'inativo'
WHERE slug = 'comecando';

-- (e) Correcao pontual do desync plan_type/plan_id da organizacao
-- "Tais" (id 6696bc6b-beb2-4832-b7ed-5ffbff610c7e): plan_type estava
-- travado em 'essencial' (desatualizado), enquanto plan_id ja apontava
-- para o plano "Profissional". Causa raiz: src/admin/pages/ClientOnboarding.jsx
-- atualizava plan_id sem tocar em plan_type (corrigido nesta mesma entrega).
-- plan_id e tratado como fonte de verdade -- alinhamos plan_type ao slug
-- do plano que plan_id ja aponta.
UPDATE public.organizations o
SET plan_type = sp.slug
FROM public.saas_plans sp
WHERE o.id = '6696bc6b-beb2-4832-b7ed-5ffbff610c7e'
  AND o.plan_id = sp.id
  AND o.plan_type IS DISTINCT FROM sp.slug;
