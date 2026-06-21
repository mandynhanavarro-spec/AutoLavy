import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Lock } from 'lucide-react'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { useBeleza } from '../../context/BelezaContext'
import { fmtCur, daysSince } from '../../lib/helpers'
import ClientDetail from '../../components/ClientDetail'
import ClientForm from '../../components/ClientForm'

function Avatar({ name }) {
  const initials = name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
      {initials}
    </div>
  )
}

function AlertBadge({ days, alertDays }) {
  if (days === null) return <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">Sem visita</span>
  if (days >= alertDays)               return <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full">{days}d sem visita</span>
  if (days >= Math.floor(alertDays * 0.75)) return <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">{days}d sem visita</span>
  return <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">{days}d atrás</span>
}

export default function Clientes() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenant } = useTenantContext()
  const { clients, services, config, addClient, loading } = useBeleza()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const atLimit = tenant?.plan_limit_clients
    ? clients.length >= tenant.plan_limit_clients
    : false

  const nearLimit = tenant?.plan_limit_clients
    ? (clients.length >= Math.floor(tenant.plan_limit_clients * 0.8) && !atLimit)
    : false

  // Detalhe do cliente
  if (id) {
    const client = clients.find(c => c.id === id)
    if (!client && !loading) {
      return (
        <div className="p-4 text-center py-16">
          <p className="text-gray-400 text-sm">Cliente não encontrado.</p>
          <button onClick={() => navigate('/clientes')} className="mt-3 text-sm font-semibold text-purple-600 underline">
            Voltar para a lista
          </button>
        </div>
      )
    }
    if (!client) return null
    return (
      <ClientDetail
        client={client}
        onBack={() => navigate('/clientes')}
      />
    )
  }

  // Formulário de novo cliente
  if (showForm) {
    return (
      <ClientForm
        title="Nova Cliente"
        onSave={async data => {
          await addClient(data)
          setShowForm(false)
        }}
        onCancel={() => setShowForm(false)}
      />
    )
  }

  // Lista de clientes
  const filtered = clients.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  )
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">
          Clientes
          <span className="ml-2 text-sm font-semibold text-gray-400">
            {clients.length}{tenant?.plan_limit_clients ? `/${tenant.plan_limit_clients}` : ''}
          </span>
        </h1>
        {atLimit ? (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-400 cursor-not-allowed"
            disabled
          >
            <Lock size={14} />
            Limite atingido
          </button>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
            style={{ backgroundColor: '#9B72CF' }}
          >
            <Plus size={15} />
            Nova Cliente
          </button>
        )}
      </div>

      {/* Aviso de limite */}
      {(nearLimit || atLimit) && (
        <div className={`rounded-2xl border px-4 py-3 mb-4 flex items-start gap-3 ${
          atLimit ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-lg">{atLimit ? '🔒' : 'ℹ️'}</span>
          <div>
            <p className={`text-sm font-bold ${atLimit ? 'text-red-700' : 'text-amber-700'}`}>
              {atLimit
                ? 'Limite de clientes atingido!'
                : `Você usou ${clients.length} de ${tenant.plan_limit_clients} clientes`}
            </p>
            <p className={`text-xs mt-0.5 ${atLimit ? 'text-red-600' : 'text-amber-600'}`}>
              {atLimit
                ? 'Faça upgrade do plano para adicionar mais clientes.'
                : `Faltam ${tenant.plan_limit_clients - clients.length} clientes para atingir o limite.`}
            </p>
          </div>
        </div>
      )}

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
          <Users size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium">
            {search ? 'Nenhuma cliente encontrada' : 'Nenhuma cliente cadastrada ainda'}
          </p>
          {!search && !atLimit && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-sm font-bold text-purple-600 underline"
            >
              Cadastrar primeira cliente
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {sorted.map((c, i) => {
            const last = services
              .filter(s => s.clientId === c.id)
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            const days = last ? daysSince(last.date) : null
            const total = services.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.value, 0)
            const alertDays = c.alertDays || config.defaultAlertDays
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left ${
                  i < sorted.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Avatar name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.phone} · {services.filter(s => s.clientId === c.id).length} visitas
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-black text-purple-700">{fmtCur(total)}</span>
                  <AlertBadge days={days} alertDays={alertDays} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
