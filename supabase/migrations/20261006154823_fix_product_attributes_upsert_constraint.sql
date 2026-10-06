-- O upsert de product_attributes (onConflict: 'product_id') nunca
-- funcionou: nao havia constraint unica em product_id pro Postgres aceitar
-- o ON CONFLICT. Resultado: a tabela sempre esteve vazia (0 linhas),
-- mesmo com produtos eletronicos cadastrados -- serie/IMEI/garantia eram
-- descartados silenciosamente (so logava no console, erro visivel so lá).
ALTER TABLE public.product_attributes
  ADD CONSTRAINT product_attributes_product_id_key UNIQUE (product_id);
