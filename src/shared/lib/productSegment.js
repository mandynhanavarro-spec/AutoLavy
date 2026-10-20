/**
 * Tipo de produto (segmento) -- uma regra so, usada por Produtos e Caixa.
 *
 * O tipo efetivo de um produto vem, nesta ordem:
 *   1. da categoria (categories.segment_id) -- se tiver, manda e fica travado;
 *   2. do proprio produto (products.segment_id, migration product_segment_id)
 *      -- produto sem categoria guarda o tipo escolhido no cadastro;
 *   3. da regra antiga (organizations.segment) -- so pra produto salvo antes
 *      da coluna existir e que o backfill nao cobriu.
 */

// Ordem fixa de exibicao (e de "primeiro segmento" quando nao ha geral).
export const SEGMENT_ORDER = ['geral', 'moda', 'kit', 'eletronicos']

export const SEGMENT_TYPE_LABELS = {
  geral:       'Produto único — um preço, um estoque',
  moda:        'Roupa / Calçado — variação de cor e tamanho',
  kit:         'Kit ou Pacote — vários tamanhos e quantidades',
  eletronicos: 'Eletrônicos — série, IMEI e garantia',
}

export function resolveProductSegment(product, catSegmentMap, orgSegment) {
  return (product?.category_id && catSegmentMap?.[product.category_id])
    || product?.segment_id
    || orgSegment
    || 'geral'
}

/**
 * Segmentos da loja (ids de organization_segments) em ordem fixa. Loja antiga
 * sem nenhuma linha em organization_segments cai no organizations.segment.
 */
export function orgSegmentIds(orgSegments, orgSegment) {
  const ids = (orgSegments || []).map(s => (typeof s === 'string' ? s : s.id))
  const list = ids.length > 0 ? ids : [orgSegment || 'geral']
  return SEGMENT_ORDER.filter(id => list.includes(id))
    .concat(list.filter(id => !SEGMENT_ORDER.includes(id)))
}

/** Padrao: o unico segmento da loja; senao geral, se a loja tiver; senao o primeiro. */
export function defaultSegmentType(segmentIds) {
  if (segmentIds.length === 1) return segmentIds[0]
  if (segmentIds.includes('geral')) return 'geral'
  return segmentIds[0] || 'geral'
}

/** Opcoes do seletor de tipo: segmentos da loja + o valor atual (na edicao). */
export function segmentTypeOptions(segmentIds, currentValue) {
  const ids = currentValue && !segmentIds.includes(currentValue)
    ? [...segmentIds, currentValue]
    : segmentIds
  return ids.map(id => ({ id, label: SEGMENT_TYPE_LABELS[id] || id }))
}
