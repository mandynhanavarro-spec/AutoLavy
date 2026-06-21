export const genId     = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
export const fmtDate   = d  => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
export const fmtCur    = v  => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const daysSince = d  => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

export function openWA(phone, name) {
  const n   = phone.replace(/\D/g, '')
  const num = n.startsWith('55') ? n : '55' + n
  const msg = encodeURIComponent(
    `Olá ${name}! Tudo bem? 😊 Estou passando para avisar que já faz um tempinho desde sua última visita. Que tal agendarmos um horário?`
  )
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
}
