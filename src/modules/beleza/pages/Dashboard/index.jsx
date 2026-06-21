import { useNavigate } from 'react-router-dom'
import { Users, DollarSign, Bell, TrendingUp, Scissors } from 'lucide-react'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { useBeleza } from '../../context/BelezaContext'
import { fmtCur, fmtDate, daysSince } from '../../lib/helpers'

function Avatar({ name, size = 'md' }) {
  const initials = name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${cls} rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { tenant } = useTenantContext()
  const { clients, services, alertClients, loading } = useBeleza()

  const color = tenant?.theme_color || '#9B72CF'

  const totalRevenue = services.reduce((sum, s) => sum + s.value, 0)
  const thisMonth = services
    .filter(s => {
      const d = new Date(s.date), n = new Date()
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
    })
    .reduce((sum, s) => sum + s.value, 0)

  const topClients = [...clients]
    .sort((a, b) => {
      const ta = services.filter(s => s.clientId === a.id).reduce((sum, s) => sum + s.value, 0)
      const tb = services.filter(s => s.clientId === b.id).reduce((sum, s) => sum + s.value, 0)
      return tb - ta
    })
    .slice(0, 5)

  const recentServices = [...services]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6)

  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  const stats = [
    { label: 'Total faturado', value: fmtCur(totalRevenue), icon: DollarSign, bg: 'bg-purple-500' },
    { label: 'Este mês',       value: fmtCur(thisMonth),    icon: TrendingUp, bg: 'bg-violet-500' },
    { label: 'Clientes',       value: clients.length,        icon: Users,      bg: 'bg-indigo-500' },
    { label: 'Alertas ativos', value: alertClients.length,   icon: Bell,       bg: alertClients.length > 0 ? 'bg-red-500' : 'bg-gray-400' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-6">

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-black text-gray-900">Dashboard</h1>
        </div>
        <button
          onClick={() => navigate('/clientes')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-md active:scale-95 transition-transform"
          style={{ backgroundColor: color }}
        >
          <Users size={15} />
          Clientes
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-400 font-semibold leading-tight">{label}</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon size={13} color="white" />
              </div>
            </div>
            <p className="text-xl font-black text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Top clientes */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-900">Top Clientes</h2>
          <button
            onClick={() => navigate('/ranking')}
            className="text-xs font-semibold border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Ver ranking
          </button>
        </div>

        {topClients.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <Users size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma cliente ainda</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {topClients.map((c, i) => {
              const total = services.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.value, 0)
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${i < topClients.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <span className="text-xs text-gray-400 w-5 text-center font-bold">#{i + 1}</span>
                  <Avatar name={c.name} size="sm" />
                  <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{c.name}</span>
                  <span className="text-sm font-black text-purple-700">{fmtCur(total)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Alertas */}
      {alertClients.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-900">
              <span className="text-red-500 mr-1">⚠️</span> Alertas de Retorno
            </h2>
            <button
              onClick={() => navigate('/alertas')}
              className="text-xs font-semibold border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Ver todos
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {alertClients.slice(0, 4).map((c, i) => {
              const last = services.filter(s => s.clientId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0]
              const dias = last ? daysSince(last.date) : null
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${i < Math.min(alertClients.length, 4) - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <Avatar name={c.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.phone}</p>
                  </div>
                  <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full shrink-0">
                    {dias}d
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Últimos atendimentos */}
      <div className="px-4 mt-5">
        <h2 className="text-sm font-black text-gray-900 mb-3">Últimos Atendimentos</h2>
        {recentServices.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <Scissors size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum atendimento registrado ainda</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {recentServices.map((s, i) => {
              const c = clients.find(cl => cl.id === s.clientId)
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i < recentServices.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  {c && <Avatar name={c.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.description}</p>
                    <p className="text-xs text-gray-400">{c?.name} · {fmtDate(s.date)}</p>
                  </div>
                  <span className="text-sm font-black text-purple-700 shrink-0">{fmtCur(s.value)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
