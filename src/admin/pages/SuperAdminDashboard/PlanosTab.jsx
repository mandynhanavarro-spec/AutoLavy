import { forwardRef, useImperativeHandle, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'

/* ── constants ─────────────────────────────────────────────── */

const PLAN_FEATURES = [
  { key: 'loja', label: 'Ativar Loja' },
  { key: 'servicos', label: 'Ativar Servicos' },
  { key: 'clientes', label: 'Ativar Clientes' },
  { key: 'produtos', label: 'Ativar Produtos' },
  { key: 'agenda', label: 'Ativar Agenda' },
  { key: 'relatorios', label: 'Ativar Relatorios' },
  { key: 'api', label: 'Ativar API' },
  { key: 'integracoes', label: 'Ativar Integracoes' },
]

const initialPlanForm = {
  name: '', slug: '', price: '', description: '', status: 'ativo',
  features: PLAN_FEATURES.reduce((a, f) => ({ ...a, [f.key]: false }), {}),
  limits: { max_users: 0, max_clients: 0, max_products: 0, max_services: 0 },
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

const PlanosTab = forwardRef(function PlanosTab(
  { plans, featuresByPlan, limitsByPlan, loading, loadAdminData, showSuccess, showError, startAction, finishAction, isActionRunning },
  ref
) {
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [planForm, setPlanForm]           = useState(initialPlanForm)

  function openEditPlan(plan) {
    const feats = featuresByPlan[plan.id] || {}
    const lims = limitsByPlan[plan.id] || {}
    setPlanForm({
      name: plan.name,
      slug: plan.slug,
      price: String(plan.price || ''),
      description: plan.description || '',
      status: plan.status || 'ativo',
      features: PLAN_FEATURES.reduce((a, f) => ({ ...a, [f.key]: Boolean(feats[f.key]) }), {}),
      limits: {
        max_users:    String(lims.max_users    || 0),
        max_clients:  String(lims.max_clients  || 0),
        max_products: String(lims.max_products || 0),
        max_services: String(lims.max_services || 0),
      },
    })
    setEditingPlanId(plan.id)
    setShowPlanModal(true)
  }

  const handleCreatePlan = async e => {
    e.preventDefault(); startAction('submit-plan')
    try {
      const isEditing = Boolean(editingPlanId)
      const planPayload = {
        name: planForm.name.trim(), slug: planForm.slug.trim(),
        price: Number(planForm.price || 0), description: planForm.description, status: planForm.status,
      }
      let planId
      if (isEditing) {
        const { error } = await supabase.from('saas_plans').update(planPayload).eq('id', editingPlanId)
        if (error) throw new Error(getErrorMessage(error, 'Erro ao atualizar plano.'))
        planId = editingPlanId
      } else {
        const { data: created, error } = await supabase.from('saas_plans').insert(planPayload).select().single()
        if (error || !created) throw new Error(getErrorMessage(error, 'Erro ao criar plano.'))
        planId = created.id
      }
      const { error: lErr } = await supabase.from('saas_plan_limits').upsert({
        plan_id: planId, max_users: Number(planForm.limits.max_users || 0),
        max_clients: Number(planForm.limits.max_clients || 0),
        max_products: Number(planForm.limits.max_products || 0),
        max_services: Number(planForm.limits.max_services || 0),
      }, { onConflict: 'plan_id' })
      if (lErr) { if (!isEditing) await supabase.from('saas_plans').delete().eq('id', planId); throw new Error(getErrorMessage(lErr, 'Erro ao salvar limites.')) }
      const { error: fErr } = await supabase.from('saas_plan_features').upsert(
        PLAN_FEATURES.map(f => ({ plan_id: planId, feature_key: f.key, enabled: Boolean(planForm.features[f.key]) })),
        { onConflict: 'plan_id,feature_key' }
      )
      if (fErr) { if (!isEditing) await supabase.from('saas_plans').delete().eq('id', planId); throw new Error(getErrorMessage(fErr, 'Erro ao salvar recursos.')) }
      await loadAdminData(); setPlanForm(initialPlanForm); setEditingPlanId(null); setShowPlanModal(false)
      showSuccess(isEditing ? 'Plano atualizado.' : 'Plano salvo.')
    } catch (err) { showError(err, 'Erro ao salvar plano.') }
    finally { finishAction() }
  }

  /* NOTA: abrir via header/Ações Rápidas não reseta planForm/editingPlanId
     antes de mostrar o modal — comportamento pré-existente, preservado
     intencionalmente (ver instruções da refatoração). */
  useImperativeHandle(ref, () => ({
    openNewPlan: () => setShowPlanModal(true),
  }))

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        {plans.map(plan => {
          const feats = featuresByPlan[plan.id] || {}
          const lims = limitsByPlan[plan.id] || {}
          return (
            <div key={plan.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{plan.description || 'Sem descrição'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge value={plan.status} />
                  <button
                    type="button"
                    onClick={() => openEditPlan(plan)}
                    className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-violet-50 flex items-center justify-center transition-colors"
                    title="Editar plano"
                  >
                    <Pencil size={13} className="text-gray-400 hover:text-violet-600" />
                  </button>
                </div>
              </div>
              <div className="text-3xl font-black" style={{ color: '#7c3aed' }}>
                R$ {Number(plan.price || 0).toFixed(2)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_FEATURES.map(f => (
                  <div key={f.key} className={`rounded-xl px-3 py-2.5 text-xs font-bold ${feats[f.key] ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-400'}`}>
                    {f.label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['Usuários', lims.max_users], ['Clientes', lims.max_clients], ['Produtos', lims.max_products], ['Serviços', lims.max_services]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-gray-50 p-3 text-gray-600">{l}: <strong>{v ?? 0}</strong></div>
                ))}
              </div>
            </div>
          )
        })}
        {!loading && plans.length === 0 && (
          <div className="rounded-2xl bg-white p-6 border border-gray-100 text-sm text-gray-400">Nenhum plano cadastrado.</div>
        )}
      </section>

      {/* plan modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">{editingPlanId ? 'Editar Plano' : 'Novo Plano'}</h3>
              <button onClick={() => { setShowPlanModal(false); setEditingPlanId(null); setPlanForm(initialPlanForm) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <input required placeholder="Nome do plano" className={inp} value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} />
                <input required placeholder="Slug" className={inp} value={planForm.slug} onChange={e => setPlanForm({ ...planForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <input type="number" step="0.01" min="0" placeholder="Valor mensal" className={inp} value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} />
                <select className={inp} value={planForm.status} onChange={e => setPlanForm({ ...planForm, status: e.target.value })}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <textarea placeholder="Descrição" className={inp + ' min-h-[80px] resize-none'} value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} />
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-bold text-gray-700 text-sm">Recursos Liberados</h4>
                  <div className="grid gap-2">
                    {PLAN_FEATURES.map(f => (
                      <label key={f.key} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 cursor-pointer">
                        <span className="text-sm font-medium text-gray-700">{f.label}</span>
                        <input type="checkbox" checked={Boolean(planForm.features[f.key])} onChange={e => setPlanForm({ ...planForm, features: { ...planForm.features, [f.key]: e.target.checked } })} />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-bold text-gray-700 text-sm">Limites</h4>
                  <div className="grid gap-3">
                    {[['max_users','Max. usuários'],['max_clients','Max. clientes'],['max_products','Max. produtos'],['max_services','Max. serviços']].map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">{label}</label>
                        <input type="number" min="0" className={inp} value={planForm.limits[key]} onChange={e => setPlanForm({ ...planForm, limits: { ...planForm.limits, [key]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="submit" disabled={isActionRunning('submit-plan')} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                {isActionRunning('submit-plan') ? 'Salvando...' : editingPlanId ? 'Atualizar Plano' : 'Salvar Plano'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
})

export default PlanosTab
