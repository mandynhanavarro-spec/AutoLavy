import { useState } from 'react'
import { ArrowLeft, Scissors } from 'lucide-react'

export default function ServiceForm({ clients, selectedClientId, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    clientId: selectedClientId || '',
    description: '',
    value: '',
    date: today,
  })
  const [saving, setSaving] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.clientId && form.description.trim() && form.value && form.date

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Voltar
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Scissors size={16} className="text-purple-500" />
          <h2 className="text-base font-bold text-gray-900">Registrar Atendimento</h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Cliente *
            </label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              value={form.clientId}
              onChange={set('clientId')}
            >
              <option value="">Selecione a cliente...</option>
              {sorted.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Serviço realizado *
            </label>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              placeholder="Ex: Corte + escova, Coloração, Hidratação..."
              value={form.description}
              onChange={set('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Valor (R$) *
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                placeholder="0,00"
                value={form.value}
                onChange={set('value')}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Data *
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                value={form.date}
                onChange={set('date')}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#9B72CF' }}
            >
              {saving ? 'Salvando...' : 'Registrar atendimento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
