import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BadgeDollarSign, Building2, CheckCircle2, CreditCard, Eye, EyeOff, Lock, WalletCards } from 'lucide-react'

/* ── constants ─────────────────────────────────────────────── */

const STATUS_CLASSES = {
  ativo:     'bg-emerald-100 text-emerald-700',
  ativa:     'bg-emerald-100 text-emerald-700',
  pago:      'bg-emerald-100 text-emerald-700',
  pendente:  'bg-amber-100 text-amber-700',
  atrasado:  'bg-rose-100 text-rose-700',
  suspenso:  'bg-orange-100 text-orange-700',
  suspensa:  'bg-orange-100 text-orange-700',
  cancelado: 'bg-slate-100 text-slate-500',
  cancelada: 'bg-slate-100 text-slate-500',
  bloqueado: 'bg-rose-100 text-rose-700',
  inativo:   'bg-slate-100 text-slate-500',
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-rose-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
]

/* ── sub-components ─────────────────────────────────────────── */

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_CLASSES[value] || 'bg-slate-100 text-slate-500'}`}>
      {String(value || 'n/a').replace(/_/g, ' ')}
    </span>
  )
}

function Avatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase()
  const cls = AVATAR_COLORS[name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0]
  return (
    <div className={`w-9 h-9 rounded-xl ${cls} flex items-center justify-center text-white font-black text-sm shrink-0`}>
      {letter}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-black text-violet-600">
        R$ {Number(payload[0].value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  )
}

/* ── component ─────────────────────────────────────────────── */

export default function DashboardTab({
  summary, revenueChange, monthlyRevenueData, organizationRows,
  invites, loading, isActionRunning, openEditInviteModal, copyInviteLink,
  onNewClient, onNewPlan, onRegisterPayment, onViewAllClients,
}) {
  const [valuesHidden, setValuesHidden] = useState(
    () => localStorage.getItem('superadmin_values_hidden') === 'true'
  )

  function toggleValues() {
    setValuesHidden(v => {
      const next = !v
      localStorage.setItem('superadmin_values_hidden', next)
      return next
    })
  }

  const recentCustomers = organizationRows.slice(0, 5)

  const metricCards = [
    { label: 'Total Clientes', value: summary.totalCustomers, icon: Building2, color: '#6366f1', bg: '#eef2ff', change: null },
    { label: 'Ativos', value: summary.activeCustomers, icon: CheckCircle2, color: '#10b981', bg: '#ecfdf5', change: null },
    { label: 'Suspensos', value: summary.suspendedCustomers, icon: Lock, color: '#f59e0b', bg: '#fffbeb', change: null },
    { label: 'Receita Mensal', value: `R$ ${summary.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: BadgeDollarSign, color: '#ec4899', bg: '#fdf2f8', change: revenueChange, isMoney: true },
    { label: 'Planos Ativos', value: summary.activePlans, icon: WalletCards, color: '#8b5cf6', bg: '#f5f3ff', change: null },
  ]

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      {/* metric cards header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Métricas</p>
        <button
          onClick={toggleValues}
          className="flex items-center gap-1 bg-white border font-semibold"
          style={{ borderColor: '#e5e7eb', borderRadius: '6px', padding: '3px 8px', color: '#9ca3af', fontSize: '11px' }}
        >
          {valuesHidden
            ? <><EyeOff size={11} style={{ color: '#9ca3af' }} />&nbsp;Mostrar</>
            : <><Eye    size={11} style={{ color: '#9ca3af' }} />&nbsp;Ocultar</>
          }
        </button>
      </div>

      {/* metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metricCards.map(({ label, value, icon: Icon, color, bg, change, isMoney }, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
              {change !== null && change !== undefined && (
                <span
                  className={`text-[10px] font-black px-2 py-1 rounded-lg ${change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                  style={isMoney && valuesHidden ? { opacity: 0 } : {}}
                >
                  {change >= 0 ? '+' : ''}{change}%
                </span>
              )}
            </div>
            <p
              className="text-xl font-black leading-none"
              style={
                isMoney && valuesHidden
                  ? { color: '#d1d5db', letterSpacing: '3px' }
                  : { color: '#111827' }
              }
            >
              {isMoney && valuesHidden ? '••••' : value}
            </p>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* chart + quick actions */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        {/* area chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-black text-gray-900 text-sm">Receita Mensal</h3>
              <p className="text-xs text-gray-400 mt-0.5">Últimos 6 meses</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              <span className="text-xs text-gray-400 font-medium">Receita</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyRevenueData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} width={55} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="receita" stroke="url(#strokeGrad)" strokeWidth={2.5} fill="url(#fillGrad)" dot={false} activeDot={{ r: 5, fill: '#8b5cf6', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* quick actions + pending invites */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-black text-gray-900 text-sm mb-4">Ações Rápidas</h3>
            <div className="space-y-2">
              <button onClick={onNewClient} className="w-full flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-indigo-700 font-bold text-sm hover:bg-indigo-100 transition-colors">
                <Building2 size={15} />Novo Cliente
              </button>
              <button onClick={onNewPlan} className="w-full flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-violet-700 font-bold text-sm hover:bg-violet-100 transition-colors">
                <WalletCards size={15} />Novo Plano
              </button>
              <button onClick={onRegisterPayment} className="w-full flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-colors">
                <CreditCard size={15} />Registrar Pagamento
              </button>
            </div>
          </div>

          {invites.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <h3 className="font-black text-amber-800 text-sm">Convites Pendentes</h3>
                <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full">{invites.length}</span>
              </div>
              <div className="space-y-2">
                {invites.slice(0, 3).map(invite => (
                  <div key={invite.id} className="rounded-xl bg-amber-50 p-3">
                    <p className="text-sm font-bold text-slate-800 truncate">{invite.store_name}</p>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => openEditInviteModal(invite)} className="text-xs font-bold text-amber-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5">Editar</button>
                      <button type="button" disabled={isActionRunning(`copy-link-${invite.token}`)} onClick={() => copyInviteLink(invite.token)} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-2.5 py-1.5 disabled:opacity-60">
                        {isActionRunning(`copy-link-${invite.token}`) ? '...' : 'Copiar link'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* recent clients */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-sm">Últimos Clientes</h3>
          <button onClick={onViewAllClients} className="text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors">Ver todos →</button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentCustomers.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar name={c.name} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 truncate">{c.responsible_name || 'Sem responsável'} · {c.planName}</p>
              </div>
              <div className="text-right shrink-0">
                <StatusBadge value={c.customer_status} />
                <p className="text-[10px] text-gray-400 mt-1">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          ))}
          {!loading && recentCustomers.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhum cliente cadastrado ainda.</div>
          )}
        </div>
      </div>
    </>
  )
}
