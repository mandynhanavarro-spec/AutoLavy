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
 * Dado um erro do supabase-js (ou uma string), devolve a mensagem amigavel
 * se for um erro de limite de plano, ou a mensagem original (ou `fallback`)
 * caso contrario.
 */
export function friendlyError(error, fallback = 'Erro ao salvar. Tente novamente.') {
  const raw = typeof error === 'string' ? error : error?.message
  return parsePlanLimitError(raw) || raw || fallback
}
