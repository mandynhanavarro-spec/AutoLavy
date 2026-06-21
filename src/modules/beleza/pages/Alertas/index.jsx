import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, MessageCircle, User } from 'lucide-react'
import { useBeleza } from '../../context/BelezaContext'
import { fmtDate, daysSince, openWA } from '../../lib/helpers'

function Avatar({ name }) {
  const initials = name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
      {initials}
    </div>
  )
}

export default function Alertas() {
  const navigate = useNavigate()
  const { clients, services, config, alertClients, saveConfig } = useBeleza()
  const [editGlobal, setEditGlobal] = useState(false)
  const [globalDays, setGlobalDays] = useState(config.defaultAlertDays)
  const [saving, setSaving] = useState(false)

  const sorted = [...alertClients].sort((a, b) => {
    const la = services.filter(s => s.clientId === a.id).sort((x, y) => new Date(y.date) - new Date(x.date))[0]
    const lb = services.filter(s => s.clientId === b.id).sort((x, y) => new Date(y.date) - new Date(x.date))[0]
    return daysSince(la?.date || a.createdAt) - daysSince(lb?.date || b.createdAt)
  }).reverse()

  async function handleSaveConfig() {
    setSaving(true)
    try {
      await saveConfig(globalDays)
      setEditGlobal(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-black text-gray-900 mb-4">Alertas de Retorno</h1>

      {/* Config global */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-purple-500" />
            <span className="text-sm font-bold text-gray-900">Configuração Global</span>
          </div>
          {!editGlobal && (
            <button
              onClick={() => { setGlobalDays(config.defaultAlertDays); setEditGlobal(true) }}
              className="text-xs font-semibold text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              Editar
            </button>
          )}
        </div>
        <div className="px-6 py-4">
          {editGlobal ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-700">Alertar após</span>
              <input
                type="number"
                min={1}
                max={365}
                value={globalDays}
                onChange={e => setGlobalDays(Number(e.target.value))}
                className="w-20 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-purple-400"
              />
              <span className="text-sm text-gray-700">dias sem visita</span>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: '#9B72CF' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditGlobal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Bell size={18} className="text-purple-600" />
              </div>
              <p className="text-sm text-gray-700">
                Alerta padrão: <strong>{config.defaultAlertDays} dias</strong> sem visita
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lista de alertas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className={`px-6 py-4 border-b flex items-center gap-2 ${alertClients.length > 0 ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}>
          <Bell
            size={16}
            className={alertClients.length > 0 ? 'text-red-500' : 'text-gray-400'}
          />
          <span className={`text-sm font-bold ${alertClients.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {alertClients.length > 0
              ? `${alertClients.length} cliente(s) precisam de atenção`
              : 'Nenhum alerta ativo'}
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm text-gray-400 font-medium">Nenhuma cliente sumida!</p>
          </div>
        ) : (
          sorted.map((c, i) => {
            const last = services
              .filter(s => s.clientId === c.id)
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            const dias = last ? daysSince(last.date) : null
            const alertDays = c.alertDays || config.defaultAlertDays
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-4 ${i < sorted.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <Avatar name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {last
                      ? `Última visita: ${fmtDate(last.date)} · ${last.description}`
                      : 'Nenhuma visita registrada'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Alerta: {alertDays} dias{c.alertDays ? ' (personalizado)' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full">
                    {dias}d
                  </span>
                  <button
                    onClick={() => openWA(c.phone, c.name)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors"
                  >
                    <MessageCircle size={12} />
                    WA
                  </button>
                  <button
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User size={12} />
                    Perfil
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
