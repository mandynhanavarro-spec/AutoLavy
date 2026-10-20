import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Lock, AlertTriangle, Monitor,
  History, LayoutDashboard, Users,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { useModules } from '../../../../core/hooks/useModules'
import { usePermissions } from '../../../../core/hooks/usePermissions'
import {
  CashSummary, CashDifference, CloseCashSessionModal, brl, fmtOpenedAt, openedBeforeToday,
} from '../../components/CashSession'

/* ── helpers ─────────────────────────────────────────────── */

function todayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

/* ── component ───────────────────────────────────────────── */

// Fechamento por sessão de caixa (cash_sessions): cada caixa aberto mostra o
// resumo da sessão e fecha com o valor contado na gaveta. Os totais e o
// esperado vêm do banco (cash_session_summary / close_cash_session).
export default function Fechamento() {
  const { tenant } = useTenantContext()
  const { hasModule } = useModules()
  const { can }   = usePermissions()
  const canClose  = can('can_close_cash')
  const orgId     = tenant?.id
  // theme_color so e usado se o PLANO ATUAL tiver a feature white_label --
  // checado na exibicao, nao no momento em que foi salvo.
  const color     = (hasModule('white_label') && tenant?.theme_color) || '#0891b2'
  const navigate  = useNavigate()
  const historyRef = useRef(null)

  const [loading, setLoading]           = useState(true)
  const [registers, setRegisters]       = useState([])
  const [sessions, setSessions]         = useState({})   // register_id -> sessão aberta
  const [summaries, setSummaries]       = useState({})   // session_id -> resumo
  const [closings, setClosings]         = useState([])
  const [orphanToday, setOrphanToday]   = useState(0)    // vendas de hoje sem sessão
  const [closeTarget, setCloseTarget]   = useState(null) // { session, registerName }

  async function load() {
    if (!orgId) return
    setLoading(true)

    const [regsRes, sessRes, closingsRes, orphanRes] = await Promise.all([
      supabase
        .from('cash_registers')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('cash_sessions')
        .select('id, register_id, opened_at, opening_balance, profiles!user_id(full_name)')
        .eq('org_id', orgId)
        .eq('status', 'open'),
      supabase
        .from('cash_closings')
        .select('id, date, register_id, total_sales, total_transactions, total_dinheiro, total_pix, total_debito, total_credito, closed_at, notes, cash_sessions(opening_balance, closing_balance_expected, closing_balance_real)')
        .eq('org_id', orgId)
        .order('closed_at', { ascending: false })
        .limit(30),
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('session_id', null)
        .neq('status', 'voided')
        .gte('created_at', todayStart().toISOString()),
    ])

    const openSessions = sessRes.data || []
    const sessMap = Object.fromEntries(openSessions.map(s => [s.register_id, s]))
    const summaryResults = await Promise.all(
      openSessions.map(s => supabase.rpc('cash_session_summary', { p_session_id: s.id }))
    )
    const sumMap = {}
    openSessions.forEach((s, i) => { if (summaryResults[i].data) sumMap[s.id] = summaryResults[i].data })

    setRegisters(regsRes.data || [])
    setSessions(sessMap)
    setSummaries(sumMap)
    setClosings(closingsRes.data || [])
    setOrphanToday(orphanRes.count || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  /* ── loading skeleton */
  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  /* ── derived */
  const dayLabel     = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const isMulti      = registers.length >= 2
  const openList     = registers.filter(r => sessions[r.id])
  const quickTarget  = openList.length === 1 ? openList[0] : null
  const quickDisabled = !canClose || !quickTarget

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Mobile quick actions ── */}
      <div className="md:hidden grid grid-cols-2 gap-2.5">
        <button
          onClick={() => quickTarget && setCloseTarget({ session: sessions[quickTarget.id], registerName: quickTarget.name })}
          disabled={quickDisabled}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3"
          style={{ backgroundColor: quickDisabled ? '#e5e7eb' : color }}
        >
          <Lock size={22} style={{ color: quickDisabled ? '#9ca3af' : 'white' }} />
          <span
            className="text-[10px] font-bold"
            style={{ color: quickDisabled ? '#9ca3af' : 'white' }}
          >
            Fechar caixa
          </span>
        </button>

        <button
          onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <History size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Histórico</span>
        </button>

        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <LayoutDashboard size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Ir ao Dashboard</span>
        </button>

        <button
          onClick={() => navigate('/equipe')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <Users size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Equipe</span>
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900">Fechamento de caixa</h1>
        <p className="text-xs text-gray-400 capitalize mt-0.5">{dayLabel}</p>
      </div>

      {orphanToday > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-500">
          {orphanToday} venda{orphanToday !== 1 ? 's' : ''} de hoje {orphanToday !== 1 ? 'foram feitas' : 'foi feita'} antes
          da abertura de caixa e não {orphanToday !== 1 ? 'entram' : 'entra'} em nenhum fechamento.
        </div>
      )}

      {/* ── Caixas ── */}
      <div className="space-y-3">
        {isMulti && <h2 className="text-sm font-black text-gray-700">Caixas</h2>}

        {registers.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum caixa ativo.</p>
        )}

        {registers.map(reg => {
          const session = sessions[reg.id]
          const summary = session ? summaries[session.id] : null
          const stale   = session && openedBeforeToday(session.opened_at)

          return (
            <div key={reg.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '18' }}>
                    <Monitor size={16} style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{reg.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {session
                        ? <>Aberto {fmtOpenedAt(session.opened_at)}{session.profiles?.full_name ? ` por ${session.profiles.full_name}` : ''}</>
                        : 'Fechado · para vender, abra pela tela de Venda'}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  session ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {session ? 'Aberto' : 'Fechado'}
                </span>
              </div>

              {stale && (
                <div className="mx-4 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800">Aberto desde outro dia. Feche e abra de novo para começar o dia.</p>
                </div>
              )}

              {session && (
                <div className="px-4 pb-3">
                  {summary
                    ? <CashSummary summary={summary} />
                    : <p className="text-xs text-gray-400">Não foi possível carregar o resumo.</p>}
                </div>
              )}

              {session && (canClose ? (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => setCloseTarget({ session, registerName: reg.name })}
                    className="w-full py-2.5 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-transform"
                    style={{ backgroundColor: color }}
                  >
                    Fechar {isMulti ? reg.name : 'caixa'}
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-3 flex items-center gap-2">
                  <Lock size={13} className="text-gray-400" />
                  <p className="text-xs text-gray-400">Sem permissão para fechar</p>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Fechamentos anteriores */}
      {closings.length > 0 && (
        <div ref={historyRef}>
          <h2 className="text-sm font-black text-gray-700 mb-3">Fechamentos anteriores</h2>
          <div className="space-y-2">
            {closings.map(c => {
              const registerName = registers.find(r => r.id === c.register_id)?.name
              const sess = c.cash_sessions
              const hasCount = sess && sess.closing_balance_real != null && sess.closing_balance_expected != null
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <Clock size={15} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {new Date(c.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                            day: '2-digit', month: 'long', year: 'numeric',
                          })}
                        </p>
                        {isMulti && registerName && (
                          <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                            {registerName}
                          </span>
                        )}
                        <p className="text-[11px] text-gray-400">
                          {c.total_transactions} venda{c.total_transactions !== 1 ? 's' : ''} · fechado às{' '}
                          {new Date(c.closed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-gray-900">{brl(c.total_sales)}</p>
                      <div className="flex gap-1 justify-end mt-0.5">
                        {c.total_dinheiro > 0 && (
                          <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-bold">
                            {brl(c.total_dinheiro)}
                          </span>
                        )}
                        {c.total_pix > 0 && (
                          <span className="text-[9px] px-1 py-0.5 bg-sky-100 text-sky-700 rounded font-bold">
                            {brl(c.total_pix)}
                          </span>
                        )}
                        {c.total_debito > 0 && (
                          <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">
                            {brl(c.total_debito)}
                          </span>
                        )}
                        {c.total_credito > 0 && (
                          <span className="text-[9px] px-1 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">
                            {brl(c.total_credito)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasCount && (
                    <p className="text-[11px] text-gray-500 mt-2">
                      Troco inicial {brl(sess.opening_balance)} · esperado {brl(sess.closing_balance_expected)} ·
                      contado {brl(sess.closing_balance_real)} ·{' '}
                      <CashDifference difference={sess.closing_balance_real - sess.closing_balance_expected} />
                    </p>
                  )}
                  {c.notes && <p className="text-[11px] text-gray-400 mt-1">{c.notes}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {closeTarget && (
        <CloseCashSessionModal
          session={closeTarget.session}
          registerName={closeTarget.registerName}
          color={color}
          onClose={() => setCloseTarget(null)}
          onClosed={() => { setCloseTarget(null); load() }}
        />
      )}
    </div>
  )
}
