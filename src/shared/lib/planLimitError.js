/**
 * Traduz o erro RAISE EXCEPTION 'LIMITE_PLANO:<recurso>:<limite>' (trigger
 * check_plan_limit() no banco -- migration enforce_plan_limits) em mensagem
 * amigavel, sem jargao tecnico.
 *
 * Funciona mesmo quando a mensagem chega com prefixo (ex.: a edge function
 * create-employee antepoe "Erro ao criar perfil: " antes de repassar o erro
 * cru do Postgres) -- por isso usamos um regex de busca, nao de match exato.
 */
const PATTERN = /LIMITE_PLANO:(produtos|usuarios|caixas):(\d+)/

export function parsePlanLimitError(message) {
  if (!message) return null
  const match = String(message).match(PATTERN)
  if (!match) return null
  const limit = parseInt(match[2], 10)

  switch (match[1]) {
    case 'produtos':
      return `Seu plano permite até ${limit} produto${limit === 1 ? '' : 's'}. Fale com a gente para ampliar.`
    case 'usuarios': {
      const extra = limit - 1
      return extra <= 0
        ? 'Seu plano não permite adicionar funcionários. Fale com a gente para ampliar.'
        : `Seu plano permite você + ${extra} funcionário${extra === 1 ? '' : 's'}. Fale com a gente para ampliar.`
    }
    case 'caixas':
      return `Seu plano permite até ${limit} caixa${limit === 1 ? '' : 's'}. Fale com a gente para ampliar.`
    default:
      return null
  }
}

/**
 * Traduz o erro RAISE EXCEPTION 'SKU_DUPLICADO:<nome do produto>' (triggers
 * check_sku_variant_vs_product_sku / check_product_sku_vs_sku_variant --
 * migration sku_variant_conflict_check) em mensagem amigavel. O nome do
 * produto pode conter ':' -- por isso o regex captura tudo ate o fim da
 * mensagem, nao so o primeiro token.
 */
const SKU_DUP_PATTERN = /SKU_DUPLICADO:(.+)/s

export function parseSkuDuplicateError(message) {
  if (!message) return null
  const match = String(message).match(SKU_DUP_PATTERN)
  if (!match) return null
  return `Esse código já está em uso no produto ${match[1].trim()}.`
}

/**
 * Dado um erro do supabase-js (ou uma string), devolve a mensagem amigavel
 * se for um erro de limite de plano ou de código de barras duplicado, ou a
 * mensagem original (ou `fallback`) caso contrario.
 */
export function friendlyError(error, fallback = 'Erro ao salvar. Tente novamente.') {
  const raw = typeof error === 'string' ? error : error?.message
  return parsePlanLimitError(raw) || parseSkuDuplicateError(raw) || raw || fallback
}
