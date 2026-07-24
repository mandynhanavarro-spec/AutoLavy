import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'

/* ── constants ─────────────────────────────────────────────── */

const PERM_LABELS = {
  can_open_cash:       'Abrir caixa (PDV)',
  can_do_sangria:      'Fazer sangria',
  can_void_sale:       'Cancelar / Estornar venda',
  can_edit_stock:      'Editar estoque',
  can_manage_products: 'Gerenciar produtos',
  can_view_reports:    'Ver relatórios',
  can_close_cash:      'Fechar caixa',
}
const ALL_PERM_KEYS = Object.keys(PERM_LABELS)
const EMPTY_PERMS = { can_void_sale: false, can_edit_stock: false, can_open_cash: true, can_do_sangria: false, can_view_reports: false, can_close_cash: false, can_manage_products: false }

const initialTemplateForm = { name: '', description: '', base_role: 'operador', permissions: { ...EMPTY_PERMS }, is_default: false }

const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm'

/* ── component ─────────────────────────────────────────────── */

const FuncoesTab = forwardRef(function FuncoesTab({ loading, showSuccess, showError }, ref) {
  const [roleTemplates, setRoleTemplates]         = useState([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateForm, setTemplateForm]           = useState(initialTemplateForm)
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [templateSaving, setTemplateSaving]       = useState(false)
  const [templateError, setTemplateError]         = useState('')

  useEffect(() => { loadRoleTemplates() }, [])

  /* ── role templates ──────────────────────────────────────── */

  async function loadRoleTemplates() {
    const { data } = await supabase
      .from('role_templates')
      .select('*')
      .is('org_id', null)
      .order('created_at', { ascending: true })
    setRoleTemplates(data || [])
  }

  function openNewTemplate() {
    setEditingTemplateId(null)
    setTemplateForm(initialTemplateForm)
    setTemplateError('')
    setShowTemplateModal(true)
  }

  function openEditTemplate(tpl) {
    setEditingTemplateId(tpl.id)
    setTemplateForm({
      name: tpl.name,
      description: tpl.description || '',
      base_role: tpl.base_role || 'operador',
      permissions: { ...EMPTY_PERMS, ...tpl.permissions },
      is_default: tpl.is_default || false,
    })
    setTemplateError('')
    setShowTemplateModal(true)
  }

  async function saveTemplate(e) {
    e.preventDefault()
    if (!templateForm.name.trim()) { setTemplateError('Nome obrigatório.'); return }
    setTemplateSaving(true); setTemplateError('')
    try {
      const payload = {
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
        base_role: templateForm.base_role,
        permissions: templateForm.permissions,
        is_default: templateForm.is_default,
        org_id: null,
      }
      if (editingTemplateId) {
        const { error } = await supabase.from('role_templates').update(payload).eq('id', editingTemplateId)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('role_templates').insert(payload)
        if (error) throw new Error(error.message)
      }
      await loadRoleTemplates()
      setShowTemplateModal(false)
      showSuccess(editingTemplateId ? 'Template atualizado.' : 'Template criado.')
    } catch (err) {
      setTemplateError(err.message || 'Erro ao salvar.')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function deleteTemplate(tpl) {
    if (!window.confirm(`Excluir template "${tpl.name}"?`)) return
    const { error } = await supabase.from('role_templates').delete().eq('id', tpl.id)
    if (error) { showError(error, 'Erro ao excluir template.'); return }
    await loadRoleTemplates()
    showSuccess('Template excluído.')
  }

  useImperativeHandle(ref, () => ({ openNewTemplate }))

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      <section className="space-y-4">
        <p className="text-sm text-gray-500">
          Templates globais disponíveis para todas as organizações ao criar ou editar funcionários.
          Templates com org_id nulo são globais (gerenciados aqui).
        </p>

        {roleTemplates.length === 0 && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
            Nenhum template global cadastrado ainda.
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roleTemplates.map(tpl => {
            const perms = { ...EMPTY_PERMS, ...tpl.permissions }
            const activeCount = Object.values(perms).filter(Boolean).length
            return (
              <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-gray-900 text-sm">{tpl.name}</h3>
                      {tpl.is_default && (
                        <span className="text-[10px] font-black px-2 py-0.5 bg-violet-100 text-violet-600 rounded-full">Padrão</span>
                      )}
                    </div>
                    {tpl.description && <p className="text-xs text-gray-400 mt-0.5">{tpl.description}</p>}
                    <p className="text-[10px] text-gray-400 mt-1 capitalize">{tpl.base_role}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEditTemplate(tpl)}
                      className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-violet-50 flex items-center justify-center transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} className="text-gray-400 hover:text-violet-600" />
                    </button>
                    <button
                      onClick={() => deleteTemplate(tpl)}
                      className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-red-50 flex items-center justify-center transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {ALL_PERM_KEYS.map(key => (
                    <div key={key} className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${perms[key] ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${perms[key] ? 'bg-violet-500' : 'bg-gray-300'}`} />
                      {PERM_LABELS[key]}
                    </div>
                  ))}
                </div>

                <div className="text-xs text-gray-400 font-medium">
                  {activeCount} de {ALL_PERM_KEYS.length} permissões ativas
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* template modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">
                {editingTemplateId ? 'Editar Template' : 'Novo Template'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={saveTemplate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Nome *</label>
                <input required className={inp} value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Operador Padrão" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Descrição</label>
                <input className={inp} value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Role base</label>
                  <select className={inp} value={templateForm.base_role} onChange={e => setTemplateForm(f => ({ ...f, base_role: e.target.value }))}>
                    <option value="operador">Operador</option>
                    <option value="gerente">Gerente</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateForm.is_default}
                      onChange={e => setTemplateForm(f => ({ ...f, is_default: e.target.checked }))}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm font-bold text-gray-600">Template padrão</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Permissões</label>
                <div className="space-y-2">
                  {ALL_PERM_KEYS.map(key => (
                    <label key={key} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 cursor-pointer">
                      <span className="text-sm font-medium text-gray-700">{PERM_LABELS[key]}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(templateForm.permissions[key])}
                        onChange={e => setTemplateForm(f => ({ ...f, permissions: { ...f.permissions, [key]: e.target.checked } }))}
                        className="w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
              </div>
              {templateError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{templateError}</div>
              )}
              <button type="submit" disabled={templateSaving} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                {templateSaving ? 'Salvando...' : editingTemplateId ? 'Salvar alterações' : 'Criar template'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
})

export default FuncoesTab
