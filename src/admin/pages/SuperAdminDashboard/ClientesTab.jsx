import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import {
  CheckCircle2, Clock, Copy, ExternalLink, LogIn, Monitor,
  PauseCircle, Pencil, PlayCircle, Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { friendlyError } from '../../../shared/lib/planLimitError'
import { billingStatusMeta } from '../../../shared/lib/billingStatus'
import { getVerticalBrand } from '../../../shared/lib/verticalBrand'
import { suggestNextDueDate, suggestCycleAmount } from '../../../shared/lib/billingCycle'

/* ── constants ─────────────────────────────────────────────── */

const PRODUCT_OPTIONS = [
  { value: 'loja', label: 'Meu Caixa' },
  { value: 'servico', label: 'Meu Servico' },
  { value: 'beleza', label: 'Meu Studio' },
]

const PRESET_CATEGORIES = {
  geral:       ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'],
  moda:        ['Feminino', 'Masculino', 'Infantil', 'Calçados', 'Acessórios'],
  eletronicos: ['Celulares', 'Informática', 'TV e Áudio', 'Acessórios', 'Peças'],
  fallback:    ['Produtos', 'Serviços', 'Promoções', 'Importados', 'Outros'],
}

const initialClientForm = {
  store_name: '', responsible_name: '', company_document: '',
  contact_email: '', whatsapp: '', address: '', notes: '',
  login_email: '', initial_password: '', product_id: 'loja', plan_id: '',
  segments: [], categories: [], trial_ends_at: '', due_date: '',
  billing_cycle: 'mensal', billing_amount: '', billing_day: '',
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
  expirado:  'bg-amber-100 text-amber-700',
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-rose-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
]

const SEGMENT_BADGES = {
  geral:       { label: 'Varejo',      cls: 'bg-gray-100 text-gray-600'     },
  moda:        { label: 'Moda',        cls: 'bg-purple-100 text-purple-700' },
  eletronicos: { label: 'Eletrônicos', cls: 'bg-blue-100 text-blue-700'     },
}

// Cor e so pra badge do admin; o nome exibido vem sempre do mapa
// central de marca (getVerticalBrand), nunca redigitado aqui.
const VERTICAL_BADGE_COLORS = {
  loja:    'bg-violet-100 text-violet-700',
  servico: 'bg-amber-100  text-amber-700',
  beleza:  'bg-pink-100   text-pink-700',
}

const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm'

function formatPhone(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const getErrorMessage = (err, fb) => err?.message || fb

/* ── sub-components ─────────────────────────────────────────── */

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_CLASSES[value] || 'bg-slate-100 text-slate-500'}`}>
      {String(value || 'n/a').replace(/_/g, ' ')}
    </span>
  )
}

function SegmentBadge({ value, label, colorIdx }) {
  if (label !== undefined) {
    const PALETTE = [
      'bg-gray-100 text-gray-700', 'bg-purple-100 text-purple-700',
      'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
      'bg-amber-100 text-amber-700',
    ]
    const cls = PALETTE[(colorIdx || 0) % PALETTE.length]
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
  }
  const s = SEGMENT_BADGES[value] || SEGMENT_BADGES.geral
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  )
}

function VerticalBadge({ value }) {
  const cls = VERTICAL_BADGE_COLORS[value] || 'bg-gray-100 text-gray-600'
  const label = value ? getVerticalBrand(value).name : '—'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

function Avatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase()
  const cls = AVATAR_COLORS[name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0]
  return (
    <div className={`w-9 h-9 rounded-xl ${cls} flex items-center justify-center text-white font-black text-sm shrink-0`}>
      {letter}
    </div>
  )
}

/* ── component ─────────────────────────────────────────────── */

const ClientesTab = forwardRef(function ClientesTab(
  {
    organizationRows, subscriptions, invites, plans, limitsByPlan, segments, products,
    orgSegmentsMap, orgsWithRegisters, loading, loadAdminData, showSuccess, showWarning, showError,
    startAction, finishAction, isActionRunning, isActive, onContinueOnboarding,
  },
  ref
) {
  const [clientModalMode, setClientModalMode] = useState('create')
  const [editingOrganizationId, setEditingOrganizationId] = useState(null)
  const [editingInviteId, setEditingInviteId] = useState(null)
  const [showClientModal, setShowClientModal] = useState(false)
  const [clientForm, setClientForm] = useState(initialClientForm)
  const [generatedLink, setGeneratedLink] = useState('')
  const [clientFilter, setClientFilter] = useState('todos')
  const [storeSearch, setStoreSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  /* category input for quick create form */
  const [catInput, setCatInput] = useState('')

  /* org registers state (used inside client edit modal) */
  const [orgRegisters, setOrgRegisters]         = useState([])
  const [orgRegistersLoading, setOrgRegistersLoading] = useState(false)
  const [newRegName, setNewRegName]             = useState('')
  const [newRegDesc, setNewRegDesc]             = useState('')
  const [savingReg, setSavingReg]               = useState(false)

  /* ── computed ────────────────────────────────────────────── */

  const subscriptionMap = useMemo(() =>
    subscriptions.reduce((a, s) => ({ ...a, [s.organization_id]: s }), {}),
  [subscriptions])

  /* config global de cobranca (so pra sugerir valor do ciclo anual
     no formulario -- a regra de calculo em si vive no banco) */
  const [billingSettings, setBillingSettings] = useState({ trial_days: 15, annual_months_charged: 10 })
  useEffect(() => {
    supabase.from('saas_billing_settings').select('trial_days, annual_months_charged')
      .eq('id', '00000000-0000-0000-0000-000000000001').single()
      .then(({ data }) => { if (data) setBillingSettings(data) })
  }, [])

  /* aceite dos Termos por cliente (versao + data), exibido na tabela */
  const [termsAcceptanceMap, setTermsAcceptanceMap] = useState({})
  useEffect(() => {
    const orgIds = organizationRows.map(o => o.id)
    if (orgIds.length === 0) { setTermsAcceptanceMap({}); return }
    supabase
      .from('terms_acceptances')
      .select('org_id, terms_version, privacy_version, accepted_at')
      .in('org_id', orgIds)
      .order('accepted_at', { ascending: false })
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(row => { if (!map[row.org_id]) map[row.org_id] = row })
        setTermsAcceptanceMap(map)
      })
  }, [organizationRows])

  /* situacao de cobranca por cliente (teste/em_dia/vence_em_breve/
     atrasado/suspenso/cancelado) -- SEMPRE via get_all_billing_status,
     nunca recalculada aqui (mesma funcao usada pelo App.jsx e Meu Plano) */
  const [billingStatusMap, setBillingStatusMap] = useState({})
  const [billingStatusLoaded, setBillingStatusLoaded] = useState(false)
  async function loadBillingStatus() {
    const { data } = await supabase.rpc('get_all_billing_status')
    const map = {}
    ;(data || []).forEach(row => { map[row.org_id] = row })
    setBillingStatusMap(map)
    setBillingStatusLoaded(true)
  }
  useEffect(() => { loadBillingStatus() }, [])

  /* avisos de "Ja paguei" pendentes */
  const [pendingNotices, setPendingNotices] = useState([])
  async function loadPendingNotices() {
    const { data } = await supabase
      .from('payment_notices')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
    setPendingNotices(data || [])
  }
  useEffect(() => { loadPendingNotices() }, [])

  const [noticeActionTarget, setNoticeActionTarget] = useState(null) // { notice, mode: 'reject' }
  const [rejectReason, setRejectReason] = useState('')

  async function handleConfirmNotice(notice) {
    const key = `confirm-notice-${notice.id}`; startAction(key)
    try {
      const { error } = await supabase.rpc('confirm_payment_notice', { p_notice_id: notice.id })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao confirmar pagamento.'))
      await Promise.all([loadPendingNotices(), loadBillingStatus(), loadAdminData()])
      showSuccess('Pagamento confirmado.')
    } catch (err) { showError(err, 'Erro ao confirmar pagamento.') }
    finally { finishAction() }
  }

  async function handleRejectNotice() {
    if (!noticeActionTarget || !rejectReason.trim()) return
    const key = `reject-notice-${noticeActionTarget.id}`; startAction(key)
    try {
      const { error } = await supabase.rpc('reject_payment_notice', {
        p_notice_id: noticeActionTarget.id, p_reason: rejectReason.trim(),
      })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao recusar aviso.'))
      await loadPendingNotices()
      showSuccess('Aviso recusado.')
      setNoticeActionTarget(null); setRejectReason('')
    } catch (err) { showError(err, 'Erro ao recusar aviso.') }
    finally { finishAction() }
  }

  /* reativacao exige novo vencimento (senao a loja volta a ficar
     suspensa no mesmo instante pelo calculo por data) */
  const [reactivateTarget, setReactivateTarget] = useState(null)
  const [reactivateDueDate, setReactivateDueDate] = useState('')

  async function confirmReactivate() {
    if (!reactivateTarget || !reactivateDueDate) return
    const key = `reactivate-${reactivateTarget.id}`; startAction(key)
    try {
      const { error } = await supabase.rpc('set_subscription_status', {
        p_org_id: reactivateTarget.id, p_status: 'ativa', p_new_due_date: reactivateDueDate,
      })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao reativar.'))
      await Promise.all([loadAdminData(), loadBillingStatus()])
      showSuccess('Cliente reativado.')
      setReactivateTarget(null); setReactivateDueDate('')
    } catch (err) { showError(err, 'Erro ao reativar.') }
    finally { finishAction() }
  }

  const filteredCustomers = useMemo(() =>
    organizationRows.filter(org => {
      const matchStatus = clientFilter === 'todos' || org.customer_status === clientFilter
      const q = storeSearch.toLowerCase()
      const matchSearch = !q || [org.name, org.contact_email, org.whatsapp, org.responsible_name]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
      return matchStatus && matchSearch
    }),
  [organizationRows, clientFilter, storeSearch])

  const filteredSegments = segments.filter(s => s.product_id === clientForm.product_id)

  const segmentsById = useMemo(() =>
    segments.reduce((a, s) => ({ ...a, [s.id]: s }), {}),
  [segments])

  function handleVerticalChange(newProductId) {
    setClientForm(f => ({ ...f, product_id: newProductId, segments: [], categories: [] }))
    setCatInput('')
  }

  /* ── helpers ─────────────────────────────────────────────── */

  const getPlanById = id => plans.find(p => p.id === id)
  const getPlanIdBySlug = slug => plans.find(p => p.slug === slug)?.id || ''
  const getMaxRegistersByPlanId = id => limitsByPlan[id]?.max_users || 1
  const buildInviteLink = token => `${window.location.origin}/registrar?token=${token}`
  const getTokenFromInviteLink = link => link.split('token=')[1] || ''

  async function copyTextToClipboard(text) {
    if (navigator?.clipboard?.writeText && document.hasFocus()) {
      await navigator.clipboard.writeText(text); return
    }
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta); ta.focus(); ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (!ok) throw new Error('Nao foi possivel copiar.')
  }

  const copyInviteLink = async token => {
    const key = `copy-link-${token}`; startAction(key)
    try { await copyTextToClipboard(buildInviteLink(token)); showSuccess('Link copiado.') }
    catch (err) { showError(err, 'Nao foi possivel copiar.') }
    finally { finishAction() }
  }

  /* ── modal helpers ───────────────────────────────────────── */

  const resetClientModal = () => {
    setGeneratedLink(''); setClientModalMode('create')
    setEditingOrganizationId(null); setEditingInviteId(null)
    setClientForm({ ...initialClientForm, plan_id: plans[0]?.id || '' })
    setOrgRegisters([]); setNewRegName(''); setNewRegDesc(''); setCatInput('')
  }
  const openClientModal = () => { resetClientModal(); setShowClientModal(true) }
  const closeClientModal = () => { setShowClientModal(false); resetClientModal() }

  const openEditOrganizationModal = org => {
    const sub = subscriptionMap[org.id]
    setGeneratedLink(''); setClientModalMode('edit-active')
    setEditingOrganizationId(org.id); setEditingInviteId(null)
    setClientForm({
      store_name: org.name || '', responsible_name: org.responsible_name || '',
      company_document: org.cnpj || '', contact_email: org.contact_email || '',
      whatsapp: org.whatsapp || org.phone || '', address: org.address || '',
      notes: org.notes || '', login_email: org.contact_email || '',
      initial_password: '', product_id: org.product_id || 'loja',
      plan_id: sub?.plan_id || org.plan_id || getPlanIdBySlug(org.plan_type || 'basic'),
      segments: orgSegmentsMap[org.id] || [],
      trial_ends_at: sub?.trial_ends_at ? sub.trial_ends_at.slice(0, 10) : '',
      due_date: sub?.due_date || '',
      billing_cycle: sub?.billing_cycle || 'mensal',
      billing_amount: sub?.billing_amount ?? '',
      billing_day: sub?.billing_day ?? '',
    })
    setShowClientModal(true)
    loadOrgRegisters(org.id)
  }

  const openEditInviteModal = invite => {
    setGeneratedLink(buildInviteLink(invite.token))
    setClientModalMode('edit-invite'); setEditingInviteId(invite.id); setEditingOrganizationId(null)
    setClientForm({
      store_name: invite.store_name || '', responsible_name: invite.responsible_name || '',
      company_document: invite.company_document || '', contact_email: invite.contact_email || '',
      whatsapp: invite.whatsapp || '', address: invite.address || '',
      notes: invite.notes || '', login_email: invite.login_email || '',
      initial_password: invite.initial_password || '', product_id: invite.product_id || 'loja',
      plan_id: getPlanIdBySlug(invite.plan_type || 'basic'),
      segments: [],
    })
    setShowClientModal(true)
  }

  /* ── action handlers ─────────────────────────────────────── */

  const handleCancelInvite = async invite => {
    const isCancelling = !invite.cancelled_at
    if (isCancelling) {
      if (!window.confirm(`Cancelar o convite de "${invite.store_name}"? O link deixará de funcionar, mas o convite continua no histórico e pode ser reativado depois.`)) return
    } else {
      if (!window.confirm(`Reativar o convite de "${invite.store_name}"? Ele valerá por mais 7 dias.`)) return
    }
    const key = `cancel-invite-${invite.id}`; startAction(key)
    try {
      let payload
      if (isCancelling) {
        payload = { cancelled_at: new Date().toISOString() }
      } else {
        const exp = new Date(); exp.setDate(exp.getDate() + 7)
        payload = { cancelled_at: null, expires_at: exp.toISOString() }
      }
      const { error } = await supabase.from('store_invites').update(payload).eq('id', invite.id)
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível atualizar o convite.'))
      await loadAdminData()
      showSuccess(isCancelling ? 'Convite cancelado.' : 'Convite reativado por mais 7 dias.')
    } catch (err) { showError(err, isCancelling ? 'Não foi possível cancelar.' : 'Não foi possível reativar.') }
    finally { finishAction() }
  }

  const handleDeleteInvite = async inv => {
    if (!window.confirm('Excluir permanentemente este convite? Esta ação não pode ser desfeita e remove o histórico.')) return
    const key = `delete-invite-${inv.id}`; startAction(key)
    try {
      const { error } = await supabase.from('store_invites').delete().eq('id', inv.id)
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível excluir.'))
      await loadAdminData(); showSuccess('Convite excluído.')
    } catch (err) { showError(err, 'Não foi possível excluir.') }
    finally { finishAction() }
  }

  const handleRenewInvite = async invite => {
    const key = `renew-invite-${invite.id}`; startAction(key)
    try {
      const exp = new Date(); exp.setDate(exp.getDate() + 7)
      const { error } = await supabase.from('store_invites').update({ expires_at: exp.toISOString() }).eq('id', invite.id)
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível renovar.'))
      await loadAdminData()
      showSuccess('Convite renovado por mais 7 dias.')
    } catch (err) { showError(err, 'Não foi possível renovar.') }
    finally { finishAction() }
  }

  function enterSupportMode(org) {
    if (!window.confirm(`Acessar o painel de "${org.name}" como suporte?`)) return
    sessionStorage.setItem('support_org_id', org.id)
    sessionStorage.setItem('support_org_name', org.name)
    sessionStorage.setItem('support_mode', 'true')
    window.location.href = '/'
  }

  const handleToggleCustomerStatus = async customer => {
    const suspending = customer.customer_status !== 'suspenso'
    if (!suspending) {
      // Reativar exige informar o novo vencimento -- abre modal em vez
      // de aplicar direto (ver set_subscription_status no banco).
      setReactivateDueDate('')
      setReactivateTarget(customer)
      return
    }
    if (!window.confirm(`Suspender "${customer.name}"?`)) return
    const key = `toggle-customer-${customer.id}`; startAction(key)
    try {
      const { error } = await supabase.rpc('set_subscription_status', {
        p_org_id: customer.id, p_status: 'suspensa',
      })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao suspender cliente.'))
      await Promise.all([loadAdminData(), loadBillingStatus()])
      showSuccess('Cliente suspenso.')
    } catch (err) { showError(err, 'Erro ao alterar status.') }
    finally { finishAction() }
  }

  const handleDeleteOrganization = async () => {
    if (!deleteTarget || !deletePassword) return
    setDeleteLoading(true); setDeleteError('')
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser?.email) throw new Error('Nao foi possivel identificar o usuario.')

      const { data, error } = await supabase.functions.invoke('delete-organization', {
        body: { orgId: deleteTarget.id, callerEmail: currentUser.email, password: deletePassword },
      })

      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Erro ao excluir a organização.'
        throw new Error(msg)
      }

      await loadAdminData()
      const name = deleteTarget.name
      setDeleteTarget(null); setDeletePassword(''); setDeleteError('')
      showSuccess(`Loja "${name}" excluída com sucesso.`)
    } catch (err) {
      setDeleteError(err.message || 'Erro ao excluir. Tente novamente.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleUpdateOrganization = async () => {
    const selectedPlan = getPlanById(clientForm.plan_id)
    const sub = subscriptions.find(s => s.organization_id === editingOrganizationId)
    const orgPayload = {
      name: clientForm.store_name, cnpj: clientForm.company_document || null,
      phone: clientForm.whatsapp || null, address: clientForm.address || null,
      responsible_name: clientForm.responsible_name || null,
      contact_email: clientForm.contact_email || null,
      whatsapp: clientForm.whatsapp || null, notes: clientForm.notes || null,
      product_id: clientForm.product_id, plan_type: selectedPlan?.slug || 'basic',
      plan_id: clientForm.plan_id || null,
      max_registers: getMaxRegistersByPlanId(clientForm.plan_id),
      segment: clientForm.segments[0] || 'geral',
    }
    const { error } = await supabase.from('organizations').update(orgPayload).eq('id', editingOrganizationId).select()
    if (error) throw new Error(getErrorMessage(error, 'Erro ao atualizar cliente.'))
    const subPayload = {
      organization_id: editingOrganizationId, plan_id: clientForm.plan_id || null,
      billing_amount: clientForm.billing_amount !== '' ? Number(clientForm.billing_amount) : Number(selectedPlan?.price || 0),
      billing_cycle: clientForm.billing_cycle || 'mensal',
      billing_day: clientForm.billing_day !== '' ? Number(clientForm.billing_day) : null,
      status: sub?.status || 'ativa', payment_status: sub?.payment_status || 'pendente',
      due_date: clientForm.due_date || null,
      trial_ends_at: clientForm.trial_ends_at ? new Date(`${clientForm.trial_ends_at}T23:59:59`).toISOString() : null,
    }
    if (sub?.id) {
      const { error: sErr } = await supabase.from('saas_subscriptions').update({
        plan_id: subPayload.plan_id, billing_amount: subPayload.billing_amount,
        billing_cycle: subPayload.billing_cycle, billing_day: subPayload.billing_day,
        status: subPayload.status, payment_status: subPayload.payment_status, due_date: subPayload.due_date,
        trial_ends_at: subPayload.trial_ends_at,
      }).eq('id', sub.id)
      if (sErr) throw new Error(getErrorMessage(sErr, 'Erro ao atualizar assinatura.'))
    } else {
      const { error: iErr } = await supabase.from('saas_subscriptions').insert(subPayload)
      if (iErr) throw new Error(getErrorMessage(iErr, 'Erro ao criar assinatura.'))
    }
    const { error: delSegErr } = await supabase
      .from('organization_segments').delete().eq('org_id', editingOrganizationId)
    if (delSegErr) throw new Error(getErrorMessage(delSegErr, 'Erro ao atualizar segmentos.'))
    if (clientForm.segments.length > 0) {
      const { error: insSegErr } = await supabase.from('organization_segments').insert(
        clientForm.segments.map(sid => ({ org_id: editingOrganizationId, segment_id: sid }))
      )
      if (insSegErr) throw new Error(getErrorMessage(insSegErr, 'Erro ao salvar segmentos.'))
    }
  }

  const handleUpdateInvite = async () => {
    const selectedPlan = getPlanById(clientForm.plan_id)
    const { error } = await supabase.from('store_invites').update({
      store_name: clientForm.store_name, responsible_name: clientForm.responsible_name || null,
      company_document: clientForm.company_document || null, contact_email: clientForm.contact_email || null,
      whatsapp: clientForm.whatsapp || null, address: clientForm.address || null,
      notes: clientForm.notes || null, login_email: clientForm.login_email || null,
      initial_password: clientForm.initial_password || null,
      plan_type: selectedPlan?.slug || 'basic', product_id: clientForm.product_id,
      max_registers: getMaxRegistersByPlanId(clientForm.plan_id),
    }).eq('id', editingInviteId)
    if (error) throw new Error(getErrorMessage(error, 'Erro ao atualizar convite.'))
  }

  const handleCreateClient = async e => {
    e.preventDefault(); startAction('submit-client')
    try {
      if (clientModalMode === 'edit-active') {
        await handleUpdateOrganization(); await loadAdminData(); await loadBillingStatus()
        closeClientModal(); showSuccess('Cliente atualizado.')
      } else if (clientModalMode === 'edit-invite') {
        const inv = invites.find(i => i.id === editingInviteId)
        await handleUpdateInvite(); await loadAdminData()
        setGeneratedLink(inv?.token ? buildInviteLink(inv.token) : '')
        setShowClientModal(false); showSuccess('Convite atualizado.')
      } else {
        const selectedPlan = getPlanById(clientForm.plan_id)
        const token = crypto.randomUUID().replace(/-/g, '')
        const { error } = await supabase.from('store_invites').insert({
          token, store_name: clientForm.store_name,
          responsible_name: clientForm.responsible_name,
          company_document: clientForm.company_document,
          contact_email: clientForm.contact_email, whatsapp: clientForm.whatsapp,
          address: clientForm.address, notes: clientForm.notes,
          login_email: clientForm.login_email, initial_password: clientForm.initial_password,
          plan_type: selectedPlan?.slug || 'basic', product_id: clientForm.product_id,
          max_registers: getMaxRegistersByPlanId(clientForm.plan_id),
          preset_categories: clientForm.categories.length > 0 ? clientForm.categories : null,
        })
        if (error) throw new Error(getErrorMessage(error, 'Erro ao gerar convite.'))
        await loadAdminData()
        const link = buildInviteLink(token)
        setGeneratedLink(link); showSuccess('Convite gerado com sucesso.')
      }
    } catch (err) { showError(err, 'Nao foi possivel salvar.') }
    finally { finishAction() }
  }

  /* ── org register management (inside client edit modal) ─── */

  async function loadOrgRegisters(orgId) {
    if (!orgId) return
    setOrgRegistersLoading(true)
    const { data } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true })
    setOrgRegisters(data || [])
    setOrgRegistersLoading(false)
  }

  async function addOrgRegister() {
    if (!newRegName.trim() || !editingOrganizationId) return
    setSavingReg(true)
    const { error } = await supabase.from('cash_registers').insert({
      org_id: editingOrganizationId,
      name: newRegName.trim(),
      description: newRegDesc.trim() || null,
      is_active: true,
    })
    setSavingReg(false)
    if (error) { alert(friendlyError(error)); return }
    setNewRegName('')
    setNewRegDesc('')
    await loadOrgRegisters(editingOrganizationId)
  }

  async function toggleOrgRegister(regId, isActive) {
    await supabase.from('cash_registers').update({ is_active: !isActive }).eq('id', regId)
    await loadOrgRegisters(editingOrganizationId)
  }

  async function deleteOrgRegister(regId, regName) {
    if (!window.confirm(`Excluir o caixa "${regName}"? Esta ação é irreversível.`)) return
    await supabase.from('cash_registers').delete().eq('id', regId)
    await loadOrgRegisters(editingOrganizationId)
  }

  useImperativeHandle(ref, () => ({
    openEditInviteModal,
    openClientModal,
  }))

  /* Componente fica sempre montado (ver SuperAdminDashboard.jsx) para que
     clientesTabRef funcione mesmo a partir de outra aba (ex.: Dashboard).
     Só pulamos a renderização quando não há nem aba ativa nem modal aberto —
     o modal precisa aparecer mesmo com isActive=false. */
  if (!isActive && !showClientModal) return null

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      {isActive && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[['todos','Todos'],['ativo','Ativos'],['suspenso','Suspensos'],['cancelado','Cancelados']].map(([val, lbl]) => (
                <button key={val} onClick={() => setClientFilter(val)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${clientFilter === val ? 'bg-[#1e1b4b] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="relative lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input type="text" placeholder="Buscar empresa, e-mail ou telefone" className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} />
            </div>
          </div>

          {pendingNotices.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
                <h3 className="font-black text-amber-900 text-sm">Avisos de Pagamento Pendentes</h3>
                <p className="text-xs text-amber-700 mt-0.5">Confirme ou recuse os avisos de "Já paguei" enviados pelos clientes.</p>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingNotices.map(n => {
                  const org = organizationRows.find(o => o.id === n.org_id)
                  return (
                    <div key={n.id} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{org?.name || 'Cliente removido'}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(n.created_at).toLocaleString('pt-BR')}
                          {n.amount != null && ` · R$ ${Number(n.amount).toFixed(2)}`}
                          {n.note && ` · ${n.note}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={isActionRunning(`confirm-notice-${n.id}`)}
                          onClick={() => handleConfirmNotice(n)}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-colors">
                          {isActionRunning(`confirm-notice-${n.id}`) ? '...' : 'Confirmar'}
                        </button>
                        <button type="button"
                          onClick={() => { setNoticeActionTarget(n); setRejectReason('') }}
                          className="rounded-xl bg-white border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors">
                          Recusar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead style={{ background: '#f8f7ff' }}>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-black">
                    {['Status','Empresa','Responsável','Vertical','Segmento','Plano','Situação','Ações'].map(h => (
                      <th key={h} className="px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(c => {
                    const orgSegs = orgSegmentsMap[c.id] || []
                    return (
                    <tr key={c.id} className="border-t border-gray-50 text-sm hover:bg-gray-50/50 transition-colors">
                      {/* Status */}
                      <td className="px-3 py-3"><StatusBadge value={c.customer_status} /></td>
                      {/* Empresa */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={c.name} />
                          <div>
                            <span className="font-bold text-gray-900 block text-xs">{c.name}</span>
                            {!(c.name && c.contact_email && orgsWithRegisters.has(c.id)) && (
                              <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-0.5">
                                Incompleto
                              </span>
                            )}
                            {termsAcceptanceMap[c.id] ? (
                              <span className="block text-[10px] text-gray-400 mt-0.5">
                                Termos v{termsAcceptanceMap[c.id].terms_version} · {new Date(termsAcceptanceMap[c.id].accepted_at).toLocaleDateString('pt-BR')}
                              </span>
                            ) : (
                              <span className="block text-[10px] text-amber-600 mt-0.5">Termos: não aceito</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Responsável */}
                      <td className="px-3 py-3 text-gray-500 text-xs">{c.responsible_name || '-'}</td>
                      {/* Vertical */}
                      <td className="px-3 py-3"><VerticalBadge value={c.product_id} /></td>
                      {/* Segmento */}
                      <td className="px-3 py-3">
                        {orgSegs.length > 0
                          ? <div className="flex gap-1 flex-wrap">
                              {orgSegs.map((sid, idx) =>
                                segmentsById[sid]
                                  ? <SegmentBadge key={sid} label={segmentsById[sid].name} colorIdx={idx} />
                                  : null
                              )}
                            </div>
                          : c.segment
                            ? <SegmentBadge value={c.segment} />
                            : <span className="text-gray-400 text-xs">-</span>
                        }
                      </td>
                      {/* Plano */}
                      <td className="px-3 py-3">
                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg">{c.planName}</span>
                      </td>
                      {/* Situação (de public.get_billing_status, nunca recalculada aqui) */}
                      <td className="px-3 py-3">
                        {billingStatusLoaded && billingStatusMap[c.id] ? (
                          <div className="space-y-0.5">
                            {(() => {
                              const meta = billingStatusMeta(billingStatusMap[c.id].situacao)
                              return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                            })()}
                            {billingStatusMap[c.id].due_date && (
                              <span className="block text-[10px] text-gray-400">
                                Vence {new Date(billingStatusMap[c.id].due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">...</span>
                        )}
                      </td>
                      {/* Ações */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => onContinueOnboarding(c)}
                            title={c.name && c.contact_email && orgsWithRegisters.has(c.id) ? 'Reabrir Onboarding' : 'Continuar Onboarding'}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:brightness-95"
                            style={{ backgroundColor: '#ede9fe' }}>
                            <RefreshCw size={15} style={{ color: '#6d28d9' }} />
                          </button>
                          <button type="button" onClick={() => openEditOrganizationModal(c)} title="Editar cliente"
                            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                            <Pencil size={15} className="text-gray-500" />
                          </button>
                          <button type="button" disabled={isActionRunning(`toggle-customer-${c.id}`)}
                            onClick={() => handleToggleCustomerStatus(c)}
                            title={c.customer_status === 'suspenso' ? 'Reativar' : 'Suspender'}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:brightness-95 disabled:opacity-50"
                            style={{ backgroundColor: '#fef3c7' }}>
                            {c.customer_status === 'suspenso'
                              ? <PlayCircle  size={15} style={{ color: '#92400e' }} />
                              : <PauseCircle size={15} style={{ color: '#92400e' }} />
                            }
                          </button>
                          <button type="button" onClick={() => enterSupportMode(c)} title="Acessar como cliente (suporte)"
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:brightness-95"
                            style={{ backgroundColor: '#dbeafe' }}>
                            <LogIn size={15} style={{ color: '#1d4ed8' }} />
                          </button>
                          <button type="button" onClick={() => { setDeleteTarget(c); setDeletePassword(''); setDeleteError('') }}
                            title="Excluir cliente"
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:brightness-95"
                            style={{ backgroundColor: '#fee2e2' }}>
                            <Trash2 size={15} style={{ color: '#991b1b' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  {!loading && filteredCustomers.length === 0 && (
                    <tr><td colSpan="8" className="px-3 py-10 text-center text-sm text-gray-400">Nenhum cliente encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* pending invites */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-sm">Convites Pendentes</h3>
              <p className="text-xs text-gray-400 mt-0.5">Edite dados ou copie o link de acesso.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead style={{ background: '#f8f7ff' }}>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-black">
                    {['Empresa','Responsável','Plano','Status','Expira em','Ações'].map(h => (
                      <th key={h} className="px-5 py-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invites.map(inv => {
                    const isExpired = !inv.cancelled_at && inv.expires_at && new Date(inv.expires_at) < new Date()
                    const inviteStatus = inv.cancelled_at ? 'cancelado' : isExpired ? 'expirado' : 'ativo'
                    return (
                    <tr key={inv.id} className="border-t border-gray-50 text-sm hover:bg-gray-50/50">
                      <td className="px-5 py-3.5 font-bold text-gray-900">{inv.store_name}</td>
                      <td className="px-5 py-3.5 text-gray-500">{inv.responsible_name || '-'}</td>
                      <td className="px-5 py-3.5 text-gray-500">{plans.find(p => p.slug === inv.plan_type)?.name || inv.plan_type}</td>
                      <td className="px-5 py-3.5"><StatusBadge value={inviteStatus} /></td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('pt-BR') : '-'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEditInviteModal(inv)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700">Editar</button>
                          <button type="button" disabled={isActionRunning(`renew-invite-${inv.id}`)} onClick={() => handleRenewInvite(inv)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-60">
                            {isActionRunning(`renew-invite-${inv.id}`) ? '...' : 'Renovar'}
                          </button>
                          <button type="button" disabled={isActionRunning(`copy-link-${inv.token}`)} onClick={() => copyInviteLink(inv.token)} className="rounded-xl bg-[#1e1b4b] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 hover:bg-[#2d2878] transition-colors">
                            {isActionRunning(`copy-link-${inv.token}`) ? '...' : 'Copiar link'}
                          </button>
                          <button type="button" disabled={isActionRunning(`cancel-invite-${inv.id}`)} onClick={() => handleCancelInvite(inv)} className="rounded-xl bg-rose-500 hover:bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-colors">
                            {isActionRunning(`cancel-invite-${inv.id}`) ? '...' : (inv.cancelled_at ? 'Ativar' : 'Cancelar')}
                          </button>
                          <button type="button" disabled={isActionRunning(`delete-invite-${inv.id}`)} onClick={() => handleDeleteInvite(inv)} className="rounded-xl bg-white border border-rose-200 p-1.5 hover:bg-rose-50 disabled:opacity-60 transition-colors" title="Excluir convite">
                            <Trash2 size={13} className="text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  {invites.length === 0 && (
                    <tr><td colSpan="6" className="px-5 py-10 text-center text-sm text-gray-400">Nenhum convite pendente.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* client modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">
                {clientModalMode === 'edit-active' ? 'Editar Cliente' : clientModalMode === 'edit-invite' ? 'Editar Convite' : 'Cadastro de Cliente'}
              </h3>
              <button onClick={closeClientModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {clientModalMode === 'create' && generatedLink ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <p className="text-sm font-bold text-emerald-800">Convite gerado com sucesso!</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Link de cadastro</p>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    <ExternalLink size={14} className="text-gray-400 shrink-0" />
                    <span className="flex-1 text-sm font-mono text-gray-800 break-all select-all">{generatedLink}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 italic">Clique no campo para selecionar tudo, ou use o botão abaixo.</p>
                </div>
                <button type="button" onClick={() => copyInviteLink(getTokenFromInviteLink(generatedLink))} disabled={isActionRunning(`copy-link-${getTokenFromInviteLink(generatedLink)}`)}
                  className="w-full py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                  <Copy size={16} />
                  {isActionRunning(`copy-link-${getTokenFromInviteLink(generatedLink)}`) ? 'Copiando...' : 'Copiar link completo'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const digits = (clientForm.whatsapp || '').replace(/\D/g, '')
                    const number = digits.startsWith('55') ? digits : `55${digits}`
                    const nomeLoja = clientForm.store_name || 'você'
                    const msg = [
                      `Olá ${nomeLoja}! 🎉`,
                      `Seu negócio acaba de dar um grande passo!`,
                      `A partir de hoje fica muito mais fácil acompanhar suas vendas, estoque e fechamento do dia — tudo na palma da mão.`,
                      ``,
                      `🔗 Acesso: ${generatedLink}`,
                      ``,
                      `Qualquer dúvida estou aqui! 😊`
                    ].join('\n')
                    window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank')
                  }}
                  disabled={!(clientForm.whatsapp || '').replace(/\D/g, '')}
                  className="w-full py-3 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#25D366' }}
                >
                  💬 Enviar via WhatsApp
                </button>
                <a href={generatedLink} target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 border-2 border-violet-200 text-violet-700 font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-violet-50 transition-colors text-sm">
                  <ExternalLink size={15} />
                  Abrir link em nova aba
                </a>
              </div>
            ) : (
              <form onSubmit={handleCreateClient} className="space-y-4">
                {/* Nome da empresa */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Nome da Empresa</label>
                  <input required className={inp} value={clientForm.store_name} onChange={e => setClientForm({ ...clientForm, store_name: e.target.value })} />
                </div>

                {/* Modo criação: WhatsApp + Vertical lado a lado */}
                {clientModalMode === 'create' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">WhatsApp</label>
                      <input
                        required
                        placeholder="(00) 00000-0000"
                        className={inp}
                        value={formatPhone(clientForm.whatsapp)}
                        onChange={e => setClientForm({ ...clientForm, whatsapp: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Vertical</label>
                      <select className={inp} value={clientForm.product_id} onChange={e => handleVerticalChange(e.target.value)}>
                        {products.length > 0
                          ? products.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)
                          : PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                        }
                      </select>
                    </div>
                  </div>
                )}

                {/* Modo edição: WhatsApp + campos extras + Vertical separados */}
                {clientModalMode !== 'create' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">WhatsApp</label>
                      <input
                        placeholder="(00) 00000-0000"
                        className={inp}
                        value={formatPhone(clientForm.whatsapp)}
                        onChange={e => setClientForm({ ...clientForm, whatsapp: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">Responsável</label>
                        <input className={inp} value={clientForm.responsible_name} onChange={e => setClientForm({ ...clientForm, responsible_name: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">CPF/CNPJ</label>
                        <input className={inp} value={clientForm.company_document} onChange={e => setClientForm({ ...clientForm, company_document: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">E-mail</label>
                        <input type="email" className={inp} value={clientForm.contact_email} onChange={e => setClientForm({ ...clientForm, contact_email: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">E-mail de Login</label>
                        <input type="email" className={inp} value={clientForm.login_email} onChange={e => setClientForm({ ...clientForm, login_email: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Senha Inicial</label>
                      <input className={inp} value={clientForm.initial_password} onChange={e => setClientForm({ ...clientForm, initial_password: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Vertical</label>
                      <select className={inp} value={clientForm.product_id} onChange={e => handleVerticalChange(e.target.value)}>
                        {products.length > 0
                          ? products.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)
                          : PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                        }
                      </select>
                    </div>
                  </>
                )}

                {/* Segmento — sempre visível (quando loja) */}
                {clientForm.product_id === 'loja' && filteredSegments.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">
                      Segmentos <span className="normal-case font-normal text-gray-400">(mínimo 1)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredSegments.map(s => {
                        const checked = (clientForm.segments || []).includes(s.id)
                        return (
                          <label key={s.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer border transition-colors ${
                            checked ? 'bg-violet-50 border-violet-300' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setClientForm(f => ({
                                ...f,
                                segments: checked
                                  ? (f.segments || []).filter(id => id !== s.id)
                                  : [...(f.segments || []), s.id],
                              }))}
                              className="w-3.5 h-3.5 accent-violet-600 shrink-0"
                            />
                            <span className={`text-sm font-bold ${checked ? 'text-violet-700' : 'text-gray-700'}`}>{s.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Plano */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Plano</label>
                  <select required={clientModalMode === 'create'} className={inp} value={clientForm.plan_id} onChange={e => setClientForm({ ...clientForm, plan_id: e.target.value })}>
                    <option value="">Selecione</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Cobranca -- so faz sentido depois que a assinatura ja existe */}
                {clientModalMode === 'edit-active' && (
                  <div className="sm:col-span-2 space-y-4 rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Cobrança</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">Ciclo</label>
                        <select className={inp} value={clientForm.billing_cycle}
                          onChange={e => {
                            const cycle = e.target.value
                            const selectedPlan = getPlanById(clientForm.plan_id)
                            const suggested = suggestCycleAmount(cycle, selectedPlan?.price, billingSettings.annual_months_charged)
                            setClientForm({ ...clientForm, billing_cycle: cycle, billing_amount: String(suggested) })
                          }}>
                          <option value="mensal">Mensal</option>
                          <option value="anual">Anual</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">Valor do ciclo (R$)</label>
                        <input type="number" step="0.01" min="0" className={inp} value={clientForm.billing_amount}
                          onChange={e => setClientForm({ ...clientForm, billing_amount: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">Dia preferido (1-31)</label>
                        <input type="number" min="1" max="31" className={inp} value={clientForm.billing_day}
                          onChange={e => {
                            const day = e.target.value
                            setClientForm(f => ({
                              ...f,
                              billing_day: day,
                              due_date: day ? suggestNextDueDate(day) : f.due_date,
                            }))
                          }} />
                        <p className="text-[11px] text-gray-400">Ao mudar, sugere a próxima data com esse dia no campo ao lado -- só grava o que você confirmar.</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase">Próximo vencimento</label>
                        <input type="date" className={inp} value={clientForm.due_date}
                          onChange={e => setClientForm({ ...clientForm, due_date: e.target.value })} />
                        <p className="text-[11px] text-gray-400">Em branco e sem período de teste = situação "Sem vencimento".</p>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Período de teste até (opcional)</label>
                        <input type="date" className={inp} value={clientForm.trial_ends_at}
                          onChange={e => setClientForm({ ...clientForm, trial_ends_at: e.target.value })} />
                        <p className="text-[11px] text-gray-400">Enquanto não vencer, a situação aparece como "Período de teste" e o acesso nunca é bloqueado.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Categorias — modo criação apenas, opcional */}
                {clientModalMode === 'create' && (() => {
                  const segKey = clientForm.segments[0] || (clientForm.product_id === 'loja' ? 'geral' : null)
                  const pool = segKey ? (PRESET_CATEGORIES[segKey] || PRESET_CATEGORIES.fallback) : PRESET_CATEGORIES.fallback
                  const alreadyAdded = clientForm.categories || []

                  const HISTORY_KEY = 'autolavy_category_history'
                  function saveToHistory(name) {
                    const current = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
                    if (current.includes(name)) return
                    localStorage.setItem(HISTORY_KEY, JSON.stringify([name, ...current].slice(0, 50)))
                  }

                  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
                  const fromHistory = catInput.trim()
                    ? history.filter(h => h.toLowerCase().includes(catInput.toLowerCase()) && !alreadyAdded.includes(h))
                    : []
                  const fromPreset = catInput.trim()
                    ? pool.filter(p => p.toLowerCase().includes(catInput.toLowerCase()) && !alreadyAdded.includes(p) && !fromHistory.includes(p))
                    : []
                  const suggestions = [...fromHistory, ...fromPreset].slice(0, 8)

                  function addCategory(name) {
                    const trimmed = name.trim()
                    if (!trimmed || alreadyAdded.includes(trimmed)) return
                    saveToHistory(trimmed)
                    setClientForm(f => ({ ...f, categories: [...(f.categories || []), trimmed] }))
                    setCatInput('')
                  }
                  function removeCategory(name) {
                    setClientForm(f => ({ ...f, categories: (f.categories || []).filter(c => c !== name) }))
                  }
                  return (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">
                        Categorias <span className="normal-case font-normal text-gray-400">(opcional — criadas automaticamente para o cliente)</span>
                      </label>

                      {/* Tags das categorias adicionadas */}
                      {alreadyAdded.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {alreadyAdded.map(cat => (
                            <span key={cat} className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                              {cat}
                              <button type="button" onClick={() => removeCategory(cat)} className="text-violet-400 hover:text-violet-700 transition-colors ml-0.5">
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Input + botão + dropdown */}
                      <div className="relative">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={catInput}
                            onChange={e => setCatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(catInput) } }}
                            placeholder="Digite uma categoria..."
                            className={inp + ' flex-1'}
                          />
                          <button
                            type="button"
                            onClick={() => addCategory(catInput)}
                            disabled={!catInput.trim()}
                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        {suggestions.length > 0 && (
                          <div className="absolute z-10 left-0 right-12 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                            {suggestions.map(s => {
                              const isHistory = fromHistory.includes(s)
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onMouseDown={e => { e.preventDefault(); addCategory(s) }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium transition-colors flex items-center gap-2"
                                >
                                  {isHistory && <Clock size={12} className="text-gray-400 shrink-0" />}
                                  {s}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Endereço + Observações — visíveis apenas em modo edição */}
                {clientModalMode !== 'create' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Endereço</label>
                      <input className={inp} value={clientForm.address} onChange={e => setClientForm({ ...clientForm, address: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Observações</label>
                      <textarea className={inp + ' min-h-[80px] resize-none'} value={clientForm.notes} onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} />
                    </div>
                  </>
                )}

                {/* PDVs / Caixas — only visible in edit-active mode */}
                {clientModalMode === 'edit-active' && (
                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-gray-400" />
                      <h4 className="text-sm font-black text-gray-900">PDVs / Caixas</h4>
                      <span className="text-xs text-gray-400 ml-1">
                        ({orgRegisters.length} caixa{orgRegisters.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {orgRegistersLoading ? (
                      <div className="text-xs text-gray-400 text-center py-3">Carregando caixas...</div>
                    ) : (
                      <div className="space-y-2">
                        {orgRegisters.map(reg => (
                          <div key={reg.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 truncate">{reg.name}</p>
                              {reg.description && <p className="text-xs text-gray-400 truncate">{reg.description}</p>}
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${reg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                              {reg.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleOrgRegister(reg.id, reg.is_active)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 transition-colors ${reg.is_active ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                            >
                              {reg.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteOrgRegister(reg.id, reg.name)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-red-50 border border-gray-200 transition-colors shrink-0"
                            >
                              <Trash2 size={12} className="text-gray-400" />
                            </button>
                          </div>
                        ))}

                        {/* inline add new register */}
                        <div className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-2.5">
                          <Monitor size={13} className="text-gray-300 shrink-0" />
                          <input
                            type="text"
                            value={newRegName}
                            onChange={e => setNewRegName(e.target.value)}
                            placeholder="Nome do novo caixa..."
                            className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400 min-w-0"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOrgRegister() } }}
                          />
                          <button
                            type="button"
                            onClick={addOrgRegister}
                            disabled={!newRegName.trim() || savingReg}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-[#7c3aed] text-white disabled:opacity-40 hover:bg-[#6d28d9] transition-colors"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {clientModalMode === 'edit-invite' && generatedLink && (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 space-y-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Link do convite</p>
                    <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2.5">
                      <ExternalLink size={13} className="text-amber-500 shrink-0" />
                      <span className="flex-1 text-xs font-mono text-amber-900 break-all select-all">{generatedLink}</span>
                    </div>
                    <button type="button" onClick={() => copyInviteLink(invites.find(i => i.id === editingInviteId)?.token || '')}
                      disabled={isActionRunning(`copy-link-${invites.find(i => i.id === editingInviteId)?.token || ''}`)}
                      className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 disabled:opacity-60 hover:bg-amber-50 transition-colors">
                      <Copy size={13} />Copiar link
                    </button>
                  </div>
                )}
                <button type="submit" disabled={isActionRunning('submit-client')} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                  {isActionRunning('submit-client') ? 'Salvando...'
                    : clientModalMode === 'edit-active' ? 'Salvar Alterações'
                    : clientModalMode === 'edit-invite' ? 'Salvar Convite'
                    : 'Gerar Link de Acesso'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
                  <Trash2 size={17} className="text-rose-600" />
                </div>
                <h3 className="text-lg font-black text-gray-900">Excluir loja</h3>
              </div>
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); setDeleteError('') }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-1.5">
              <p className="text-sm font-black text-rose-700">Esta ação é irreversível</p>
              <p className="text-sm text-rose-600">
                Todos os dados de <strong>{deleteTarget.name}</strong> serão permanentemente removidos: vendas, produtos, caixas, funcionários e assinaturas.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Digite sua senha de superadmin para confirmar</label>
              <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && deletePassword && !deleteLoading && handleDeleteOrganization()}
                placeholder="Sua senha" autoComplete="current-password"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            {deleteError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeletePassword(''); setDeleteError('') }}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button type="button" disabled={!deletePassword || deleteLoading} onClick={handleDeleteOrganization}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                {deleteLoading ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* reativar: exige novo vencimento */}
      {reactivateTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">Reativar cliente</h3>
              <button onClick={() => setReactivateTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500">
              Informe o novo vencimento de <strong>{reactivateTarget.name}</strong>. Sem isso, a loja voltaria a ficar suspensa imediatamente.
            </p>
            <input type="date" value={reactivateDueDate} onChange={e => setReactivateDueDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setReactivateTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button type="button" disabled={!reactivateDueDate || isActionRunning(`reactivate-${reactivateTarget.id}`)}
                onClick={confirmReactivate}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                {isActionRunning(`reactivate-${reactivateTarget.id}`) ? 'Reativando...' : 'Reativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* recusar aviso de pagamento: exige motivo */}
      {noticeActionTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">Recusar aviso</h3>
              <button onClick={() => setNoticeActionTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500">O motivo é mostrado para o dono da loja.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Motivo da recusa"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-400 min-h-[90px] resize-none" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setNoticeActionTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button type="button" disabled={!rejectReason.trim() || isActionRunning(`reject-notice-${noticeActionTarget.id}`)}
                onClick={handleRejectNotice}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                {isActionRunning(`reject-notice-${noticeActionTarget.id}`) ? 'Recusando...' : 'Recusar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})

export default ClientesTab
