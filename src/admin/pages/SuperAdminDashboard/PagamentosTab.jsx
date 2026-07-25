import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'

/* ── constants ─────────────────────────────────────────────── */

const PAYMENT_METHOD_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartao' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferencia' },
]

const initialPaymentForm = {
  organization_id: '', amount: '', method: 'pix',
  status: 'pago', due_date: '', notes: '',
}

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

const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm'

const getErrorMessage = (err, fb) => err?.message || fb

/* ── sub-components ─────────────────────────────────────────── */

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_CLASSES[value] || 'bg-slate-100 text-slate-500'}`}>
      {String(value || 'n/a').replace(/_/g, ' ')}
    </span>
  )
}

/* ── component ─────────────────────────────────────────────── */

const PagamentosTab = forwardRef(function PagamentosTab(
  { payments, organizations, subscriptions, loading, loadAdminData, showSuccess, showError, startAction, finishAction, isActionRunning, isActive },
  ref
) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm]           = useState(initialPaymentForm)
  const [paymentSearch, setPaymentSearch]       = useState('')

  const filteredPayments = useMemo(() =>
    payments.filter(p => {
      const org = organizations.find(o => o.id === p.organization_id)
      const q = paymentSearch.toLowerCase()
      return !q || [org?.name, p.method, p.status].filter(Boolean).some(v => v.toLowerCase().includes(q))
    }),
  [payments, organizations, paymentSearch])

  const handleRegisterPayment = async e => {
    e.preventDefault(); startAction('submit-payment')
    try {
      if (!paymentForm.organization_id) throw new Error('Selecione o cliente.')
      if (Number(paymentForm.amount || 0) <= 0) throw new Error('Informe um valor maior que zero.')
      const sub = subscriptions.find(s => s.organization_id === paymentForm.organization_id)
      const { error } = await supabase.from('saas_payments').insert({
        organization_id: paymentForm.organization_id, subscription_id: sub?.id || null,
        amount: Number(paymentForm.amount || 0), method: paymentForm.method,
        status: paymentForm.status, due_date: paymentForm.due_date || null,
        paid_at: paymentForm.status === 'pago' ? new Date().toISOString() : null,
        notes: paymentForm.notes,
      })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao registrar pagamento.'))
      if (sub) {
        await supabase.from('saas_subscriptions').update({
          payment_status: paymentForm.status, due_date: paymentForm.due_date || sub.due_date,
          status: paymentForm.status === 'cancelado' ? 'cancelada' : sub.status,
        }).eq('id', sub.id)
      }
      await loadAdminData(); setPaymentForm(initialPaymentForm); setShowPaymentModal(false); showSuccess('Pagamento registrado.')
    } catch (err) { showError(err, 'Erro ao salvar pagamento.') }
    finally { finishAction() }
  }

  useImperativeHandle(ref, () => ({
    openPaymentModal: () => setShowPaymentModal(true),
  }))

  /* Componente fica sempre montado (ver SuperAdminDashboard.jsx) para que
     pagamentosTabRef funcione mesmo a partir de outra aba (ex.: Dashboard).
     Só pulamos a renderização quando não há nem aba ativa nem modal aberto —
     o modal precisa aparecer mesmo com isActive=false. */
  if (!isActive && !showPaymentModal) return null

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      {isActive && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input type="text" placeholder="Buscar pagamento" className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400" value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead style={{ background: '#f8f7ff' }}>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-black">
                    {['Data','Cliente','Valor','Método','Status','Vencimento'].map(h => (
                      <th key={h} className="px-5 py-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map(p => {
                    const org = organizations.find(o => o.id === p.organization_id)
                    return (
                      <tr key={p.id} className="border-t border-gray-50 text-sm hover:bg-gray-50/50">
                        <td className="px-5 py-3.5 text-gray-400 text-xs">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">{org?.name || 'Cliente removido'}</td>
                        <td className="px-5 py-3.5 font-bold text-gray-900">R$ {Number(p.amount || 0).toFixed(2)}</td>
                        <td className="px-5 py-3.5 capitalize text-gray-500">{p.method}</td>
                        <td className="px-5 py-3.5"><StatusBadge value={p.status} /></td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs">{p.due_date ? new Date(p.due_date).toLocaleDateString('pt-BR') : '-'}</td>
                      </tr>
                    )
                  })}
                  {!loading && filteredPayments.length === 0 && (
                    <tr><td colSpan="6" className="px-5 py-10 text-center text-sm text-gray-400">Nenhum pagamento registrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">Registrar Pagamento</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <select required className={inp} value={paymentForm.organization_id} onChange={e => setPaymentForm({ ...paymentForm, organization_id: e.target.value })}>
                <option value="">Selecione o cliente</option>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="grid md:grid-cols-2 gap-4">
                <input required type="number" step="0.01" min="0.01" placeholder="Valor" className={inp} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                <input type="date" className={inp} value={paymentForm.due_date} onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <select className={inp} value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                  {PAYMENT_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select className={inp} value={paymentForm.status} onChange={e => setPaymentForm({ ...paymentForm, status: e.target.value })}>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <textarea placeholder="Observação" className={inp + ' min-h-[80px] resize-none'} value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
              <button type="submit" disabled={isActionRunning('submit-payment')} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                {isActionRunning('submit-payment') ? 'Salvando...' : 'Registrar Pagamento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
})

export default PagamentosTab
