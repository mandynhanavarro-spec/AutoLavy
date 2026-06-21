-- ============================================================
-- AUTOLAVY - MULTIPLOS PDVs POR ORGANIZACAO
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- Adicionar coluna product_filter em cash_registers
-- NULL = exibe todos os produtos
-- {"category_ids": ["uuid1", "uuid2"]} = filtra por categorias
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS product_filter JSONB DEFAULT NULL;

-- Notificar PostgREST para recarregar schema
NOTIFY pgrst, 'reload schema';
