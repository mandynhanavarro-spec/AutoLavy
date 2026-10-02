import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Botão de copiar genérico, mesmo padrão visual/comportamental do CopyBtn
 * usado em src/modules/loja/pages/Equipe/index.jsx (que fica local naquele
 * arquivo e não foi tocado, pra não arriscar regressão). Usado nas telas de
 * criação de funcionário em lote (Onboarding, ClientOnboarding) pra poder
 * copiar login+senha de cada funcionário criado com um clique.
 */
export default function CopyButton({ text, color = '#2563eb' }) {
  const [done, setDone] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
      style={{ color, backgroundColor: color + '18' }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? 'Copiado!' : 'Copiar'}
    </button>
  )
}
