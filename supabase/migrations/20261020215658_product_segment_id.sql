-- PR-05 / PR-16 (eletronicos) + grant de get_plan_comparison.
--
-- 1. get_plan_comparison voltou a ser executavel por anon/PUBLIC (o
--    DROP/CREATE da migration plan_comparison_includes_max_registers devolveu
--    o grant padrao). So o Meu Plano (logado) chama.
REVOKE EXECUTE ON FUNCTION public.get_plan_comparison() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_comparison() TO authenticated;

-- 2. Tipo do produto gravado no proprio produto. Antes era so deduzido da
--    categoria ou de organizations.segment: um eletronico sem categoria
--    perdia o tipo ao reabrir. Ordem de leitura no frontend
--    (src/shared/lib/productSegment.js): categoria > products.segment_id >
--    organizations.segment. Coluna nullable: o site no ar ignora.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS segment_id text REFERENCES public.segments(id);

-- Backfill so dos produtos cujo tipo NAO vem da categoria, preservando o
-- tipo que eles tem hoje: com variacoes, o organizations.segment atual;
-- sem variacoes, o organizations.segment -- exceto moda/kit, que sem
-- variacoes ja se comportam como produto simples e viram 'geral'.
UPDATE public.products p
SET segment_id = CASE
    WHEN EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id)
      THEN COALESCE(o.segment, 'geral')
    WHEN COALESCE(o.segment, 'geral') IN ('moda', 'kit')
      THEN 'geral'
    ELSE COALESCE(o.segment, 'geral')
  END
FROM public.organizations o
WHERE o.id = p.org_id
  AND p.segment_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p.category_id AND c.segment_id IS NOT NULL
  )
  AND COALESCE(o.segment, 'geral') IN (SELECT id FROM public.segments);

-- 3. Loja Teste: organizations.segment tinha virado 'kit' pela edicao no
--    SuperAdmin (segments[0]). Corrigido para 'geral' (decisao da Mandy);
--    a causa foi corrigida no ClientesTab (primarySegment). Roda DEPOIS do
--    backfill, pra o produto com variacoes dela continuar kit.
UPDATE public.organizations
SET segment = 'geral'
WHERE id = 'e4e8e6b1-d189-4cf6-a7ef-acb2f7d9985c' AND segment = 'kit';
