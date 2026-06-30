import { useState, useEffect } from 'react'
import {
  Building2, User,
  Lock, LogOut, Save, Eye, EyeOff, Sliders, Plus, Trash2, X, Monitor, Check, Grid3x3,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { PERM_LABELS, ALL_PERM_KEYS, DEFAULT_PERMISSIONS } from '../../../../core/hooks/usePermissions'

/* ── sub-components ──────────────────────────────────────── */

function Section({ title, icon: Icon, color, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + '18' }}
        >
          <Icon size={15} style={{ color }} />
        </div>
        <h2 className="text-sm font-black text-gray-900">{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

/* ── main component ──────────────────────────────────────── */

export default function Configuracoes() {
  const { tenant, profile } = useTenantContext()
  const orgId   = tenant?.id
  const color   = '#0891b2'
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'

  /* meus caixas */
  const [registers, setRegisters]       = useState([])
  const hasMultiplePDV                  = registers.filter(r => r.is_active).length >= 2
  const hasAnyCashRegisters             = registers.length >= 2
  const [regError, setRegError]         = useState('')
  const [regLoading, setRegLoading]     = useState(false)
  const [categories, setCategories]     = useState([])
  const [regEditId, setRegEditId]       = useState(null)
  const [regEditName, setRegEditName]   = useState('')
  const [regFilterId, setRegFilterId]   = useState(null)
  const [regSaving, setRegSaving]           = useState(false)
  const [togglingRegister, setTogglingRegister] = useState(null)
  const [addRegOpen, setAddRegOpen]     = useState(false)
  const [addRegName, setAddRegName]     = useState('')
  const [addRegDesc, setAddRegDesc]     = useState('')
  const [addRegSaving, setAddRegSaving] = useState(false)
  const [addRegError, setAddRegError]   = useState('')

  async function loadRegisters() {
    if (!orgId) return
    setRegLoading(true)
    setRegError('')
    const { data, error } = await supabase
      .from('cash_registers')
      .select('id, name, description, is_active, product_filter')
      .eq('org_id', orgId)
      .order('name')
    setRegLoading(false)
    if (error) { setRegError(error.message); return }
    setRegisters(data || [])
  }

  async function loadCategories() {
    if (!orgId) return
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name')
    setCategories(data || [])
  }

  useEffect(() => { loadRegisters(); loadCategories() }, [orgId])

  async function saveRegisterName(regId) {
    if (!regEditName.trim()) return
    setRegSaving(true)
    await supabase.from('cash_registers').update({ name: regEditName.trim() }).eq('id', regId).eq('org_id', orgId)
    setRegSaving(false)
    setRegEditId(null)
    loadRegisters()
  }

  async function toggleRegisterCategoryFilter(regId, categoryId, currentFilter) {
    const currentIds = currentFilter?.category_ids || null
    let nextIds
    if (!currentIds) {
      /* was "all" — now exclude this one (restrict to all others) */
      nextIds = categories.filter(c => c.id !== categoryId).map(c => c.id)
    } else if (currentIds.includes(categoryId)) {
      nextIds = currentIds.filter(id => id !== categoryId)
      if (nextIds.length === 0 || nextIds.length === categories.length) nextIds = null
    } else {
      nextIds = [...currentIds, categoryId]
      if (nextIds.length === categories.length) nextIds = null
    }
    const product_filter = nextIds ? { category_ids: nextIds } : null
    await supabase.from('cash_registers').update({ product_filter }).eq('id', regId).eq('org_id', orgId)
    /* update local state immediately */
    setRegisters(prev => prev.map(r => r.id === regId ? { ...r, product_filter } : r))
  }

  async function addRegister() {
    if (!addRegName.trim()) { setAddRegError('Nome obrigatório.'); return }
    setAddRegSaving(true); setAddRegError('')
    console.log('[addRegister] inserindo com org_id =', orgId)
    const { data, error } = await supabase.from('cash_registers').insert({
      org_id: orgId,
      name: addRegName.trim(),
      description: addRegDesc.trim() || null,
      is_active: true,
    }).select()
    console.log('[addRegister] data =', data, '| error =', error)
    setAddRegSaving(false)
    if (error) { setAddRegError(error.message); return }
    setAddRegOpen(false)
    setAddRegName('')
    setAddRegDesc('')
    loadRegisters()
  }

  async function toggleRegisterActive(reg) {
    setTogglingRegister(reg.id)
    await supabase
      .from('cash_registers')
      .update({ is_active: !reg.is_active })
      .eq('id', reg.id)
      .eq('org_id', orgId)
    setTogglingRegister(null)
    loadRegisters()
  }

  async function resetRegisterFilter(regId) {
    await supabase.from('cash_registers').update({ product_filter: null }).eq('id', regId).eq('org_id', orgId)
    setRegisters(prev => prev.map(r => r.id === regId ? { ...r, product_filter: null } : r))
  }

  /* org templates */
  const [templates, setTemplates]     = useState([])
  const [tplModal, setTplModal]       = useState(false)
  const [tplForm, setTplForm]         = useState({ name: '', description: '', base_role: 'operador', permissions: { ...DEFAULT_PERMISSIONS } })
  const [tplSaving, setTplSaving]     = useState(false)
  const [tplError, setTplError]       = useState('')

  /* grade de variações (moda / kit) */
  const [gradeConfig, setGradeConfig]       = useState({ cores: [], tamanhos: [], numeros: [], pacotes: [] })
  const [gradeInput, setGradeInput]         = useState({ cores: '', tamanhos: '', numeros: '', pacotes: '' })
  const [gradeSaving, setGradeSaving]       = useState(false)
  const [gradeError, setGradeError]         = useState('')
  const [gradeTemplates, setGradeTemplates] = useState([])
  const [hasGradeCategories, setHasGradeCategories] = useState(false)
  const [orgSegments, setOrgSegments]       = useState([])
  const [hasKitCategories, setHasKitCategories] = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('categories')
      .select('id, segment_id')
      .eq('org_id', orgId)
      .in('segment_id', ['moda', 'kit'])
      .then(({ data }) => setHasGradeCategories((data || []).length > 0))
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('categories')
      .select('id, segment_id')
      .eq('org_id', orgId)
      .eq('segment_id', 'kit')
      .then(({ data }) => setHasKitCategories((data || []).length > 0))
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    supabase.from('organization_segments').select('segment_id').eq('org_id', orgId)
      .then(({ data: orgSegsData }) => {
        const slugs = (orgSegsData || []).map(r => r.segment_id)
        if (!slugs.length) { setOrgSegments([]); return }
        supabase.from('segments').select('id, name').in('id', slugs)
          .then(({ data: segData }) => setOrgSegments(segData || []))
      })
  }, [orgId])

  const hasModa = orgSegments?.some(s => s.id === 'moda')

  async function loadTemplates() {
    if (!orgId) return
    const { data } = await supabase
      .from('role_templates')
      .select('id, name, description, base_role, permissions, is_default, org_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    setTemplates(data || [])
  }

  async function loadGradeTemplates() {
    const { data } = await supabase
      .from('grade_templates')
      .select('id, name, description, cores, tamanhos, numeros')
      .order('sort_order')
    setGradeTemplates(data || [])
  }

  useEffect(() => { loadTemplates() }, [orgId])
  useEffect(() => {
    if (!orgId) return
    supabase.from('organizations').select('grade_config').eq('id', orgId).single()
      .then(({ data }) => {
        if (data?.grade_config) {
          setGradeConfig({
            cores:    data.grade_config.cores    || [],
            tamanhos: data.grade_config.tamanhos || [],
            numeros:  data.grade_config.numeros  || [],
            pacotes:  data.grade_config.pacotes  || [],
          })
        }
      })
    loadGradeTemplates()
  }, [orgId])

  async function saveTemplate() {
    if (!tplForm.name.trim()) { setTplError('Nome obrigatório.'); return }
    setTplSaving(true); setTplError('')
    const { error } = await supabase.from('role_templates').insert({
      name: tplForm.name.trim(),
      description: tplForm.description.trim() || null,
      base_role: tplForm.base_role,
      permissions: tplForm.permissions,
      org_id: orgId,
      created_by: profile?.id || null,
    })
    setTplSaving(false)
    if (error) { setTplError(error.message); return }
    setTplModal(false)
    setTplForm({ name: '', description: '', base_role: 'operador', permissions: { ...DEFAULT_PERMISSIONS } })
    loadTemplates()
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Excluir este template?')) return
    await supabase.from('role_templates').delete().eq('id', id).eq('org_id', orgId)
    loadTemplates()
  }

  /* grade de variações */
  async function saveGradeConfig(newConfig) {
    setGradeSaving(true)
    await supabase.from('organizations').update({ grade_config: newConfig }).eq('id', orgId)
    setGradeConfig(newConfig)
    setGradeSaving(false)
  }

  function addGradeItem(group) {
    const val = gradeInput[group].trim()
    if (!val) return
    if (gradeConfig[group].map(v => v.toLowerCase()).includes(val.toLowerCase())) {
      setGradeError(`"${val}" já existe.`)
      return
    }
    setGradeError('')
    setGradeInput(f => ({ ...f, [group]: '' }))
    saveGradeConfig({ ...gradeConfig, [group]: [...gradeConfig[group], val] })
  }

  function removeGradeItem(group, val) {
    setGradeError('')
    saveGradeConfig({ ...gradeConfig, [group]: gradeConfig[group].filter(v => v !== val) })
  }

  async function applyGradeTemplate(tpl) {
    if (!window.confirm(`Isso vai ADICIONAR as cores/tamanhos/numeração do modelo "${tpl.name}" à sua configuração atual. Continuar?`)) return
    function merge(existing, incoming) {
      const seen = new Set(existing.map(v => v.toLowerCase()))
      return [...existing, ...(incoming || []).filter(v => !seen.has(v.toLowerCase()))]
    }
    await saveGradeConfig({
      cores:    merge(gradeConfig.cores,    tpl.cores),
      tamanhos: merge(gradeConfig.tamanhos, tpl.tamanhos),
      numeros:  merge(gradeConfig.numeros,  tpl.numeros),
      pacotes:  gradeConfig.pacotes,
    })
  }

  /* store form — initialized once from tenant */
  const [storeForm, setStoreForm] = useState(() => ({
    name:          tenant?.name          || '',
    phone:         tenant?.phone         || '',
    cnpj:          tenant?.cnpj          || '',
    address:       tenant?.address       || '',
    contact_email: tenant?.contact_email || '',
    whatsapp:      tenant?.whatsapp      || '',
  }))
  const [savingStore, setSavingStore] = useState(false)
  const [storeSaved, setStoreSaved]   = useState(false)
  const [storeError, setStoreError]   = useState('')

  /* password form */
  const [pwForm, setPwForm]   = useState({ newPass: '', confirmPass: '' })
  const [showPw, setShowPw]   = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError]   = useState('')
  const [pwSaved, setPwSaved]   = useState(false)

  /* ── store save ──────────────────────────────────────── */
  async function saveStore() {
    if (!orgId || !isAdmin) return
    setStoreError('')
    setSavingStore(true)
    const { error } = await supabase
      .from('organizations')
      .update({
        name:          storeForm.name.trim(),
        phone:         storeForm.phone.trim(),
        cnpj:          storeForm.cnpj.trim(),
        address:       storeForm.address.trim(),
        contact_email: storeForm.contact_email.trim(),
        whatsapp:      storeForm.whatsapp.trim(),
      })
      .eq('id', orgId)
    setSavingStore(false)

    if (error) { setStoreError(error.message); return }

    setStoreSaved(true)
    setTimeout(() => setStoreSaved(false), 3000)
  }

  /* ── password change ─────────────────────────────────── */
  async function changePassword() {
    setPwError('')
    if (pwForm.newPass.length < 6) { setPwError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (pwForm.newPass !== pwForm.confirmPass) { setPwError('As senhas não coincidem.'); return }
    setSavingPw(true)
    const { data, error } = await supabase.auth.updateUser({ password: pwForm.newPass })
    console.log('[changePassword]', { data, error })
    setSavingPw(false)
    if (error) { setPwError(error.message); return }
    if (!data?.user) { setPwError('Senha não atualizada. Verifique se "Secure password change" está desativado no painel Supabase (Authentication → Providers → Email).'); return }
    setPwForm({ newPass: '', confirmPass: '' })
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 3000)
  }

  /* ── shared styles ───────────────────────────────────── */
  const inputCls    = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const disabledCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-400 cursor-not-allowed'

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 space-y-5">
      <h1 className="text-xl font-black text-gray-900">Configurações</h1>

      {/* ════ Dados da loja ════ */}
      <Section title="Dados da loja" icon={Building2} color={color}>
        {!isAdmin && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
            Apenas administradores podem editar os dados da loja.
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome da loja">
            <input
              value={storeForm.name}
              onChange={e => setStoreForm(f => ({ ...f, name: e.target.value }))}
              disabled={!isAdmin}
              className={isAdmin ? inputCls : disabledCls}
              placeholder="Nome da loja"
            />
          </Field>
          <Field label="CNPJ">
            <input
              value={storeForm.cnpj}
              onChange={e => setStoreForm(f => ({ ...f, cnpj: e.target.value }))}
              disabled={!isAdmin}
              placeholder="00.000.000/0001-00"
              className={isAdmin ? inputCls : disabledCls}
            />
          </Field>
          <Field label="Telefone">
            <input
              value={storeForm.phone}
              onChange={e => setStoreForm(f => ({ ...f, phone: e.target.value }))}
              disabled={!isAdmin}
              placeholder="(00) 0000-0000"
              className={isAdmin ? inputCls : disabledCls}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={storeForm.whatsapp}
              onChange={e => setStoreForm(f => ({ ...f, whatsapp: e.target.value }))}
              disabled={!isAdmin}
              placeholder="(00) 00000-0000"
              className={isAdmin ? inputCls : disabledCls}
            />
          </Field>
          <Field label="E-mail de contato">
            <input
              type="email"
              value={storeForm.contact_email}
              onChange={e => setStoreForm(f => ({ ...f, contact_email: e.target.value }))}
              disabled={!isAdmin}
              placeholder="contato@loja.com"
              className={isAdmin ? inputCls : disabledCls}
            />
          </Field>
          <Field label="Endereço">
            <input
              value={storeForm.address}
              onChange={e => setStoreForm(f => ({ ...f, address: e.target.value }))}
              disabled={!isAdmin}
              placeholder="Rua, número, bairro, cidade"
              className={isAdmin ? inputCls : disabledCls}
            />
          </Field>
        </div>

        {storeError && <p className="text-xs text-red-500 font-medium">{storeError}</p>}

        {isAdmin && (
          <button
            onClick={saveStore}
            disabled={savingStore}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm disabled:opacity-60 transition-colors"
            style={{ backgroundColor: storeSaved ? '#10b981' : color }}
          >
            <Save size={14} />
            {storeSaved ? 'Dados salvos!' : savingStore ? 'Salvando...' : 'Salvar dados'}
          </button>
        )}
      </Section>

      {/* ════ Grade de Variações (moda / kit) ════ */}
      {isAdmin && hasGradeCategories && (
        <Section title="Grade de Variações" icon={Grid3x3} color={color}>
          <p className="text-xs text-gray-500">
            Configure as opções de variações disponíveis para seus produtos.
          </p>

          {hasModa && gradeTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Começar com um modelo:</p>
              <div className="flex flex-wrap gap-2">
                {gradeTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyGradeTemplate(tpl)}
                    className="flex flex-col items-start px-3 py-2 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white transition-all text-left"
                  >
                    <span className="text-xs font-bold text-gray-700">{tpl.name}</span>
                    {tpl.description && (
                      <span className="text-[10px] text-gray-400 mt-0.5">{tpl.description}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gradeError && (
            <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {gradeError}
            </p>
          )}

          {[
            { key: 'cores',    label: 'Cores',     placeholder: 'Ex: Azul Marinho, Vermelho...', visible: hasModa },
            { key: 'tamanhos', label: 'Tamanhos',  placeholder: 'Ex: P, M, G, GG...',             visible: true },
            { key: 'numeros',  label: 'Numeração', placeholder: 'Ex: 36, 37, 38...',              visible: hasModa },
            { key: 'pacotes',  label: 'Pacotes',   placeholder: 'Ex: 1kg, 4kg, 10kg',             visible: hasKitCategories },
          ].filter(f => f.visible).map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {gradeConfig[key].length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Nenhum valor cadastrado.</p>
                ) : (
                  gradeConfig[key].map(val => (
                    <span key={val} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-bold text-gray-700">
                      {val}
                      <button
                        type="button"
                        onClick={() => removeGradeItem(key, val)}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={gradeInput[key]}
                  onChange={e => { setGradeInput(f => ({ ...f, [key]: e.target.value })); setGradeError('') }}
                  onKeyDown={e => e.key === 'Enter' && addGradeItem(key)}
                  placeholder={placeholder}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => addGradeItem(key)}
                  disabled={!gradeInput[key].trim() || gradeSaving}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 transition-colors"
                  style={{ backgroundColor: color }}
                >
                  <Plus size={13} />
                  Adicionar
                </button>
              </div>
            </div>
          ))}

          {gradeSaving && (
            <p className="text-[10px] text-gray-400 text-right">Salvando automaticamente...</p>
          )}
        </Section>
      )}

      {/* ════ Minha conta ════ */}
      <Section title="Minha conta" icon={User} color={color}>
        {/* Profile summary */}
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0"
            style={{ backgroundColor: color }}
          >
            {(profile?.full_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{profile?.full_name || 'Usuário'}</p>
            <p className="text-xs text-gray-400 capitalize mt-0.5">{profile?.role || 'operador'}</p>
          </div>
        </div>

        {/* Change password */}
        <div className="space-y-3 pt-1">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Lock size={11} />
            Alterar senha
          </p>

          <Field label="Nova senha">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pwForm.newPass}
                onChange={e => setPwForm(f => ({ ...f, newPass: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className={inputCls + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Field label="Confirmar nova senha">
            <input
              type={showPw ? 'text' : 'password'}
              value={pwForm.confirmPass}
              onChange={e => setPwForm(f => ({ ...f, confirmPass: e.target.value }))}
              placeholder="Repita a senha"
              className={inputCls}
            />
          </Field>

          {pwError && (
            <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {pwError}
            </p>
          )}

          <button
            onClick={changePassword}
            disabled={savingPw || !pwForm.newPass}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm disabled:opacity-60 transition-colors"
            style={{ backgroundColor: pwSaved ? '#10b981' : color }}
          >
            <Lock size={14} />
            {pwSaved ? 'Senha alterada!' : savingPw ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </Section>

      {/* ════ Templates de Função ════ */}
      {isAdmin && (
        <Section title="Cargos e Permissões" icon={Sliders} color={color}>
          <p className="text-xs text-gray-500">
            Crie cargos com permissões personalizadas para esta organização. Ficam disponíveis ao criar ou editar funcionários.
          </p>

          {templates.length > 0 && (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{t.name}</p>
                    {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                  </div>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="w-8 h-8 rounded-lg bg-white hover:bg-red-50 flex items-center justify-center transition-colors"
                    title="Excluir template"
                  >
                    <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setTplModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm font-bold hover:border-gray-400 transition-colors w-full justify-center"
          >
            <Plus size={14} />
            Novo cargo
          </button>
        </Section>
      )}

      {/* ════ Meus Caixas ════ */}
      {hasAnyCashRegisters && (
      <Section title="Meus Caixas" icon={Monitor} color={color}>
        <p className="text-xs text-gray-500">
          Visualize e configure os caixas ativos desta organização.
          {isAdmin ? (hasMultiplePDV ? ' Renomeie e defina quais categorias cada PDV exibe.' : ' Renomeie os caixas desta organização.') : ''}
        </p>

        {regLoading && (
          <p className="text-xs text-gray-400 text-center py-2">Carregando caixas...</p>
        )}

        {regError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-bold text-red-600">Erro ao carregar caixas</p>
            <p className="text-xs text-red-500 font-mono break-all">{regError}</p>
            <p className="text-[11px] text-red-400">orgId: {orgId || 'undefined'}</p>
          </div>
        )}

        {!regLoading && !regError && registers.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">Nenhum caixa cadastrado ainda.</p>
        )}

        {!regLoading && !regError && registers.length > 0 && (
          <div className="space-y-3">
            {registers.map(reg => {
              const isEditingName   = regEditId === reg.id
              const isFilterOpen    = regFilterId === reg.id
              const activeIds       = reg.product_filter?.category_ids || null
              const allSelected     = !activeIds
              return (
                <div key={reg.id} className={`bg-gray-50 rounded-2xl overflow-hidden${!reg.is_active ? ' opacity-50' : ''}`}>
                  {/* row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: color + '20' }}
                    >
                      <Monitor size={16} style={{ color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditingName && isAdmin ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={regEditName}
                            onChange={e => setRegEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRegisterName(reg.id) }}
                            className="flex-1 text-sm font-bold outline-none bg-white border border-gray-200 rounded-xl px-3 py-1.5 min-w-0"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRegisterName(reg.id)}
                            disabled={regSaving}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 text-white disabled:opacity-40"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setRegEditId(null)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 text-gray-600"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-bold text-gray-800 truncate">{reg.name}</p>
                          {reg.description && (
                            <p className="text-xs text-gray-400 truncate">{reg.description}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${reg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {reg.is_active ? 'Ativo' : 'Oculto'}
                    </span>

                    {isAdmin && !isEditingName && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setRegEditId(reg.id); setRegEditName(reg.name) }}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          Renomear
                        </button>
                        {hasMultiplePDV && (
                          <button
                            onClick={() => setRegFilterId(isFilterOpen ? null : reg.id)}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${isFilterOpen ? 'border-transparent text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                            style={isFilterOpen ? { backgroundColor: color } : {}}
                          >
                            Categorias
                          </button>
                        )}
                        <button
                          onClick={() => toggleRegisterActive(reg)}
                          disabled={togglingRegister === reg.id}
                          title={reg.is_active ? 'Ocultar caixa' : 'Mostrar caixa'}
                          className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors disabled:opacity-40 flex items-center"
                        >
                          {reg.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* category filter panel */}
                  {isFilterOpen && isAdmin && hasMultiplePDV && (
                    <div className="border-t border-gray-200 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
                          Categorias visíveis neste PDV
                        </p>
                        {!allSelected && (
                          <button
                            onClick={() => resetRegisterFilter(reg.id)}
                            className="text-[10px] font-bold text-gray-400 hover:text-gray-600 underline"
                          >
                            Exibir todas
                          </button>
                        )}
                      </div>

                      {categories.length === 0 ? (
                        <p className="text-xs text-gray-400">Nenhuma categoria cadastrada.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {categories.map(cat => {
                            const selected = allSelected || (activeIds && activeIds.includes(cat.id))
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => toggleRegisterCategoryFilter(reg.id, cat.id, reg.product_filter)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                  selected
                                    ? 'text-white border-transparent'
                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                                style={selected ? { backgroundColor: color } : {}}
                              >
                                {cat.name}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400 mt-1">
                        {allSelected ? 'Exibindo todos os produtos' : `${activeIds?.length || 0} de ${categories.length} categorias selecionadas`}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </Section>
      )}

      {/* ── Modal: Adicionar Caixa ── */}
      {addRegOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">Novo Caixa</h2>
              <button onClick={() => setAddRegOpen(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block">
                Nome *
              </label>
              <input
                value={addRegName}
                onChange={e => setAddRegName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRegister()}
                placeholder="Ex: Caixa 2, Balcão, Delivery..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 bg-white"
                style={{ '--tw-ring-color': color }}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block">
                Descrição (opcional)
              </label>
              <input
                value={addRegDesc}
                onChange={e => setAddRegDesc(e.target.value)}
                placeholder="Ex: Caixa do andar de cima"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 bg-white"
              />
            </div>

            {hasMultiplePDV && (
              <p className="text-[11px] text-gray-400">
                Após criar, configure quais categorias de produtos este caixa exibe clicando em "Categorias".
              </p>
            )}

            {addRegError && (
              <p className="text-xs text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {addRegError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAddRegOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={addRegister}
                disabled={!addRegName.trim() || addRegSaving}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60"
                style={{ backgroundColor: color }}
              >
                {addRegSaving ? 'Criando...' : 'Criar Caixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Logout ════ */}
      <button
        onClick={() => supabase.auth.signOut()}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-red-200 text-red-500 font-bold text-sm hover:bg-red-50 transition-colors"
      >
        <LogOut size={16} />
        Sair da conta
      </button>

      {/* ── Template Modal ── */}
      {tplModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">Novo cargo</h2>
              <button onClick={() => setTplModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Nome *</label>
              <input
                value={tplForm.name}
                onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Caixa Fim de Semana"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Descrição</label>
              <input
                value={tplForm.description}
                onChange={e => setTplForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Opcional"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-2 block uppercase tracking-wide">Permissões</label>
              <div className="space-y-2">
                {ALL_PERM_KEYS.map(key => (
                  <label key={key} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 cursor-pointer">
                    <span className="text-sm text-gray-700">{PERM_LABELS[key]}</span>
                    <button
                      type="button"
                      onClick={() => setTplForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }))}
                      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${tplForm.permissions[key] ? '' : 'bg-gray-200'}`}
                      style={tplForm.permissions[key] ? { backgroundColor: color } : {}}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${tplForm.permissions[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                ))}
              </div>
            </div>

            {tplError && (
              <p className="text-xs text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {tplError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setTplModal(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                disabled={tplSaving}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60"
                style={{ backgroundColor: color }}
              >
                {tplSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
