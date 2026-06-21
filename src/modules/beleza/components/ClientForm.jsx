import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

export default function ClientForm({ initial, onSave, onCancel, title }) {
  const [form, setForm] = useState(
    initial || { name: '', phone: '', notes: '', alertDays: '' }
  )
  const [saving, setSaving] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.name.trim() && form.phone.trim()

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

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
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Nome completo *
            </label>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              placeholder="Ex: Ana Paula Silva"
              value={form.name}
              onChange={set('name')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Telefone / WhatsApp *
            </label>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              placeholder="Ex: 11 99999-9999"
              value={form.phone}
              onChange={set('phone')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Observações
            </label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition resize-none"
              placeholder="Cor favorita, alergias, preferências..."
              value={form.notes}
              onChange={set('notes')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Alerta personalizado (dias)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              placeholder="Deixe em branco para usar o padrão global"
              value={form.alertDays}
              onChange={set('alertDays')}
            />
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
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
