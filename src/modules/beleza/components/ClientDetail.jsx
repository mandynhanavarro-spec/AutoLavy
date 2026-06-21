import { useState } from 'react'
import { ArrowLeft, Scissors, Trash2, Edit, Bell, MessageCircle, Plus } from 'lucide-react'
import { useBeleza } from '../context/BelezaContext'
import { fmtDate, fmtCur, daysSince, openWA } from '../lib/helpers'
import ServiceForm from './ServiceForm'
import ClientForm from './ClientForm'

function Avatar({ name }) {
  const initials = name?.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-lg font-bold shrink-0">
      {initials}
    </div>
  )
}

function AlertBadge({ days, alertDays }) {
  if (days === null) return <span className="text-[11px] font-semibold bg-purple-100 text-purple-700 px-3 py-1 rounded-full">Sem visita</span>
  if (days >= alertDays)              return <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-3 py-1 rounded-full">{days}d sem visita</span>
  if (days >= Math.floor(alertDays * 0.75)) return <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">{days}d sem visita</span>
  return <span className="text-[11px] font-semibold bg-green-100 text-green-700 px-3 py-1 rounded-full">{days}d atrás</span>
}

export default function ClientDetail({ client, onBack }) {
  const { clients, services, config, updateClient, deleteClient, addService, deleteService } = useBeleza()
  const [mode, setMode] = useState('detail') // 'detail' | 'edit' | 'add-service'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingAlert, setEditingAlert] = useState(false)
  const [alertVal, setAlertVal] = useState(client.alertDays || config.defaultAlertDays)

  const clientServices = [...services.filter(s => s.clientId === client.id)]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const total    = clientServices.reduce((sum, s) => sum + s.value, 0)
  const last     = clientServices[0]
  const days     = last ? daysSince(last.date) : null
  const alertDays = client.alertDays || config.defaultAlertDays

  if (mode === 'edit') {
    return (
      <ClientForm
        title={`Editar — ${client.name}`}
        initial={{ ...client, alertDays: client.alertDays || '' }}
        onSave={async data => {
          await updateClient(client.id, {
            ...data,
            alertDays: data.alertDays ? Number(data.alertDays) : undefined,
          })
          setMode('detail')
        }}
        onCancel={() => setMode('detail')}
      />
    )
  }

  if (mode === 'add-service') {
    return (
      <ServiceForm
        clients={clients}
        selectedClientId={client.id}
        onSave={async data => {
          await addService(data)
          setMode('detail')
        }}
        onCancel={() => setMode('detail')}
      />
    )
  }

  return (
    <div className="p-4 md:p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Voltar
      </button>

      <div className="grid md:grid-cols-[1fr_auto] gap-4 mb-4 items-start">

        {/* Card principal */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4 mb-5">
            <Avatar name={client.name} />
            <div>
              <h2 className="text-xl font-black text-gray-900">{client.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{client.phone}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              ['Total faturado', fmtCur(total)],
              ['Visitas', clientServices.length],
              ['Última visita', last ? fmtDate(last.date) : '—'],
              ['Dias sem visita', days !== null ? `${days}d` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</p>
                <p className="text-lg font-black text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {client.notes && (
            <div className="bg-purple-50 rounded-xl p-3 text-sm text-purple-800 leading-relaxed">
              {client.notes}
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="flex md:flex-col gap-2 flex-wrap">
          <button
            onClick={() => openWA(client.phone, client.name)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors"
          >
            <MessageCircle size={15} />
            WhatsApp
          </button>
          <button
            onClick={() => setMode('add-service')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-colors"
            style={{ backgroundColor: '#9B72CF' }}
          >
            <Plus size={15} />
            Atendimento
          </button>
          <button
            onClick={() => setMode('edit')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            <Edit size={15} />
            Editar
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors mt-2"
          >
            <Trash2 size={15} />
            Excluir
          </button>
        </div>
      </div>

      {/* Alerta de retorno */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-purple-500" />
            <span className="text-sm font-bold text-gray-900">Alerta de Retorno</span>
          </div>
          {!editingAlert && (
            <button
              onClick={() => setEditingAlert(true)}
              className="text-xs font-semibold text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              Personalizar
            </button>
          )}
        </div>
        <div className="px-6 py-4 flex items-center gap-4">
          {editingAlert ? (
            <>
              <span className="text-sm text-gray-700">Alertar após</span>
              <input
                type="number"
                min={1}
                max={365}
                value={alertVal}
                onChange={e => setAlertVal(Number(e.target.value))}
                className="w-20 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-purple-400"
              />
              <span className="text-sm text-gray-700">dias sem visita</span>
              <button
                onClick={() => { updateClient(client.id, { alertDays: alertVal }); setEditingAlert(false) }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: '#9B72CF' }}
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingAlert(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${days >= alertDays ? 'bg-red-100' : 'bg-purple-100'}`}>
                <Bell size={20} className={days >= alertDays ? 'text-red-600' : 'text-purple-600'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {days >= alertDays
                    ? `⚠️ Alerta ativo — ${days} dias sem visita!`
                    : days !== null
                    ? `✅ ${days} dias desde a última visita`
                    : 'Sem visitas registradas'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Alerta: {alertDays} dias · {client.alertDays ? 'personalizado' : 'padrão global'}
                </p>
              </div>
              <AlertBadge days={days} alertDays={alertDays} />
            </>
          )}
        </div>
      </div>

      {/* Histórico de atendimentos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors size={16} className="text-purple-500" />
            <span className="text-sm font-bold text-gray-900">Histórico de Atendimentos</span>
          </div>
          <span className="text-xs text-gray-400">
            {clientServices.length} visitas · {fmtCur(total)}
          </span>
        </div>

        {clientServices.length === 0 ? (
          <div className="py-12 text-center">
            <Scissors size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Nenhum atendimento ainda</p>
          </div>
        ) : (
          clientServices.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-4 px-6 py-4 ${i < clientServices.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Scissors size={16} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{s.description}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(s.date)}</p>
              </div>
              <span className="text-base font-black text-purple-700">{fmtCur(s.value)}</span>
              <button
                onClick={() => deleteService(s.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
            <p className="text-4xl mb-4">⚠️</p>
            <h3 className="text-lg font-black text-gray-900 mb-2">Excluir {client.name}?</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Todos os atendimentos serão excluídos permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await deleteClient(client.id)
                  onBack()
                }}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition-colors"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
