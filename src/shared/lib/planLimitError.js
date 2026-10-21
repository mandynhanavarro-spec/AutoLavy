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
 * Erros das funcoes de sessao de caixa (open_cash_session /
 * close_cash_session -- migration cash_sessions_open_close).
 */
const CASH_SESSION_ERRORS = {
  CAIXA_JA_ABERTO:      'Este caixa já está aberto. Atualize a tela para continuar vendendo.',
  CAIXA_JA_FECHADO:     'Este caixa já foi fechado.',
  CAIXA_FECHADO:        'Este caixa está fechado. Abra o caixa para vender.',
  CAIXA_INVALIDO:       'Caixa não encontrado ou desativado.',
  SESSAO_INVALIDA:      'Não encontramos esta abertura de caixa. Atualize a tela.',
  SEM_PERMISSAO_ABRIR:  'Você não tem permissão para abrir o caixa.',
  SEM_PERMISSAO_FECHAR: 'Você não tem permissão para fechar o caixa. Peça a um gerente.',
  VALOR_INVALIDO:       'Informe um valor válido (zero ou mais).',
}

/**
 * Erros dos triggers de seguranca profiles_guard / organizations_guard
 * (migrations profiles_privilege_guard / organizations_privilege_guard).
 */
const PERMISSION_ERRORS = {
  PERFIL_SUPERADMIN_COM_LOJA: 'Esse cargo não pode ser usado para funcionários da loja.',
  PERFIL_CAMPO_PROTEGIDO:     'Você não pode alterar esse dado. Peça ao administrador da loja.',
  PERFIL_SEM_PERMISSAO:       'Só o administrador da loja pode alterar a equipe.',
  PERFIL_ADMIN_PROTEGIDO:     'Outro administrador da loja só pode ser alterado pelo suporte.',
  LOJA_CAMPO_PROTEGIDO:       'Esse dado da loja só pode ser alterado pelo suporte.',
  LOJA_SEM_PERMISSAO:         'Só o administrador da loja pode alterar as configurações.',
}

export function parsePermissionError(message) {
  if (!message) return null
  const key = Object.keys(PERMISSION_ERRORS).find(k => String(message).includes(k))
  return key ? PERMISSION_ERRORS[key] : null
}

export function parseCashSessionError(message) {
  if (!message) return null
  const key = Object.keys(CASH_SESSION_ERRORS).find(k => String(message).includes(k))
  return key ? CASH_SESSION_ERRORS[key] : null
}

/**
 * Dado um erro do supabase-js (ou uma string), devolve a mensagem amigavel
 * se for um erro conhecido (limite de plano, código de barras duplicado,
 * sessão de caixa), ou a mensagem original (ou `fallback`) caso contrario.
 */
export function friendlyError(error, fallback = 'Erro ao salvar. Tente novamente.') {
  const raw = typeof error === 'string' ? error : error?.message
  return parsePlanLimitError(raw) || parseSkuDuplicateError(raw) || parseCashSessionError(raw) || parsePermissionError(raw) || raw || fallback
}
