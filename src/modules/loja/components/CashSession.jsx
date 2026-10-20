import { useEffect, useState } from 'react'
import { X, ArrowDownCircle, ArrowUpCircle, Undo2, Wallet } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { friendlyError } from '../../../shared/lib/planLimitError'

/*
 * Sessão de caixa (abrir/fechar) -- usada pelo Caixa e pelo Fechamento.
 * O cálculo do esperado é do banco (cash_session_summary / close_cash_session,
 * migration cash_sessions_open_close); aqui só exibe.
 */

export function brl(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "50", "50,5", "1.234,56" ou "50.5" -> número; vazio -> 0; inválido -> NaN */
export function parseMoney(value) {
  const v = String(value ?? '').trim()
  if (!v) return 0
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
  return Number(normalized)
}

export function fmtOpenedAt(iso) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `hoje às ${time}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`
}

export function openedBeforeToday(iso) {
  const d = new Date(iso)
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return d < start
}

/** Resumo da sessão: vendas por forma + conta do dinheiro na gaveta. */
export function CashSummary({ summary }) {
  if (!summary) return null
  const rows = [
    { label: 'Troco inicial',      value: summary.opening_balance, sign: '' },
    { label: 'Vendas em dinheiro', value: summary.cash_sales,      sign: '+' },
    { label: 'Estornos em dinheiro', value: summary.estornos,      sign: '−', Icon: Undo2,           cls: 'text-red-600' },
    { label: 'Reforços',           value: summary.reforcos,        sign: '+', Icon: ArrowUpCircle,   cls: 'text-emerald-600' },
    { label: 'Sangrias',           value: summary.sangrias,        sign: '−', Icon: ArrowDownCircle, cls: 'text-red-600' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Dinheiro', value: summary.dinheiro, bg: 'bg-green-50',  text: 'text-green-600' },
          { label: 'PIX',      value: summary.pix,      bg: 'bg-sky-50',    text: 'text-sky-600' },
          { label: 'Débito',   value: summary.debito,   bg: 'bg-blue-50',   text: 'text-blue-600' },
          { label: 'Crédito',  value: summary.credito,  bg: 'bg-purple-50', text: 'text-purple-600' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-2.5`}>
            <p className={`text-[9px] font-bold ${m.text} uppercase tracking-wide`}>{m.label}</p>
            <p className="text-xs font-black text-gray-900 mt-0.5">{brl(m.value)}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        {summary.sales_count} venda{summary.sales_count !== 1 ? 's' : ''} · {brl(summary.total_sales)}
        {summary.voided_count > 0 && ` · ${summary.voided_count} estornada${summary.voided_count !== 1 ? 's' : ''}`}
      </p>

      <div className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100">
        {rows.filter(r => r.label === 'Troco inicial' || r.label === 'Vendas em dinheiro' || Number(r.value) > 0).map(r => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold text-gray-600">
              {r.Icon && <r.Icon size={13} className={r.cls} />}
              {r.label}
            </span>
            <span className={`text-[11px] font-black ${r.cls || 'text-gray-900'}`}>
              {r.sign}{brl(r.value)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-bold text-gray-700">Esperado na gaveta (dinheiro)</span>
          <span className="text-sm font-black text-gray-900">{brl(summary.expected_cash)}</span>
        </div>
      </div>
    </div>
  )
}

/** Diferença contado x esperado, com cor. */
export function CashDifference({ difference }) {
  const d = Math.round(Number(difference) * 100) / 100
  if (d === 0) return <span className="text-emerald-600 font-black">Confere</span>
  return d < 0
    ? <span className="text-red-600 font-black">Falta {brl(-d)}</span>
    : <span className="text-blue-600 font-black">Sobra {brl(d)}</span>
}

/**
 * Fechar a sessão: mostra o resumo, pede o valor contado na gaveta e
 * mostra a diferença na hora. Quem não tem can_close_cash é barrado no
 * banco (SEM_PERMISSAO_FECHAR) -- a tela só esconde o botão.
 */
export function CloseCashSessionModal({ session, registerName, color, onClose, onClosed }) {
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('cash_session_summary', { p_session_id: session.id })
      .then(({ data, error: e }) => {
        if (e) setLoadError(friendlyError(e, 'Não foi possível carregar o resumo do caixa.'))
        else setSummary(data)
      })
  }, [session.id])

  const countedValue = parseMoney(counted)
  const hasCounted   = counted.trim() !== '' && Number.isFinite(countedValue) && countedValue >= 0
  const difference   = summary && hasCounted ? countedValue - Number(summary.expected_cash) : null

  async function confirm() {
    if (!hasCounted) { setError('Informe quanto tem em dinheiro na gaveta.'); return }
    setSaving(true)
    setError('')
    const { data, error: e } = await supabase.rpc('close_cash_session', {
      p_session_id: session.id,
      p_counted:    countedValue,
      p_notes:      notes.trim() || null,
    })
    setSaving(false)
    if (e) { setError(friendlyError(e, 'Não foi possível fechar o caixa. Tente novamente.')); return }
    onClosed?.(data)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Fechar caixa</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {registerName ? `${registerName} · ` : ''}aberto {fmtOpenedAt(session.opened_at)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {loadError ? (
          <p className="text-sm text-red-500">{loadError}</p>
        ) : !summary ? (
          <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
        ) : (
          <>
            <CashSummary summary={summary} />

            <div>
              <label className="text-[11px] font-bold text-gray-500 mb-1 block">
                Quanto tem em dinheiro na gaveta? *
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 focus-within:ring-2">
                <Wallet size={16} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-400">R$</span>
                <input
                  value={counted}
                  onChange={e => setCounted(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="flex-1 text-sm outline-none bg-transparent"
                  autoFocus
                />
              </div>
              {difference !== null && (
                <p className="text-sm mt-2">
                  Contado {brl(countedValue)} · esperado {brl(summary.expected_cash)} · <CashDifference difference={difference} />
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 mb-1 block">Observação (opcional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex.: troco separado para amanhã"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2"
              />
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={saving || !summary || !hasCounted}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {saving ? 'Fechando...' : 'Fechar caixa'}
          </button>
        </div>
      </div>
    </div>
  )
}
