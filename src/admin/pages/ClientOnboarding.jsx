import { useState, useEffect } from 'react'
import {
  ArrowLeft, Plus, Trash2, X, Check, Monitor, Users, Package,
  Building2, MessageCircle, Copy, ChevronRight, Tag,
  CheckCircle2, Clock, AlertCircle,
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'

/* ── helpers ───────────────────────────────────────────────── */

function genPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!'
  let p = ''
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

function formatPhone(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function makeSlug(name) {
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + crypto.randomUUID().split('-')[0]
}

/*
 * Steps: 1=Empresa  2=Acesso&Plano  3=Caixas&Cat  4=Equipe  5=Produtos  6=Conclusão
 */
const STEP_LABELS = ['Empresa', 'Acesso & Plano', 'Caixas & Categorias', 'Equipe', 'Produtos']
const TOTAL_STEPS = 5
const CONCLUSION  = 6
const SESSION_KEY = 'autolavy_onboarding'

const VERTICAL_OPTIONS = [
  { value: 'loja',    label: 'Meu Caixa'   },
  { value: 'servico', label: 'Meu Serviço' },
  { value: 'beleza',  label: 'Meu Studio'  },
]

const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm border border-gray-200'

/* ── stepper ───────────────────────────────────────────────── */

function Stepper({ step }) {
  return (
    <div className="flex items-center mb-8">
      {STEP_LABELS.map((label, i) => {
        const s = i + 1
        const isDone   = step > s || step === CONCLUSION
        const isActive = step === s
        return (
          <div key={s} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                isDone   ? 'bg-violet-600 text-white'
                : isActive ? 'bg-violet-600 text-white ring-4 ring-violet-100'
                : 'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? <Check size={13} /> : s}
              </div>
              <span className={`text-[9px] font-bold hidden sm:block whitespace-nowrap ${
                isActive ? 'text-violet-700' : isDone ? 'text-violet-400' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>
            {s < TOTAL_STEPS && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 rounded transition-colors ${
                step > s ? 'bg-violet-400' : 'bg-gray-200'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── main ──────────────────────────────────────────────────── */

export default function ClientOnboarding({ org, isNew = false, plans = [], segments = [], onClose, onRefresh }) {
  const [sessionRestored] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
      if (!s) return null
      if (s.is_new !== isNew) return null
      if (!isNew && s.org_id !== org?.id) return null
      return s
    } catch { return null }
  })

  const [step, setStep] = useState(sessionRestored?.step || 1)
  const [createdOrg, setCreatedOrg] = useState(sessionRestored?.created_org || null)
  const orgId = createdOrg?.id || org?.id

  /* ── Step 1 & 2: store form ── */
  const [storeForm, setStoreForm] = useState(sessionRestored?.store_form || {
    name:             org?.name             || '',
    responsible_name: org?.responsible_name || '',
    cnpj:             org?.cnpj             || '',
    whatsapp:         org?.whatsapp         || org?.phone || '',
    phone:            org?.phone            || '',
    address:          org?.address          || '',
    login_email:      org?.contact_email    || '',
    contact_email:    '',
    initial_password: genPassword(),
    vertical:         org?.product_id       || 'loja',
    plan_id:          org?.plan_id          || plans[0]?.id || '',
    segments:         [],
    theme_color:      org?.theme_color      || '#3b82f6',
  })
  const [savingStore, setSavingStore] = useState(false)
  const [storeError, setStoreError]   = useState('')
  const [showPhoneField, setShowPhoneField]     = useState(
    sessionRestored?.show_phone         ?? Boolean(org?.phone)
  )
  const [showContactEmail, setShowContactEmail] = useState(
    sessionRestored?.show_contact_email ?? false
  )
  const [editingPassword, setEditingPassword]   = useState(false)
  const [ownerCreated, setOwnerCreated]         = useState(false)

  /* ── Step 3: Caixas & Categorias ── */
  const [registers, setRegisters]   = useState([])
  const [regLoading, setRegLoading] = useState(false)
  const [newRegName, setNewRegName] = useState('')
  const [addingReg, setAddingReg]   = useState(false)
  const [regCatMap, setRegCatMap]   = useState({})

  const [categories, setCategories]       = useState([])
  const [catInput, setCatInput]           = useState('')
  const [catAdding, setCatAdding]         = useState(false)
  const [catDeletingId, setCatDeletingId] = useState(null)

  /* ── Step 4: Equipe ── */
  const [existingMembers, setExistingMembers] = useState([])
  const [newEmployees, setNewEmployees]       = useState([])
  const [creatingTeam, setCreatingTeam]       = useState(false)
  const [teamResults, setTeamResults]         = useState([])

  /* ── Step 5: Produtos ── */
  const [newProducts, setNewProducts]         = useState([])
  const [savingProducts, setSavingProducts]   = useState(false)
  const [savedProductCount, setSavedProductCount] = useState(0)

  /* ── Conclusão ── */
  const [loginForMsg, setLoginForMsg]       = useState('')
  const [passwordForMsg, setPasswordForMsg] = useState('')
  const [copySuccess, setCopySuccess]       = useState(false)

  /* ── Correção 1: reset de senha (edição) ── */
  const [resetPwdGenerated, setResetPwdGenerated] = useState(null)
  const [resetPwdLoading, setResetPwdLoading]     = useState(false)
  const [resetPwdError, setResetPwdError]         = useState('')

  /* ── Correção 2: guard de race condition em organization_segments ── */
  /* isNew: não há segmentos a carregar do DB, já começa pronto.
     sessionRestored: segmentos vêm do sessionStorage, também prontos. */
  const [orgSegmentsLoaded, setOrgSegmentsLoaded] = useState(isNew || Boolean(sessionRestored))

  /* ── Correção 4: contagem de produtos existentes (edição) ── */
  const [existingProductCount, setExistingProductCount] = useState(null)

  const activeRegisters  = registers.filter(r => r.is_active)
  const hasMultiplePDV   = activeRegisters.length >= 2
  const filteredSegments = segments.filter(s => s.product_id === storeForm.vertical)

  /* ── Load functions ── */
  async function loadRegisters(overrideId) {
    const oid = overrideId || orgId
    if (!oid) return
    setRegLoading(true)
    const { data } = await supabase
      .from('cash_registers').select('*').eq('org_id', oid).order('name')
    setRegisters(data || [])
    const map = {}
    ;(data || []).forEach(r => {
      if (r.product_filter?.category_id) map[r.id] = r.product_filter.category_id
    })
    setRegCatMap(map)
    setRegLoading(false)
  }

  async function loadCategories(overrideId) {
    const oid = overrideId || orgId
    if (!oid) return
    const { data } = await supabase
      .from('categories').select('id, name').eq('org_id', oid).order('name')
    setCategories(data || [])
  }

  async function loadTeamMembers(overrideId) {
    const oid = overrideId || orgId
    if (!oid) return
    console.log('[debug] loadTeamMembers oid:', oid)
    const { data, error } = await supabase
      .from('profiles').select('id, full_name, role').eq('org_id', oid).order('full_name')
    console.log('[debug] profiles data:', data)
    console.log('[debug] profiles error:', error)
    setExistingMembers(data || [])
  }

  async function loadOrgSegments(overrideId) {
    const oid = overrideId || orgId
    if (!oid) return
    const { data } = await supabase
      .from('organization_segments').select('segment_id').eq('org_id', oid)
    setStoreForm(f => ({ ...f, segments: (data || []).map(r => r.segment_id) }))
    setOrgSegmentsLoaded(true)
  }

  async function loadProductCount(overrideId) {
    const oid = overrideId || orgId
    if (!oid) return
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', oid)
    setExistingProductCount(count ?? 0)
  }

  useEffect(() => {
    const restoredStep = sessionRestored?.step ?? 0
    const oid = restoredStep >= 3
      ? (sessionRestored.created_org?.id || org?.id)
      : (!isNew ? orgId : null)
    if (oid) {
      loadRegisters(oid)
      loadCategories(oid)
      // Correção 3 — TODO (RLS): loadTeamMembers retorna vazio quando o superadmin
      // tenta ler profiles de outra org porque a policy atual restringe por org_id
      // do usuário autenticado. Para corrigir, rodar no Supabase:
      //   CREATE POLICY "superadmin lê todos os profiles"
      //   ON public.profiles FOR SELECT
      //   USING (EXISTS (
      //     SELECT 1 FROM saas_administrators sa WHERE sa.email = auth.email()
      //   ));
      loadTeamMembers(oid)
      if (!isNew && !sessionRestored) loadOrgSegments(oid)
      if (!isNew) loadProductCount(oid)
    }
  }, [])

  /* Pre-populate conclusion fields */
  useEffect(() => {
    if (step === CONCLUSION) {
      setLoginForMsg(storeForm.login_email || '')
      if (isNew) setPasswordForMsg(storeForm.initial_password || '')
    }
  }, [step])

  useEffect(() => {
    if (step === CONCLUSION) return
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      org_id:             createdOrg?.id || org?.id || null,
      is_new:             isNew,
      step,
      store_form:         storeForm,
      created_org:        createdOrg,
      show_phone:         showPhoneField,
      show_contact_email: showContactEmail,
    }))
  }, [step, storeForm, createdOrg, showPhoneField, showContactEmail])

  function handleClose(tabHint) {
    sessionStorage.removeItem(SESSION_KEY)
    onClose(tabHint)
  }

  /* ─────────────────────────────────────────────────
     STEP 1 — Empresa
  ───────────────────────────────────────────────── */
  async function handleStep1Next() {
    setStoreError('')
    if (!storeForm.name.trim())     { setStoreError('Nome da empresa obrigatório.'); return }
    if (!storeForm.whatsapp.trim()) { setStoreError('WhatsApp obrigatório.'); return }

    if (!isNew) {
      setSavingStore(true)
      try {
        const { error } = await supabase.from('organizations').update({
          name:             storeForm.name.trim(),
          responsible_name: storeForm.responsible_name.trim() || null,
          cnpj:             storeForm.cnpj.trim()     || null,
          whatsapp:         storeForm.whatsapp.trim() || null,
          phone:            showPhoneField ? (storeForm.phone.trim() || null) : null,
          address:          storeForm.address.trim()  || null,
        }).eq('id', orgId)
        if (error) throw new Error(error.message)
      } catch (err) {
        setStoreError(err.message)
        setSavingStore(false)
        return
      }
      setSavingStore(false)
    }
    setStep(2)
  }

  /* ─────────────────────────────────────────────────
     STEP 2 — Acesso & Plano
  ───────────────────────────────────────────────── */
  async function handleStep2Next() {
    setStoreError('')
    if (!storeForm.login_email.trim()) { setStoreError('E-mail de login obrigatório.'); return }
    setSavingStore(true)

    try {
      if (isNew && !createdOrg) {
        const slug = makeSlug(storeForm.name)
        const { data: newOrg, error: orgErr } = await supabase
          .from('organizations').insert({
            name:             storeForm.name.trim(),
            slug,
            responsible_name: storeForm.responsible_name.trim() || null,
            cnpj:             storeForm.cnpj.trim()     || null,
            whatsapp:         storeForm.whatsapp.trim() || null,
            phone:            showPhoneField ? (storeForm.phone.trim() || null) : null,
            address:          storeForm.address.trim()  || null,
            contact_email:    storeForm.login_email.trim().toLowerCase(),
            theme_color:      storeForm.theme_color,
            plan_id:          storeForm.plan_id || null,
            product_id:       storeForm.vertical,
            segment:          storeForm.segments[0] || 'geral',
            is_active:        true,
            customer_status:  'ativo',
          }).select().single()

        if (orgErr) throw new Error(orgErr.message)

        if (storeForm.segments.length > 0) {
          await supabase.from('organization_segments').insert(
            storeForm.segments.map(sid => ({ org_id: newOrg.id, segment_id: sid }))
          )
        }

        await supabase.from('cash_registers').insert({
          org_id: newOrg.id, name: 'Caixa Principal', is_active: true,
        })

        if (storeForm.plan_id) {
          const plan = plans.find(p => p.id === storeForm.plan_id)
          await supabase.from('saas_subscriptions').insert({
            organization_id: newOrg.id,
            plan_id:         storeForm.plan_id,
            billing_amount:  plan?.price || 0,
            status:          'ativa',
            payment_status:  'pendente',
          })
        }

        setCreatedOrg(newOrg)
        await Promise.all([
          loadRegisters(newOrg.id),
          loadCategories(newOrg.id),
          loadTeamMembers(newOrg.id),
        ])

        const { data: ownerResult, error: ownerInvokeErr } = await supabase.functions.invoke('create-owner', {
          body: {
            org_id:    newOrg.id,
            email:     storeForm.login_email.trim().toLowerCase(),
            full_name: storeForm.responsible_name.trim() || storeForm.name.trim(),
            password:  storeForm.initial_password,
          },
        })
        if (ownerInvokeErr || ownerResult?.error) {
          throw new Error(ownerResult?.error || ownerInvokeErr?.message || 'Erro ao criar o login do dono.')
        }
        setOwnerCreated(true)

      } else {
        const oid = createdOrg?.id || orgId
        const { error } = await supabase.from('organizations').update({
          contact_email: storeForm.login_email.trim().toLowerCase() || null,
          theme_color:   storeForm.theme_color,
          plan_id:       storeForm.plan_id || null,
          product_id:    storeForm.vertical,
          segment:       storeForm.segments[0] || 'geral',
        }).eq('id', oid)
        if (error) throw new Error(error.message)

        await supabase.from('organization_segments').delete().eq('org_id', oid)
        if (storeForm.segments.length > 0) {
          await supabase.from('organization_segments').insert(
            storeForm.segments.map(sid => ({ org_id: oid, segment_id: sid }))
          )
        }

        if (isNew && createdOrg) {
          await Promise.all([
            loadRegisters(oid),
            loadCategories(oid),
            loadTeamMembers(oid),
          ])
        }

        // Retry: criar login do dono se a tentativa anterior falhou (ex: email errado corrigido)
        if (isNew && !ownerCreated) {
          const { data: ownerResult, error: ownerInvokeErr } = await supabase.functions.invoke('create-owner', {
            body: {
              org_id:    oid,
              email:     storeForm.login_email.trim().toLowerCase(),
              full_name: storeForm.responsible_name.trim() || storeForm.name.trim(),
              password:  storeForm.initial_password,
            },
          })
          if (ownerInvokeErr || ownerResult?.error) {
            throw new Error(ownerResult?.error || ownerInvokeErr?.message || 'Erro ao criar o login do dono.')
          }
          setOwnerCreated(true)
        }
      }

      setStep(3)
    } catch (err) {
      setStoreError(err.message)
    } finally {
      setSavingStore(false)
    }
  }

  /* ─────────────────────────────────────────────────
     STEP 3 — Caixas & Categorias
  ───────────────────────────────────────────────── */
  async function addRegister() {
    if (!newRegName.trim() || !orgId) return
    setAddingReg(true)
    await supabase.from('cash_registers').insert({
      org_id: orgId, name: newRegName.trim(), is_active: true,
    })
    setNewRegName('')
    await loadRegisters()
    setAddingReg(false)
  }

  async function saveRegisterCategory(regId, categoryId) {
    const product_filter = categoryId ? { category_id: categoryId } : null
    await supabase.from('cash_registers').update({ product_filter }).eq('id', regId)
    setRegCatMap(prev => ({ ...prev, [regId]: categoryId || '' }))
  }

  async function addCategory() {
    if (!catInput.trim() || !orgId) return
    setCatAdding(true)
    const { data } = await supabase.from('categories')
      .insert({ org_id: orgId, name: catInput.trim() }).select().single()
    if (data) setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setCatInput('')
    setCatAdding(false)
  }

  async function deleteCategory(id) {
    setCatDeletingId(id)
    await supabase.from('categories').delete().eq('id', id).eq('org_id', orgId)
    setCategories(prev => prev.filter(c => c.id !== id))
    setRegCatMap(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(k => { if (updated[k] === id) updated[k] = '' })
      return updated
    })
    setCatDeletingId(null)
  }

  /* ─────────────────────────────────────────────────
     STEP 4 — Equipe
  ───────────────────────────────────────────────── */
  function addEmployeeRow() {
    setNewEmployees(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: '', email: '', role: 'operador', password: genPassword() },
    ])
  }
  const updateEmployee = (id, field, val) =>
    setNewEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e))
  const removeEmployee = id =>
    setNewEmployees(prev => prev.filter(e => e.id !== id))

  async function createAllEmployees() {
    const valid = newEmployees.filter(e => e.name.trim() && e.email.trim())
    if (!valid.length || !orgId) return
    setCreatingTeam(true)
    const results = []
    for (const emp of valid) {
      try {
        const payload = {
          org_id:    orgId,
          email:     emp.email.trim().toLowerCase(),
          full_name: emp.name.trim(),
          role:      emp.role,
          password:  emp.password,
        }
        console.log('[debug] criando funcionário:', payload)
        const { data, error } = await supabase.functions.invoke('create-employee', {
          body: payload,
        })
        console.log('[debug] resultado create-employee:', { data, error })
        if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro')
        results.push({ ...emp, success: true })
      } catch (err) {
        results.push({ ...emp, success: false, errorMsg: err.message })
      }
    }
    setTeamResults(results)
    setCreatingTeam(false)
    await loadTeamMembers()
  }

  /* ─────────────────────────────────────────────────
     STEP 5 — Produtos
  ───────────────────────────────────────────────── */
  function addProductRow() {
    setNewProducts(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: '', price: '', stock_quantity: '0', category_id: '' },
    ])
  }
  const updateProduct = (id, field, val) =>
    setNewProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
  const removeProduct = id =>
    setNewProducts(prev => prev.filter(p => p.id !== id))

  async function saveProducts() {
    const valid = newProducts.filter(p => p.name.trim() && p.price)
    if (!valid.length || !orgId) return
    setSavingProducts(true)
    const { data } = await supabase.from('products').insert(
      valid.map(p => ({
        org_id:         orgId,
        name:           p.name.trim(),
        price:          parseFloat(p.price) || 0,
        stock_quantity: parseInt(p.stock_quantity || '0'),
        category_id:    p.category_id || null,
      }))
    ).select()
    setSavingProducts(false)
    if (data) { setSavedProductCount(prev => prev + data.length); setNewProducts([]) }
  }

  /* ─────────────────────────────────────────────────
     Conclusão
  ───────────────────────────────────────────────── */
  const displayName = storeForm.name || org?.name || 'Cliente'

  const successfulTeam = teamResults.filter(r => r.success)
  const hasUncreatedEmployees = newEmployees.length > 0 &&
    successfulTeam.length < newEmployees.length

  const whatsappMsg =
`Olá ${displayName}! 🎉
Seu negócio acaba de dar um grande passo!
A partir de hoje fica muito mais fácil acompanhar suas vendas, estoque e fechamento do dia — tudo na palma da mão.

🔗 Acesso: ${window.location.origin}
👤 Login: ${loginForMsg || '______'}
${isNew || passwordForMsg ? `🔑 Senha: ${passwordForMsg || '______'}` : '🔑 Use a senha já cadastrada anteriormente.'}${successfulTeam.length > 0 ? `

👥 Acesso da Equipe:

${successfulTeam.map(e => `▪️ ${e.name} (${e.role.charAt(0).toUpperCase() + e.role.slice(1)})\n👤 Login: ${e.email}\n🔑 Senha: ${e.password}`).join('\n\n')}` : ''}

Qualquer dúvida estou aqui! 😊`

  async function handleResetPassword() {
    setResetPwdLoading(true)
    setResetPwdError('')
    const newPwd = genPassword()
    try {
      const oid = createdOrg?.id || orgId
      const { data: result, error: fnErr } = await supabase.functions.invoke('update-owner-password', {
        body: { org_id: oid, new_password: newPwd },
      })
      if (fnErr || result?.error) throw new Error(result?.error || fnErr?.message || 'Erro ao redefinir a senha.')
      setResetPwdGenerated(newPwd)
      setPasswordForMsg(newPwd)
    } catch (err) {
      setResetPwdError(err.message || 'Não foi possível redefinir a senha. Tente novamente.')
    } finally {
      setResetPwdLoading(false)
    }
  }

  async function copyTeamMember(emp) {
    const text = `Login: ${emp.email}\nSenha: ${emp.password}`
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const ta = document.createElement('textarea')
        ta.value = text; ta.setAttribute('readonly', '')
        ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch {}
  }

  async function copyMsg() {
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(whatsappMsg)
      else {
        const ta = document.createElement('textarea')
        ta.value = whatsappMsg; ta.setAttribute('readonly', '')
        ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch {}
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2500)
  }

  function openWhatsApp() {
    const phone = (storeForm.whatsapp || org?.whatsapp || org?.phone || '').replace(/\D/g, '')
    if (!phone) { alert('WhatsApp não informado. Preencha na Etapa 1.'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`, '_blank')
  }

  /* ── render ────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: '#f8f7ff' }}>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={() => handleClose()}
          className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">
            {isNew ? 'Novo Cliente · Onboarding' : 'Onboarding'}
          </p>
          <h1 className="text-base font-black text-gray-900 truncate">
            {displayName || (isNew ? 'Novo Cliente' : '—')}
          </h1>
        </div>
        {step < CONCLUSION && (
          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-xl shrink-0">
            Etapa {step} / {TOTAL_STEPS}
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {step < CONCLUSION && <Stepper step={step} />}

          {/* ═══════════════════════════════════════
              STEP 1 — Empresa
          ═══════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">
                  {isNew && !createdOrg ? 'Dados da Empresa' : 'Empresa'}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {isNew && !createdOrg ? 'Informações básicas do novo cliente' : 'Dados cadastrais do cliente'}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Nome da Empresa *</label>
                    <input
                      value={storeForm.name}
                      onChange={e => setStoreForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Nome da empresa"
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Responsável</label>
                    <input
                      value={storeForm.responsible_name}
                      onChange={e => setStoreForm(f => ({ ...f, responsible_name: e.target.value }))}
                      placeholder="Nome do responsável"
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">CPF / CNPJ</label>
                    <input
                      value={storeForm.cnpj}
                      onChange={e => setStoreForm(f => ({ ...f, cnpj: e.target.value }))}
                      placeholder="000.000.000-00 ou 00.000.000/0001-00"
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">WhatsApp *</label>
                    <input
                      value={formatPhone(storeForm.whatsapp)}
                      onChange={e => setStoreForm(f => ({ ...f, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                      placeholder="(00) 00000-0000"
                      className={inp}
                    />
                  </div>
                  <div className="flex items-end">
                    {!showPhoneField ? (
                      <button
                        type="button"
                        onClick={() => setShowPhoneField(true)}
                        className="text-sm font-bold text-violet-600 hover:text-violet-800 hover:underline transition-colors pb-3"
                      >
                        + Adicionar telefone fixo (opcional)
                      </button>
                    ) : (
                      <div className="w-full">
                        <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Telefone fixo</label>
                        <input
                          value={formatPhone(storeForm.phone)}
                          onChange={e => setStoreForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                          placeholder="(00) 0000-0000"
                          className={inp}
                        />
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Endereço</label>
                    <input
                      value={storeForm.address}
                      onChange={e => setStoreForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="Rua, número, bairro, cidade"
                      className={inp}
                    />
                  </div>
                </div>

                {storeError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-medium">{storeError}</p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleStep1Next}
                    disabled={savingStore || !storeForm.name.trim() || !storeForm.whatsapp.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md disabled:opacity-60 transition-colors"
                  >
                    {savingStore ? 'Salvando...' : (<>Próximo <ChevronRight size={16} /></>)}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              STEP 2 — Acesso & Plano
          ═══════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">Acesso & Plano</h2>
                <p className="text-sm text-gray-400 mt-0.5">Configure o acesso e o plano do cliente</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">

                  {/* Login email */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">E-mail de login *</label>
                    <input
                      type="email"
                      value={storeForm.login_email}
                      onChange={e => setStoreForm(f => ({ ...f, login_email: e.target.value }))}
                      placeholder="email@cliente.com"
                      className={inp}
                    />
                    {!showContactEmail && (
                      <button
                        type="button"
                        onClick={() => setShowContactEmail(true)}
                        className="mt-1.5 text-sm font-bold text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                      >
                        + E-mail de contato diferente (opcional)
                      </button>
                    )}
                  </div>

                  {/* Contact email — expandível */}
                  {showContactEmail && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">E-mail de contato</label>
                      <input
                        type="email"
                        value={storeForm.contact_email}
                        onChange={e => setStoreForm(f => ({ ...f, contact_email: e.target.value }))}
                        placeholder="contato@empresa.com"
                        className={inp}
                      />
                    </div>
                  )}

                  {/* Senha inicial */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Senha Inicial</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={storeForm.initial_password}
                        readOnly={!editingPassword}
                        onChange={e => setStoreForm(f => ({ ...f, initial_password: e.target.value }))}
                        className={inp + (editingPassword ? '' : ' cursor-default bg-gray-100 text-gray-500 font-mono')}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingPassword(p => !p)}
                        className="shrink-0 text-xs font-bold text-violet-600 hover:text-violet-800 hover:underline whitespace-nowrap transition-colors"
                      >
                        {editingPassword ? 'Bloquear' : 'Editar senha'}
                      </button>
                    </div>
                    {!editingPassword && (
                      <button
                        type="button"
                        onClick={() => setStoreForm(f => ({ ...f, initial_password: genPassword() }))}
                        className="mt-1 text-[11px] text-gray-400 hover:text-violet-600 transition-colors"
                      >
                        Gerar nova senha
                      </button>
                    )}
                  </div>

                  {/* Vertical */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Vertical (produto)</label>
                    <select
                      value={storeForm.vertical}
                      onChange={e => setStoreForm(f => ({ ...f, vertical: e.target.value, segments: [] }))}
                      className={inp}
                    >
                      {VERTICAL_OPTIONS.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Plano */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Plano</label>
                    <select
                      value={storeForm.plan_id}
                      onChange={e => setStoreForm(f => ({ ...f, plan_id: e.target.value }))}
                      className={inp}
                    >
                      <option value="">Sem plano</option>
                      {plans.filter(p => p.status === 'ativo').map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} — R$ {Number(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Segmentos (apenas se vertical tem segmentos) */}
                  {filteredSegments.length > 0 && (
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                        Segmentos <span className="normal-case font-normal text-gray-400">(selecione ao menos 1)</span>
                      </label>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {filteredSegments.map(s => {
                          const checked = (storeForm.segments || []).includes(s.id)
                          return (
                            <label key={s.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer border transition-colors ${
                              checked ? 'bg-violet-50 border-violet-300' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setStoreForm(f => ({
                                  ...f,
                                  segments: checked
                                    ? (f.segments || []).filter(id => id !== s.id)
                                    : [...(f.segments || []), s.id],
                                }))}
                                className="w-3.5 h-3.5 accent-violet-600 shrink-0"
                              />
                              <span className={`text-sm font-bold ${checked ? 'text-violet-700' : 'text-gray-600'}`}>{s.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cor do tema */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">Cor do tema</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={storeForm.theme_color}
                        onChange={e => setStoreForm(f => ({ ...f, theme_color: e.target.value }))}
                        className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer p-1 bg-white"
                      />
                      <div>
                        <p className="text-sm font-black text-gray-800 uppercase">{storeForm.theme_color}</p>
                        <p className="text-[10px] text-gray-400">Cor do app do cliente</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: storeForm.theme_color }} />
                    </div>
                  </div>
                </div>

                {storeError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-medium">{storeError}</p>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={15} />Voltar
                  </button>
                  <button
                    onClick={handleStep2Next}
                    disabled={savingStore || !storeForm.login_email.trim() || (!isNew && !orgSegmentsLoaded)}
                    className="flex items-center gap-2 px-6 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md disabled:opacity-60 transition-colors"
                  >
                    {savingStore
                      ? (isNew && !createdOrg ? 'Criando...' : 'Salvando...')
                      : (<>{isNew && !createdOrg ? 'Criar e Próximo' : 'Salvar e Próximo'} <ChevronRight size={16} /></>)
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              STEP 3 — Caixas & Categorias
          ═══════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">Caixas & Categorias</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Configure os pontos de venda
                  {hasMultiplePDV ? ' e as categorias de produtos' : ' — adicione um 2º caixa para habilitar categorias'}
                </p>
              </div>

              {/* Caixas */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Caixas / PDVs</p>

                {regLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {registers.map(reg => (
                      <div key={reg.id} className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                            <Monitor size={14} className="text-violet-600" />
                          </div>
                          <p className="flex-1 text-sm font-bold text-gray-800 truncate">{reg.name}</p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${reg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                            {reg.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        {hasMultiplePDV && categories.length > 0 && (
                          <div className="flex items-center gap-2 pl-11">
                            <Tag size={11} className="text-gray-400 shrink-0" />
                            <select
                              value={regCatMap[reg.id] || ''}
                              onChange={e => saveRegisterCategory(reg.id, e.target.value)}
                              className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-300"
                            >
                              <option value="">Todos os produtos</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        )}
                        {hasMultiplePDV && categories.length === 0 && (
                          <p className="pl-11 text-[10px] text-gray-400 italic">Crie categorias abaixo para vincular</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <input
                    value={newRegName}
                    onChange={e => setNewRegName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRegister()}
                    placeholder="Nome do novo caixa (Enter para adicionar)"
                    className={inp + ' flex-1'}
                  />
                  <button
                    onClick={addRegister}
                    disabled={addingReg || !newRegName.trim()}
                    className="px-4 py-3 bg-[#7c3aed] text-white font-bold rounded-xl disabled:opacity-60 hover:bg-[#6d28d9] transition-colors shrink-0"
                  >
                    {addingReg ? '...' : <Plus size={16} />}
                  </button>
                </div>
              </div>

              {/* Categorias */}
              <div className={`overflow-hidden transition-all duration-300 ease-out ${
                hasMultiplePDV ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
              }`}>
                <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-violet-500" />
                    <p className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Categorias de Produtos</p>
                  </div>
                  <p className="text-xs text-gray-400 -mt-2">
                    Crie categorias para filtrar quais produtos aparecem em cada caixa.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={catInput}
                      onChange={e => setCatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCategory()}
                      placeholder="Nome da categoria (Enter para adicionar)"
                      className={inp + ' flex-1'}
                    />
                    <button
                      onClick={addCategory}
                      disabled={catAdding || !catInput.trim()}
                      className="px-4 py-3 bg-[#7c3aed] text-white font-bold rounded-xl disabled:opacity-60 hover:bg-[#6d28d9] transition-colors shrink-0"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {categories.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhuma categoria ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="flex items-center justify-between bg-violet-50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Tag size={12} className="text-violet-400" />
                            <span className="text-sm font-bold text-gray-800">{cat.name}</span>
                          </div>
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            disabled={catDeletingId === cat.id}
                            className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center transition-colors disabled:opacity-40"
                          >
                            <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                  <ArrowLeft size={15} />Voltar
                </button>
                <button onClick={() => setStep(4)} className="flex items-center gap-2 px-6 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md transition-colors">
                  Próximo <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              STEP 4 — Equipe
          ═══════════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">Equipe</h2>
                <p className="text-sm text-gray-400 mt-0.5">Adicione funcionários para este cliente</p>
              </div>

              {newEmployees.length === 0 && teamResults.length === 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-xs font-medium text-amber-700">
                    Esta etapa é opcional. O cliente pode adicionar funcionários diretamente no app.
                  </p>
                </div>
              )}

              {existingMembers.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-3">Membros Existentes</p>
                  <div className="space-y-2">
                    {existingMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-violet-700 font-black text-xs shrink-0">
                          {(m.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <p className="flex-1 text-sm font-bold text-gray-700 truncate">{m.full_name || 'Sem nome'}</p>
                        <span className="text-[10px] font-bold text-gray-500 capitalize bg-gray-200 px-2 py-0.5 rounded-full">{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Adicionar Funcionários</p>
                  <button onClick={addEmployeeRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7c3aed] text-white text-xs font-bold rounded-xl hover:bg-[#6d28d9] transition-colors">
                    <Plus size={12} />Adicionar
                  </button>
                </div>

                {newEmployees.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Clique em "Adicionar" para cadastrar funcionários.</p>
                ) : (
                  <div className="space-y-2 overflow-x-auto">
                    <div className="grid grid-cols-[1fr_1fr_100px_100px_28px] gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1 min-w-[560px]">
                      <span>Nome</span><span>Login (email)</span><span>Função</span><span>Senha</span><span />
                    </div>
                    {newEmployees.map(emp => (
                      <div key={emp.id} className="grid grid-cols-[1fr_1fr_100px_100px_28px] gap-2 items-center min-w-[560px]">
                        <input value={emp.name} onChange={e => updateEmployee(emp.id, 'name', e.target.value)} placeholder="Nome completo" className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
                        <input value={emp.email} onChange={e => updateEmployee(emp.id, 'email', e.target.value)} placeholder="email@exemplo.com" type="email" className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
                        <select value={emp.role} onChange={e => updateEmployee(emp.id, 'role', e.target.value)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-violet-300">
                          <option value="operador">Operador</option>
                          <option value="gerente">Gerente</option>
                          <option value="admin">Admin</option>
                        </select>
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 truncate">{emp.password}</span>
                        <button onClick={() => removeEmployee(emp.id)} className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center transition-colors shrink-0">
                          <X size={12} className="text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={createAllEmployees}
                      disabled={creatingTeam || newEmployees.filter(e => e.name && e.email).length === 0}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl disabled:opacity-60 transition-colors mt-2"
                    >
                      {creatingTeam ? 'Criando contas...' : `Criar ${newEmployees.filter(e => e.name && e.email).length} conta(s)`}
                    </button>
                  </div>
                )}

                {teamResults.length > 0 && (
                  <div className="pt-4 border-t border-gray-100 space-y-2">
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-2">Credenciais Geradas</p>
                    {teamResults.map((r, i) => (
                      <div key={i} className={`rounded-xl px-3 py-2.5 flex items-start gap-2 ${r.success ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                        {r.success ? <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" /> : <X size={14} className="text-red-500 mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{r.name} · {r.email}</p>
                          {r.success
                            ? <p className="text-[10px] font-mono text-emerald-700 mt-0.5">Senha: {r.password}</p>
                            : <p className="text-[10px] text-red-600 mt-0.5">{r.errorMsg}</p>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hasUncreatedEmployees && (
                <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  Clique em "Criar conta(s)" antes de avançar para confirmar o acesso da equipe.
                </p>
              )}
              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                  <ArrowLeft size={15} />Voltar
                </button>
                <button
                  onClick={() => setStep(5)}
                  disabled={hasUncreatedEmployees}
                  className="flex items-center gap-2 px-6 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md disabled:opacity-60 transition-colors"
                >
                  {newEmployees.length === 0 && teamResults.length === 0 && existingMembers.length === 0
                    ? 'Pular e Continuar'
                    : 'Próximo'
                  } <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              STEP 5 — Produtos
          ═══════════════════════════════════════ */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">Produtos</h2>
                <p className="text-sm text-gray-400 mt-0.5">Etapa opcional — pode ser feita depois no módulo de Produtos</p>
              </div>

              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <Clock size={16} className="text-amber-500 shrink-0" />
                <p className="text-xs font-medium text-amber-700">Esta etapa pode ser feita agora ou posteriormente. O cliente também pode cadastrar produtos diretamente no app.</p>
              </div>

              {!isNew && existingProductCount !== null && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                  <Package size={15} className="text-blue-500 shrink-0" />
                  <p className="text-xs font-medium text-blue-700">
                    {existingProductCount === 0
                      ? 'Nenhum produto cadastrado ainda nesta loja.'
                      : `${existingProductCount} produto${existingProductCount !== 1 ? 's' : ''} já cadastrado${existingProductCount !== 1 ? 's' : ''} — use o módulo de Produtos para editar existentes.`}
                  </p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Cadastrar Produtos</p>
                  <button onClick={addProductRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7c3aed] text-white text-xs font-bold rounded-xl hover:bg-[#6d28d9] transition-colors">
                    <Plus size={12} />Linha
                  </button>
                </div>

                {newProducts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Clique em "+ Linha" para adicionar produtos.</p>
                ) : (
                  <div className="space-y-2 overflow-x-auto">
                    <div className={`grid gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1 min-w-[480px] ${hasMultiplePDV ? 'grid-cols-[1.2fr_1.5fr_80px_70px_28px]' : 'grid-cols-[2fr_90px_70px_28px]'}`}>
                      {hasMultiplePDV && <span>Categoria</span>}
                      <span>Nome</span><span>Preço</span><span>Estoque</span><span />
                    </div>
                    {newProducts.map(p => (
                      <div key={p.id} className={`grid gap-2 items-center min-w-[480px] ${hasMultiplePDV ? 'grid-cols-[1.2fr_1.5fr_80px_70px_28px]' : 'grid-cols-[2fr_90px_70px_28px]'}`}>
                        {hasMultiplePDV && (
                          <select value={p.category_id} onChange={e => updateProduct(p.id, 'category_id', e.target.value)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-violet-300">
                            <option value="">Sem cat.</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <input value={p.name} onChange={e => updateProduct(p.id, 'name', e.target.value)} placeholder="Nome do produto" className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
                        <input type="number" min="0" step="0.01" value={p.price} onChange={e => updateProduct(p.id, 'price', e.target.value)} placeholder="0,00" className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
                        <input type="number" min="0" value={p.stock_quantity} onChange={e => updateProduct(p.id, 'stock_quantity', e.target.value)} placeholder="0" className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
                        <button onClick={() => removeProduct(p.id)} className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center transition-colors shrink-0">
                          <X size={12} className="text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={saveProducts}
                      disabled={savingProducts || newProducts.filter(p => p.name && p.price).length === 0}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl disabled:opacity-60 transition-colors mt-2"
                    >
                      {savingProducts ? 'Salvando...' : `Salvar ${newProducts.filter(p => p.name && p.price).length} produto(s)`}
                    </button>
                  </div>
                )}

                {savedProductCount > 0 && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <Check size={14} className="text-emerald-600 shrink-0" />
                    <p className="text-xs font-bold text-emerald-700">{savedProductCount} produto(s) salvos!</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(4)} className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                  <ArrowLeft size={15} />Voltar
                </button>
                <button onClick={() => setStep(CONCLUSION)} className="flex items-center gap-2 px-6 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md transition-colors">
                  {savedProductCount > 0 ? 'Finalizar' : 'Pular e Finalizar'}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              CONCLUSÃO (step 6)
          ═══════════════════════════════════════ */}
          {step === CONCLUSION && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black text-gray-900">Configuração Concluída!</h2>
                <p className="text-sm text-gray-400 mt-0.5">Resumo do que foi configurado para {displayName}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: Building2, label: 'Empresa',    detail: storeForm.name,                                               done: true },
                  { icon: Monitor,   label: 'Caixas',     detail: `${activeRegisters.length} ativo(s)`,                        done: true },
                  { icon: Tag,       label: 'Categorias', detail: `${categories.length} criada(s)`,                            done: true },
                  { icon: Users,     label: 'Equipe',     detail: `${existingMembers.length} membro(s)`,                       done: true },
                  { icon: Package,   label: 'Produtos',   detail: savedProductCount > 0 ? `${savedProductCount} cadastrado(s)` : 'Pendente', done: savedProductCount > 0 },
                ].map(({ icon: Icon, label, detail, done }) => (
                  <div key={label} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${done ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                    <Icon size={16} className={`${done ? 'text-emerald-600' : 'text-amber-500'} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-700">{label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{detail}</p>
                    </div>
                    {done
                      ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      : <Clock size={16} className="text-amber-400 shrink-0" />
                    }
                  </div>
                ))}
              </div>

              {/* WhatsApp card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-[#25D366]" />
                  <h3 className="text-sm font-black text-gray-900">Enviar acesso ao cliente</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Login</label>
                    <input value={loginForMsg} onChange={e => setLoginForMsg(e.target.value)} placeholder="email@cliente.com" className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-300" />
                  </div>
                  {isNew ? (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Senha</label>
                      <input value={passwordForMsg} onChange={e => setPasswordForMsg(e.target.value)} placeholder="Senha" className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-300" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Senha</label>
                      {resetPwdGenerated ? (
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-emerald-600">Senha redefinida com sucesso!</p>
                          <div className="w-full text-xs font-mono bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-emerald-800 select-all">
                            {resetPwdGenerated}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-amber-600 font-medium">O cliente poderá continuar usando a senha antiga até que você gere e envie a nova. Sessões ativas não serão encerradas.</p>
                          <button
                            type="button"
                            onClick={handleResetPassword}
                            disabled={resetPwdLoading}
                            className="w-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-60 text-left"
                          >
                            {resetPwdLoading ? 'Redefinindo...' : 'Gerar nova senha e atualizar →'}
                          </button>
                          {resetPwdError && (
                            <p className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{resetPwdError}</p>
                          )}
                          <p className="text-[10px] text-gray-400">A senha atual do cliente permanece inalterada até uma nova ser gerada.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {successfulTeam.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-violet-500" />
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-wide">Acesso da Equipe</h4>
                    </div>
                    <div className="space-y-2">
                      {successfulTeam.map(emp => (
                        <div key={emp.id || emp.email} className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{emp.name}</p>
                            <p className="text-[10px] text-violet-600 font-semibold capitalize">{emp.role}</p>
                            <p className="text-[10px] text-gray-500 font-mono truncate">{emp.email}</p>
                            <p className="text-[10px] text-gray-500 font-mono">{emp.password}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyTeamMember(emp)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-violet-700 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
                          >
                            <Copy size={11} />Copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {successfulTeam.length === 0 && !isNew && existingMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-violet-500" />
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-wide">Equipe desta empresa</h4>
                    </div>
                    <div className="space-y-2">
                      {existingMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{m.full_name || 'Sem nome'}</p>
                            <p className="text-[10px] text-violet-600 font-semibold capitalize">{m.role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400">Para redefinir o acesso de um membro da equipe, use a opção de reset de senha na tela de Equipe do módulo.</p>
                  </div>
                )}
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 font-mono text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {whatsappMsg}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyMsg} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-xl transition-colors">
                    <Copy size={14} />
                    {copySuccess ? 'Copiado!' : 'Copiar mensagem'}
                  </button>
                  <button onClick={openWhatsApp} className="flex items-center gap-2 px-4 py-2.5 text-white font-bold text-sm rounded-xl hover:opacity-90 transition-opacity" style={{ backgroundColor: '#25D366' }}>
                    <MessageCircle size={14} />
                    Enviar via WhatsApp
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { onRefresh?.(); handleClose() }}
                  className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  Voltar ao SuperAdmin
                </button>
                <button
                  onClick={() => { onRefresh?.(); handleClose('clientes') }}
                  className="flex-1 py-3.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl shadow-md transition-colors text-sm"
                >
                  Configurar outro cliente
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
