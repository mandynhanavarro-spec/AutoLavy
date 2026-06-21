import { useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { useBeleza } from '../../context/BelezaContext'
import { fmtCur } from '../../lib/helpers'

const MEDALS = ['🥇', '🥈', '🥉']

function Avatar({ name }) {
  const initials = name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
      {initials}
    </div>
  )
}

export default function Ranking() {
  const navigate = useNavigate()
  const { clients, services } = useBeleza()

  const ranked = [...clients]
    .map(c => ({
      ...c,
      total:  services.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.value, 0),
      visits: services.filter(s => s.clientId === c.id).length,
    }))
    .sort((a, b) => b.total - a.total)

  const maxTotal = ranked[0]?.total || 1

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={20} className="text-purple-600" />
        <h1 className="text-xl font-black text-gray-900">Ranking de Clientes</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs text-gray-400 font-semibold">Por faturamento total</p>
        </div>

        {ranked.length === 0 ? (
          <div className="py-14 text-center">
            <TrendingUp size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Nenhuma cliente cadastrada ainda</p>
          </div>
        ) : (
          ranked.map((c, i) => (
            <button
              key={c.id}
              onClick={() => navigate(`/clientes/${c.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors text-left ${
                i < ranked.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              {/* Posição */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-700'
                : i === 1 ? 'bg-gray-100 text-gray-600'
                : i === 2 ? 'bg-orange-100 text-orange-700'
                : 'bg-purple-50 text-purple-600'
              }`}>
                {i < 3 ? MEDALS[i] : `#${i + 1}`}
              </div>

              <Avatar name={c.name} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.visits} visita{c.visits !== 1 ? 's' : ''} · Ticket médio:{' '}
                  {c.visits > 0 ? fmtCur(c.total / c.visits) : '—'}
                </p>
              </div>

              {/* Barra de progresso + valor */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.total / maxTotal) * 100}%`,
                      backgroundColor: '#9B72CF',
                    }}
                  />
                </div>
                <span className="text-sm font-black text-purple-700 min-w-[80px] text-right">
                  {fmtCur(c.total)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
