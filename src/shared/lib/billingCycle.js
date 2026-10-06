// Sugestoes de UI pro ciclo de cobranca -- o calculo que realmente
// vale (avanco de vencimento) vive so em public.next_due_date() no
// banco. Isto aqui e so pra preencher os campos do formulario antes
// do SuperAdmin confirmar e salvar.

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

// Proxima data (YYYY-MM-DD) com o dia informado, a partir de hoje.
// Se hoje ja e esse dia (ou passou), sugere o mes seguinte.
export function suggestNextDueDate(billingDay, fromDate = new Date()) {
  const day = Math.min(Math.max(Number(billingDay) || 1, 1), 31)
  let year = fromDate.getFullYear()
  let month = fromDate.getMonth()
  let clampedDay = Math.min(day, daysInMonth(year, month))
  let candidate = new Date(year, month, clampedDay)

  if (candidate <= fromDate) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
    clampedDay = Math.min(day, daysInMonth(year, month))
    candidate = new Date(year, month, clampedDay)
  }

  const mm = String(candidate.getMonth() + 1).padStart(2, '0')
  const dd = String(candidate.getDate()).padStart(2, '0')
  return `${candidate.getFullYear()}-${mm}-${dd}`
}

// Valor sugerido do ciclo: preco do plano (mensal) ou preco x meses
// cobrados no anual (ex.: 12 meses de plano, cobra so 10 -- "2 de
// bonus"). Sempre editavel depois pelo SuperAdmin.
export function suggestCycleAmount(cycle, planPrice, annualMonthsCharged) {
  const price = Number(planPrice || 0)
  if (cycle === 'anual') return Number((price * Number(annualMonthsCharged || 10)).toFixed(2))
  return price
}

export const BILLING_CYCLE_LABEL = {
  mensal: { label: 'Mensal', suffix: '/mês' },
  anual: { label: 'Anual', suffix: '/ano' },
}
