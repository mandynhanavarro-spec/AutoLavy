// Rotulos e estilos da situacao de cobranca -- a situacao em si vem
// sempre de public.get_billing_status() (banco), nunca calculada de
// novo aqui. Este arquivo so traduz o valor pra exibicao.
export const BILLING_STATUS_META = {
  teste:          { label: 'Período de teste', cls: 'bg-blue-100 text-blue-700' },
  em_dia:         { label: 'Em dia',           cls: 'bg-emerald-100 text-emerald-700' },
  vence_em_breve: { label: 'Vence em breve',   cls: 'bg-amber-100 text-amber-700' },
  atrasado:       { label: 'Atrasado',         cls: 'bg-orange-100 text-orange-700' },
  suspenso:       { label: 'Suspenso',         cls: 'bg-rose-100 text-rose-700' },
  cancelado:      { label: 'Cancelado',        cls: 'bg-slate-200 text-slate-600' },
  sem_vencimento: { label: 'Sem vencimento',   cls: 'bg-amber-100 text-amber-700' },
}

export function billingStatusMeta(situacao) {
  return BILLING_STATUS_META[situacao] || { label: situacao || '—', cls: 'bg-slate-100 text-slate-500' }
}

export const BLOCKING_SITUACOES = ['suspenso', 'cancelado']
export const WARNING_SITUACOES = ['vence_em_breve', 'atrasado']
