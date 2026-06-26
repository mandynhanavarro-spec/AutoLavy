import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  BadgeDollarSign, Building2, CheckCircle2, Clock, Copy, CreditCard,
  ExternalLink, FileText, KeyRound, LayoutDashboard, Lock,
  LogOut, Monitor, Plus, Search, Settings2, Shield, Trash2,
  WalletCards, X, Users, Pencil, Eye, EyeOff,
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { LogoAutoLavy } from '../../shared/components/Logo'
import ClientOnboarding from './ClientOnboarding'

/* ── constants ─────────────────────────────────────────────── */

const PRODUCT_OPTIONS = [
  { value: 'loja', label: 'Meu Caixa' },
  { value: 'servico', label: 'Meu Servico' },
  { value: 'beleza', label: 'Meu Studio' },
]

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

const PAYMENT_METHOD_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartao' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferencia' },
]

const PROVIDER_OPTIONS = ['stripe', 'mercado_pago', 'asaas', 'pagarme']

const NAV_GROUPS = [
  { items: [
    { key: 'dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  ]},
  { group: 'Gestão', items: [
    { key: 'clientes',      label: 'Clientes',     icon: Building2   },
    { key: 'planos',        label: 'Planos',       icon: WalletCards },
    { key: 'funcoes',       label: 'Funções',      icon: Users       },
  ]},
  { group: 'Financeiro', items: [
    { key: 'pagamentos',    label: 'Pagamentos',   icon: CreditCard  },
  ]},
  { group: 'Sistema', items: [
    { key: 'configuracoes', label: 'Configurações',icon: Settings2   },
  ]},
]

const SECTION_META = {
  dashboard:     { title: 'Dashboard',     subtitle: 'Visão geral do sistema SaaS' },
  clientes:      { title: 'Clientes',      subtitle: 'Gerencie lojas ativas e convites pendentes' },
  planos:        { title: 'Planos',        subtitle: 'Configure planos e funcionalidades' },
  pagamentos:    { title: 'Pagamentos',    subtitle: 'Histórico de cobranças e recebimentos' },
  funcoes:       { title: 'Funções',       subtitle: 'Templates globais de permissões para funcionários' },
  configuracoes: { title: 'Configurações', subtitle: 'Gateways de pagamento e sistema' },
}

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

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-rose-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
]

const SEGMENT_BADGES = {
  geral:       { label: 'Varejo',      cls: 'bg-gray-100 text-gray-600'     },
  moda:        { label: 'Moda',        cls: 'bg-purple-100 text-purple-700' },
  eletronicos: { label: 'Eletrônicos', cls: 'bg-blue-100 text-blue-700'     },
}

const PRESET_CATEGORIES = {
  geral:       ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'],
  moda:        ['Feminino', 'Masculino', 'Infantil', 'Calçados', 'Acessórios'],
  eletronicos: ['Celulares', 'Informática', 'TV e Áudio', 'Acessórios', 'Peças'],
  fallback:    ['Produtos', 'Serviços', 'Promoções', 'Importados', 'Outros'],
}

const VERTICAL_BADGES = {
  loja:    { label: 'Caixa',   cls: 'bg-violet-100 text-violet-700' },
  servico: { label: 'Serviço', cls: 'bg-amber-100  text-amber-700'  },
  beleza:  { label: 'Studio',  cls: 'bg-pink-100   text-pink-700'   },
}

const initialClientForm = {
  store_name: '', responsible_name: '', company_document: '',
  contact_email: '', whatsapp: '', address: '', notes: '',
  login_email: '', initial_password: '', product_id: 'loja', plan_id: '',
  segments: [], categories: [],
}

const initialPlanForm = {
  name: '', slug: '', price: '', description: '', status: 'ativo',
  features: PLAN_FEATURES.reduce((a, f) => ({ ...a, [f.key]: false }), {}),
  limits: { max_users: 0, max_clients: 0, max_products: 0, max_services: 0 },
}

const initialPaymentForm = {
  organization_id: '', amount: '', method: 'pix',
  status: 'pago', due_date: '', notes: '',
}

const initialAdminForm = { name: '', email: '', profile: 'administrador' }

function formatPhone(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const initialSummary = {
  totalCustomers: 0, activeCustomers: 0, suspendedCustomers: 0,
  monthlyRevenue: 0, activePlans: 0,
}

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
  const v = VERTICAL_BADGES[value] || { label: value || '—', cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${v.cls}`}>
      {v.label}
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

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-black text-violet-600">
        R$ {Number(payload[0].value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  )
}

/* ── main component ─────────────────────────────────────────── */

export default function SuperAdminDashboard() {
  const [valuesHidden, setValuesHidden] = useState(
    () => localStorage.getItem('superadmin_values_hidden') === 'true'
  )

  function toggleValues() {
    setValuesHidden(v => {
      const next = !v
      localStorage.setItem('superadmin_values_hidden', next)
      return next
    })
  }

  const [clientModalMode, setClientModalMode] = useState('create')
  const [editingOrganizationId, setEditingOrganizationId] = useState(null)
  const [editingInviteId, setEditingInviteId] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [summary, setSummary] = useState(initialSummary)
  const [organizations, setOrganizations] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [plans, setPlans] = useState([])
  const [planFeatures, setPlanFeatures] = useState([])
  const [planLimits, setPlanLimits] = useState([])
  const [payments, setPayments] = useState([])
  const [admins, setAdmins] = useState([])
  const [logs, setLogs] = useState([])
  const [gatewayConfigs, setGatewayConfigs] = useState([])
  const [gatewayDraft, setGatewayDraft] = useState(
    PROVIDER_OPTIONS.reduce((a, p) => ({ ...a, [p]: '' }), {})
  )
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState([])
  const [products, setProducts] = useState([])
  const [orgSegmentsMap, setOrgSegmentsMap] = useState({})
  const [orgsWithRegisters, setOrgsWithRegisters] = useState(new Set())
  const [showClientModal, setShowClientModal] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [clientForm, setClientForm] = useState(initialClientForm)
  const [planForm, setPlanForm] = useState(initialPlanForm)
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm)
  const [adminForm, setAdminForm] = useState(initialAdminForm)
  const [generatedLink, setGeneratedLink] = useState('')
  const [clientFilter, setClientFilter] = useState('todos')
  const [storeSearch, setStoreSearch] = useState('')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [activeAction, setActiveAction] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  /* role templates state */
  const [roleTemplates, setRoleTemplates]         = useState([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateForm, setTemplateForm]           = useState(initialTemplateForm)
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [templateSaving, setTemplateSaving]       = useState(false)
  const [templateError, setTemplateError]         = useState('')

  /* category input for quick create form */
  const [catInput, setCatInput] = useState('')

  /* onboarding overlay */
  const [onboardingOrg, setOnboardingOrg]           = useState(null)
  const [onboardingIsNew, setOnboardingIsNew]       = useState(false)
  const [showNewClientTypeModal, setShowNewClientTypeModal] = useState(false)
  const sessionCheckDone = useRef(false)

  /* org registers state (used inside client edit modal) */
  const [orgRegisters, setOrgRegisters]         = useState([])
  const [orgRegistersLoading, setOrgRegistersLoading] = useState(false)
  const [newRegName, setNewRegName]             = useState('')
  const [newRegDesc, setNewRegDesc]             = useState('')
  const [savingReg, setSavingReg]               = useState(false)

  useEffect(() => { loadAdminData(); loadRoleTemplates() }, [])

  /* ── data loading ────────────────────────────────────────── */

  async function loadAdminData() {
    setLoading(true)
    try {
      const [
        orgRes, invRes, subRes, planRes, featRes,
        limRes, payRes, admRes, logRes, gwRes, segRes, prodRes, orgSegsRes, regCountRes,
      ] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: false }),
        supabase.from('store_invites').select('*').eq('is_used', false).order('created_at', { ascending: false }),
        supabase.from('saas_subscriptions').select('*, saas_plans(id,name,slug,price,status)').order('started_at', { ascending: false }),
        supabase.from('saas_plans').select('*').order('created_at', { ascending: false }),
        supabase.from('saas_plan_features').select('*'),
        supabase.from('saas_plan_limits').select('*'),
        supabase.from('saas_payments').select('*').order('created_at', { ascending: false }),
        supabase.from('saas_administrators').select('*').order('created_at', { ascending: false }),
        supabase.from('saas_system_logs').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('saas_gateway_configs').select('*').order('provider', { ascending: true }),
        supabase.from('segments').select('*').order('name'),
        supabase.from('autolavy_products').select('id, display_name').order('display_name'),
        supabase.from('organization_segments').select('org_id, segment_id'),
        supabase.from('cash_registers').select('org_id').eq('is_active', true),
      ])

      const firstError = [orgRes, invRes, subRes, planRes, featRes, limRes, payRes, admRes, logRes, gwRes, segRes, prodRes, orgSegsRes]
        .map(r => r.error).find(Boolean)
      if (firstError) throw new Error(firstError.message || 'Erro ao carregar dados.')

      const orgs = orgRes.data || []
      const allPayments = payRes.data || []
      const configs = gwRes.data || []

      setOrganizations(orgs)

      /* Restore in-progress onboarding after page reload (runs only on first load) */
      if (!sessionCheckDone.current) {
        sessionCheckDone.current = true
        try {
          const _s = JSON.parse(sessionStorage.getItem('autolavy_onboarding') || 'null')
          if (_s?.is_new) {
            setOnboardingIsNew(true)
          } else if (_s?.org_id) {
            const _found = orgs.find(o => o.id === _s.org_id)
            if (_found) setOnboardingOrg(_found)
          }
        } catch {}
      }

      setInvites(invRes.data || [])
      setSubscriptions(subRes.data || [])
      setPlans(planRes.data || [])
      setPlanFeatures(featRes.data || [])
      setPlanLimits(limRes.data || [])
      setPayments(allPayments)
      setAdmins(admRes.data || [])
      setLogs(logRes.data || [])
      setGatewayConfigs(configs)
      setGatewayDraft(
        PROVIDER_OPTIONS.reduce((a, p) => ({ ...a, [p]: configs.find(c => c.provider === p)?.secret_key || '' }), {})
      )
      setSegments(segRes.data || [])
      setProducts(prodRes.data || [])
      const segMap = {}
      for (const row of (orgSegsRes.data || [])) {
        if (!segMap[row.org_id]) segMap[row.org_id] = []
        segMap[row.org_id].push(row.segment_id)
      }
      setOrgSegmentsMap(segMap)
      setOrgsWithRegisters(new Set((regCountRes.data || []).map(r => r.org_id)))

      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const monthlyRevenue = allPayments
        .filter(p => p.status === 'pago' && new Date(p.created_at) >= monthStart)
        .reduce((a, p) => a + Number(p.amount || 0), 0)

      setSummary({
        totalCustomers: orgs.length,
        activeCustomers: orgs.filter(o => o.customer_status === 'ativo').length,
        suspendedCustomers: orgs.filter(o => o.customer_status === 'suspenso').length,
        monthlyRevenue,
        activePlans: (planRes.data || []).filter(p => p.status === 'ativo').length,
      })
    } catch (err) {
      setSummary(initialSummary)
      showError(err, 'Nao foi possivel carregar os dados do painel.')
    } finally {
      setLoading(false)
    }
  }

  /* ── computed ────────────────────────────────────────────── */

  const subscriptionMap = useMemo(() =>
    subscriptions.reduce((a, s) => ({ ...a, [s.organization_id]: s }), {}),
  [subscriptions])

  const featuresByPlan = useMemo(() =>
    planFeatures.reduce((a, f) => {
      if (!a[f.plan_id]) a[f.plan_id] = {}
      a[f.plan_id][f.feature_key] = f.enabled
      return a
    }, {}),
  [planFeatures])

  const limitsByPlan = useMemo(() =>
    planLimits.reduce((a, l) => ({ ...a, [l.plan_id]: l }), {}),
  [planLimits])

  const organizationRows = useMemo(() =>
    organizations.map(org => {
      const sub = subscriptionMap[org.id]
      return { ...org, subscription: sub, planName: sub?.saas_plans?.name || 'Sem plano', paymentStatus: sub?.payment_status || 'pendente' }
    }),
  [organizations, subscriptionMap])

  const filteredCustomers = useMemo(() =>
    organizationRows.filter(org => {
      const matchStatus = clientFilter === 'todos' || org.customer_status === clientFilter
      const q = storeSearch.toLowerCase()
      const matchSearch = !q || [org.name, org.contact_email, org.whatsapp, org.responsible_name]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
      return matchStatus && matchSearch
    }),
  [organizationRows, clientFilter, storeSearch])

  const filteredPayments = useMemo(() =>
    payments.filter(p => {
      const org = organizations.find(o => o.id === p.organization_id)
      const q = paymentSearch.toLowerCase()
      return !q || [org?.name, p.method, p.status].filter(Boolean).some(v => v.toLowerCase().includes(q))
    }),
  [payments, organizations, paymentSearch])

  const recentCustomers = organizationRows.slice(0, 5)

  const monthlyRevenueData = useMemo(() => {
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const raw = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      const month = raw.charAt(0).toUpperCase() + raw.slice(1)
      const receita = payments
        .filter(p => p.status === 'pago' && new Date(p.created_at) >= start && new Date(p.created_at) <= end)
        .reduce((a, p) => a + Number(p.amount || 0), 0)
      result.push({ month, receita })
    }
    return result
  }, [payments])

  const revenueChange = useMemo(() => {
    const now = new Date()
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    const cur = payments.filter(p => p.status === 'pago' && new Date(p.created_at) >= thisStart)
      .reduce((a, p) => a + Number(p.amount || 0), 0)
    const prev = payments.filter(p => p.status === 'pago' && new Date(p.created_at) >= lastStart && new Date(p.created_at) <= lastEnd)
      .reduce((a, p) => a + Number(p.amount || 0), 0)
    return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100)
  }, [payments])

  /* ── form helpers ────────────────────────────────────────── */

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
  const getErrorMessage = (err, fb) => err?.message || fb
  const isActionRunning = key => activeAction === key
  const startAction = key => { setFeedback(null); setActiveAction(key) }
  const finishAction = () => setActiveAction('')
  const showSuccess = msg => setFeedback({ type: 'success', message: msg })
  const showWarning = msg => setFeedback({ type: 'warning', message: msg })
  const showError = (err, fb) => setFeedback({ type: 'error', message: getErrorMessage(err, fb) })

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

  /* ── action handlers ─────────────────────────────────────── */

  const copyInviteLink = async token => {
    const key = `copy-link-${token}`; startAction(key)
    try { await copyTextToClipboard(buildInviteLink(token)); showSuccess('Link copiado.') }
    catch (err) { showError(err, 'Nao foi possivel copiar.') }
    finally { finishAction() }
  }

  const handleCancelInvite = async invite => {
    if (!window.confirm(`Cancelar o convite de "${invite.store_name}"?`)) return
    const key = `cancel-invite-${invite.id}`; startAction(key)
    try {
      const { error } = await supabase.from('store_invites').delete().eq('id', invite.id)
      if (error) throw new Error(getErrorMessage(error, 'Nao foi possivel cancelar.'))
      await loadAdminData(); showSuccess('Convite cancelado.')
    } catch (err) { showError(err, 'Nao foi possivel cancelar.') }
    finally { finishAction() }
  }

  const handleDeleteInvite = async inv => {
    if (!window.confirm('Excluir este convite?')) return
    const key = `delete-invite-${inv.id}`; startAction(key)
    try {
      const { error } = await supabase.from('store_invites').delete().eq('id', inv.id)
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível excluir.'))
      await loadAdminData(); showSuccess('Convite excluído.')
    } catch (err) { showError(err, 'Não foi possível excluir.') }
    finally { finishAction() }
  }

  const handleResendInvite = async invite => {
    const key = `resend-invite-${invite.id}`; startAction(key)
    try {
      const exp = new Date(); exp.setDate(exp.getDate() + 7)
      const { error } = await supabase.from('store_invites').update({ expires_at: exp.toISOString(), is_used: false }).eq('id', invite.id)
      if (error) throw new Error(getErrorMessage(error, 'Nao foi possivel reenviar.'))
      await loadAdminData()
      try { await copyTextToClipboard(buildInviteLink(invite.token)); showSuccess('Convite reenviado e link copiado.') }
      catch { showWarning('Convite reenviado, mas nao foi possivel copiar o link.') }
    } catch (err) { showError(err, 'Nao foi possivel reenviar.') }
    finally { finishAction() }
  }

  const handleToggleCustomerStatus = async customer => {
    const suspending = customer.customer_status !== 'suspenso'
    if (!window.confirm(`${suspending ? 'Suspender' : 'Reativar'} "${customer.name}"?`)) return
    const key = `toggle-customer-${customer.id}`; startAction(key)
    try {
      const { error: oErr } = await supabase.from('organizations').update({
        customer_status: suspending ? 'suspenso' : 'ativo',
        access_status: suspending ? 'bloqueado' : 'ativo',
        is_active: !suspending,
        suspended_at: suspending ? new Date().toISOString() : null,
      }).eq('id', customer.id)
      if (oErr) throw new Error(getErrorMessage(oErr, 'Erro ao atualizar cliente.'))
      const sub = subscriptions.find(s => s.organization_id === customer.id)
      if (sub?.id) {
        const { error: sErr } = await supabase.from('saas_subscriptions')
          .update({ status: suspending ? 'suspensa' : 'ativa' }).eq('id', sub.id)
        if (sErr) throw new Error(getErrorMessage(sErr, 'Erro ao atualizar assinatura.'))
      }
      await loadAdminData()
      showSuccess(`Cliente ${suspending ? 'suspenso' : 'reativado'}.`)
    } catch (err) { showError(err, 'Erro ao alterar status.') }
    finally { finishAction() }
  }

  const handleDeleteOrganization = async () => {
    if (!deleteTarget || !deletePassword) return
    console.log('[delete-org] ▶ iniciando exclusão:', deleteTarget.id, deleteTarget.name)
    setDeleteLoading(true); setDeleteError('')
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      console.log('[delete-org] usuário atual:', currentUser?.email, '| id:', currentUser?.id)
      if (!currentUser?.email) throw new Error('Nao foi possivel identificar o usuario.')

      console.log('[delete-org] chamando edge function...')
      const { data, error } = await supabase.functions.invoke('delete-organization', {
        body: { orgId: deleteTarget.id, callerEmail: currentUser.email, password: deletePassword },
      })

      console.log('[delete-organization] ── RESULTADO COMPLETO ──')
      console.log('[delete-organization] data:', JSON.stringify(data))
      console.log('[delete-organization] error:', error)
      console.log('[delete-organization] error?.message:', error?.message)
      console.log('[delete-organization] data?.error:', data?.error)
      console.log('[delete-organization] data?.success:', data?.success)

      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Erro ao excluir a organização.'
        console.error('[delete-org] ✖ lançando erro:', msg)
        throw new Error(msg)
      }

      console.log('[delete-org] ✔ sucesso — filtrando lista local...')
      setOrganizations(prev => {
        const next = prev.filter(o => o.id !== deleteTarget.id)
        console.log('[delete-org] orgs antes:', prev.length, '→ depois:', next.length)
        return next
      })
      setSubscriptions(prev => prev.filter(s => s.organization_id !== deleteTarget.id))
      const name = deleteTarget.name
      setDeleteTarget(null); setDeletePassword(''); setDeleteError('')
      showSuccess(`Loja "${name}" excluída com sucesso.`)
    } catch (err) {
      console.error('[delete-org] ✖ catch:', err.message, err)
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
    console.log('[edit] org id:', editingOrganizationId)
    console.log('[edit] payload:', orgPayload)
    const { data, error } = await supabase.from('organizations').update(orgPayload).eq('id', editingOrganizationId).select()
    console.log('[edit] resultado:', { data, error })
    if (error) throw new Error(getErrorMessage(error, 'Erro ao atualizar cliente.'))
    const subPayload = {
      organization_id: editingOrganizationId, plan_id: clientForm.plan_id || null,
      billing_amount: Number(selectedPlan?.price || 0),
      status: sub?.status || 'ativa', payment_status: sub?.payment_status || 'pendente',
      due_date: sub?.due_date || null,
    }
    if (sub?.id) {
      const { error: sErr } = await supabase.from('saas_subscriptions').update({
        plan_id: subPayload.plan_id, billing_amount: subPayload.billing_amount,
        status: subPayload.status, payment_status: subPayload.payment_status, due_date: subPayload.due_date,
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
        await handleUpdateOrganization(); await loadAdminData()
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
        console.log('[generatedLink] origin:', window.location.origin)
        console.log('[generatedLink] token:', token)
        console.log('[generatedLink] full:', link)
        setGeneratedLink(link); showSuccess('Convite gerado com sucesso.')
      }
    } catch (err) { showError(err, 'Nao foi possivel salvar.') }
    finally { finishAction() }
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

  const handleSaveAdmin = async e => {
    e.preventDefault(); startAction('submit-admin')
    try {
      const { error } = await supabase.from('saas_administrators').insert({
        ...adminForm, name: adminForm.name.trim(), email: adminForm.email.trim().toLowerCase(),
      })
      if (error) throw new Error(getErrorMessage(error, 'Erro ao salvar administrador.'))
      await loadAdminData(); setAdminForm(initialAdminForm); setShowAdminModal(false); showSuccess('Administrador salvo.')
    } catch (err) { showError(err, 'Erro ao salvar administrador.') }
    finally { finishAction() }
  }

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
    await supabase.from('cash_registers').insert({
      org_id: editingOrganizationId,
      name: newRegName.trim(),
      description: newRegDesc.trim() || null,
      is_active: true,
    })
    setNewRegName('')
    setNewRegDesc('')
    await loadOrgRegisters(editingOrganizationId)
    setSavingReg(false)
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

  const handleGatewayChange = async (provider, secretKey) => {
    const key = `gateway-${provider}`; startAction(key)
    try {
      const { error } = await supabase.from('saas_gateway_configs').upsert(
        { provider, secret_key: secretKey, is_enabled: Boolean(secretKey) }, { onConflict: 'provider' }
      )
      if (error) throw new Error(getErrorMessage(error, `Erro ao salvar ${provider}.`))
      await loadAdminData(); showSuccess(`Gateway ${provider} salvo.`)
    } catch (err) { showError(err, `Erro ao salvar ${provider}.`) }
    finally { finishAction() }
  }

  /* ── shared input class ──────────────────────────────────── */
  const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm'

  /* ── metric cards config ─────────────────────────────────── */
  const metricCards = [
    { label: 'Total Clientes', value: summary.totalCustomers, icon: Building2, color: '#6366f1', bg: '#eef2ff', change: null },
    { label: 'Ativos', value: summary.activeCustomers, icon: CheckCircle2, color: '#10b981', bg: '#ecfdf5', change: null },
    { label: 'Suspensos', value: summary.suspendedCustomers, icon: Lock, color: '#f59e0b', bg: '#fffbeb', change: null },
    { label: 'Receita Mensal', value: `R$ ${summary.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: BadgeDollarSign, color: '#ec4899', bg: '#fdf2f8', change: revenueChange, isMoney: true },
    { label: 'Planos Ativos', value: summary.activePlans, icon: WalletCards, color: '#8b5cf6', bg: '#f5f3ff', change: null },
  ]

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f7ff' }}>

      {/* ════ NEW CLIENT TYPE SELECTION ════ */}
      {showNewClientTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
            <h2 className="text-xl font-black text-gray-900 mb-1">Adicionar Novo Cliente</h2>
            <p className="text-sm text-gray-400 mb-7">Como será feita a implementação?</p>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {/* Com implementação */}
              <button
                onClick={() => {
                  setShowNewClientTypeModal(false)
                  setOnboardingIsNew(true)
                }}
                className="group flex flex-col items-start gap-3 p-5 rounded-2xl border-2 border-violet-200 bg-violet-50 hover:border-violet-500 hover:bg-violet-100 transition-all text-left"
              >
                <span className="text-3xl">🛠️</span>
                <div>
                  <p className="font-black text-gray-900 text-sm mb-1">Com Implementação</p>
                  <p className="text-xs text-gray-500 leading-relaxed">Você configura o sistema para o cliente — cria a conta, caixas, equipe e produtos.</p>
                </div>
                <span className="text-[10px] font-black text-violet-600 bg-violet-200 px-2.5 py-1 rounded-full uppercase tracking-wide">Onboarding guiado</span>
              </button>

              {/* Sem implementação */}
              <button
                onClick={() => {
                  setShowNewClientTypeModal(false)
                  openClientModal()
                }}
                className="group flex flex-col items-start gap-3 p-5 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left"
              >
                <span className="text-3xl">🔗</span>
                <div>
                  <p className="font-black text-gray-900 text-sm mb-1">Sem Implementação</p>
                  <p className="text-xs text-gray-500 leading-relaxed">Gera um link de convite para o cliente configurar o próprio sistema.</p>
                </div>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-wide">Link de convite</span>
              </button>
            </div>

            <button
              onClick={() => setShowNewClientTypeModal(false)}
              className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ════ CLIENT ONBOARDING OVERLAY ════ */}
      {(onboardingOrg || onboardingIsNew) && (
        <ClientOnboarding
          org={onboardingOrg}
          isNew={onboardingIsNew}
          plans={plans}
          segments={segments}
          onClose={(tabHint) => {
            setOnboardingOrg(null)
            setOnboardingIsNew(false)
            if (tabHint) setActiveTab(tabHint)
          }}
          onRefresh={loadAdminData}
        />
      )}

      {/* ════ SIDEBAR ════ */}
      <aside className="w-[220px] shrink-0 flex flex-col" style={{ background: '#1e1b4b' }}>
        {/* logo */}
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <LogoAutoLavy className="w-9 h-9 object-contain" variant="icon" />
            <div>
              <p className="text-white font-black text-sm leading-tight">AutoLavy</p>
              <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest">Admin SaaS</p>
            </div>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV_GROUPS.map(({ group, items }) => (
            <div key={group || '__root'}>
              {group && (
                <p className="text-[10px] font-bold text-gray-400 px-3 pt-5 pb-1 uppercase tracking-widest">
                  {group}
                </p>
              )}
              {items.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${
                    activeTab === key
                      ? 'bg-[#7c3aed] text-white shadow-lg shadow-violet-900/40'
                      : 'text-purple-200/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* sair */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={() => supabase.auth.signOut().finally(() => window.location.assign('/login'))}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition-all"
          >
            <LogOut size={16} className="shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* ════ MAIN ════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* header */}
        <header className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-black text-gray-900">{SECTION_META[activeTab].title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{SECTION_META[activeTab].subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {['dashboard', 'clientes'].includes(activeTab) && (
              <button onClick={() => setShowNewClientTypeModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
                <Plus size={15} />
                Novo Cliente
              </button>
            )}
            {['dashboard', 'planos'].includes(activeTab) && (
              <button onClick={() => setShowPlanModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <Plus size={15} />
                Novo Plano
              </button>
            )}
            {activeTab === 'pagamentos' && (
              <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
                <CreditCard size={15} />
                Registrar Pagamento
              </button>
            )}
            {activeTab === 'funcoes' && (
              <button onClick={openNewTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
                <Plus size={15} />
                Novo Template
              </button>
            )}
          </div>
        </header>

        {/* scrollable content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* feedback banner */}
          {feedback && (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : feedback.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {feedback.message}
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <>
              {/* metric cards header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Métricas</p>
                <button
                  onClick={toggleValues}
                  className="flex items-center gap-1 bg-white border font-semibold"
                  style={{ borderColor: '#e5e7eb', borderRadius: '6px', padding: '3px 8px', color: '#9ca3af', fontSize: '11px' }}
                >
                  {valuesHidden
                    ? <><EyeOff size={11} style={{ color: '#9ca3af' }} />&nbsp;Mostrar</>
                    : <><Eye    size={11} style={{ color: '#9ca3af' }} />&nbsp;Ocultar</>
                  }
                </button>
              </div>

              {/* metric cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {metricCards.map(({ label, value, icon: Icon, color, bg, change, isMoney }, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                        <Icon size={18} style={{ color }} />
                      </div>
                      {change !== null && change !== undefined && (
                        <span
                          className={`text-[10px] font-black px-2 py-1 rounded-lg ${change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                          style={isMoney && valuesHidden ? { opacity: 0 } : {}}
                        >
                          {change >= 0 ? '+' : ''}{change}%
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xl font-black leading-none"
                      style={
                        isMoney && valuesHidden
                          ? { color: '#d1d5db', letterSpacing: '3px' }
                          : { color: '#111827' }
                      }
                    >
                      {isMoney && valuesHidden ? '••••' : value}
                    </p>
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* chart + quick actions */}
              <div className="grid lg:grid-cols-[1fr_300px] gap-4">
                {/* area chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="font-black text-gray-900 text-sm">Receita Mensal</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Últimos 6 meses</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                      <span className="text-xs text-gray-400 font-medium">Receita</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyRevenueData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                        <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} width={55} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="receita" stroke="url(#strokeGrad)" strokeWidth={2.5} fill="url(#fillGrad)" dot={false} activeDot={{ r: 5, fill: '#8b5cf6', strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* quick actions + pending invites */}
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-black text-gray-900 text-sm mb-4">Ações Rápidas</h3>
                    <div className="space-y-2">
                      <button onClick={() => setShowNewClientTypeModal(true)} className="w-full flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-indigo-700 font-bold text-sm hover:bg-indigo-100 transition-colors">
                        <Building2 size={15} />Novo Cliente
                      </button>
                      <button onClick={() => setShowPlanModal(true)} className="w-full flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-violet-700 font-bold text-sm hover:bg-violet-100 transition-colors">
                        <WalletCards size={15} />Novo Plano
                      </button>
                      <button onClick={() => setShowPaymentModal(true)} className="w-full flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-colors">
                        <CreditCard size={15} />Registrar Pagamento
                      </button>
                    </div>
                  </div>

                  {invites.length > 0 && (
                    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <h3 className="font-black text-amber-800 text-sm">Convites Pendentes</h3>
                        <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full">{invites.length}</span>
                      </div>
                      <div className="space-y-2">
                        {invites.slice(0, 3).map(invite => (
                          <div key={invite.id} className="rounded-xl bg-amber-50 p-3">
                            <p className="text-sm font-bold text-slate-800 truncate">{invite.store_name}</p>
                            <div className="flex gap-2 mt-2">
                              <button type="button" onClick={() => openEditInviteModal(invite)} className="text-xs font-bold text-amber-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5">Editar</button>
                              <button type="button" disabled={isActionRunning(`copy-link-${invite.token}`)} onClick={() => copyInviteLink(invite.token)} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-2.5 py-1.5 disabled:opacity-60">
                                {isActionRunning(`copy-link-${invite.token}`) ? '...' : 'Copiar link'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* recent clients */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-sm">Últimos Clientes</h3>
                  <button onClick={() => setActiveTab('clientes')} className="text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors">Ver todos →</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {recentCustomers.map(c => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Avatar name={c.name} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400 truncate">{c.responsible_name || 'Sem responsável'} · {c.planName}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge value={c.customer_status} />
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  ))}
                  {!loading && recentCustomers.length === 0 && (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhum cliente cadastrado ainda.</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CLIENTES ── */}
          {activeTab === 'clientes' && (
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

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead style={{ background: '#f8f7ff' }}>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-black">
                        {['Empresa','Responsável','E-mail','WhatsApp','Plano','Vertical','Status','Cadastro','Pagamento','Ações'].map(h => (
                          <th key={h} className="px-5 py-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map(c => (
                        <tr key={c.id} className="border-t border-gray-50 text-sm hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.name} />
                              <div>
                                <span className="font-bold text-gray-900 block">{c.name}</span>
                                {!(c.name && c.contact_email && orgsWithRegisters.has(c.id)) && (
                                  <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-0.5">
                                    Onboarding incompleto
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500">{c.responsible_name || '-'}</td>
                          <td className="px-5 py-3.5 text-gray-500">{c.contact_email || '-'}</td>
                          <td className="px-5 py-3.5 text-gray-500">{c.whatsapp || '-'}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg">{c.planName}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <VerticalBadge value={c.product_id} />
                              {c.product_id === 'loja' && (
                                (orgSegmentsMap[c.id]?.length > 0
                                  ? orgSegmentsMap[c.id].map((sid, idx) =>
                                      segmentsById[sid]
                                        ? <SegmentBadge key={sid} label={segmentsById[sid].name} colorIdx={idx} />
                                        : null)
                                  : <SegmentBadge value={c.segment} />
                                )
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5"><StatusBadge value={c.customer_status} /></td>
                          <td className="px-5 py-3.5 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                          <td className="px-5 py-3.5"><StatusBadge value={c.paymentStatus} /></td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-2 flex-wrap">
                              {(c.name && c.contact_email && orgsWithRegisters.has(c.id)) ? (
                                <button type="button" onClick={() => setOnboardingOrg(c)} className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors flex items-center gap-1.5">
                                  <Settings2 size={12} />Reabrir Onboarding
                                </button>
                              ) : (
                                <button type="button" onClick={() => setOnboardingOrg(c)} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors flex items-center gap-1.5">
                                  <Settings2 size={12} />Continuar Onboarding
                                </button>
                              )}
                              <button type="button" onClick={() => openEditOrganizationModal(c)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">Editar</button>
                              <button type="button" disabled={isActionRunning(`toggle-customer-${c.id}`)} onClick={() => handleToggleCustomerStatus(c)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-60 transition-colors ${c.customer_status === 'suspenso' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                                {isActionRunning(`toggle-customer-${c.id}`) ? '...' : c.customer_status === 'suspenso' ? 'Reativar' : 'Suspender'}
                              </button>
                              <button type="button" onClick={() => { setDeleteTarget(c); setDeletePassword(''); setDeleteError('') }}
                                className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors" title="Excluir permanentemente">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!loading && filteredCustomers.length === 0 && (
                        <tr><td colSpan="10" className="px-5 py-10 text-center text-sm text-gray-400">Nenhum cliente encontrado.</td></tr>
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
                  <table className="w-full min-w-[980px]">
                    <thead style={{ background: '#f8f7ff' }}>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-black">
                        {['Empresa','Responsável','E-mail','Produto','Plano','Expira em','Ações'].map(h => (
                          <th key={h} className="px-5 py-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map(inv => (
                        <tr key={inv.id} className="border-t border-gray-50 text-sm hover:bg-gray-50/50">
                          <td className="px-5 py-3.5 font-bold text-gray-900">{inv.store_name}</td>
                          <td className="px-5 py-3.5 text-gray-500">{inv.responsible_name || '-'}</td>
                          <td className="px-5 py-3.5 text-gray-500">{inv.contact_email || inv.login_email || '-'}</td>
                          <td className="px-5 py-3.5 text-gray-500">{products.find(p => p.id === inv.product_id)?.display_name || PRODUCT_OPTIONS.find(o => o.value === inv.product_id)?.label || inv.product_id}</td>
                          <td className="px-5 py-3.5 text-gray-500">{plans.find(p => p.slug === inv.plan_type)?.name || inv.plan_type}</td>
                          <td className="px-5 py-3.5 text-gray-400 text-xs">{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('pt-BR') : '-'}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => openEditInviteModal(inv)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700">Editar</button>
                              <button type="button" disabled={isActionRunning(`resend-invite-${inv.id}`)} onClick={() => handleResendInvite(inv)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-60">
                                {isActionRunning(`resend-invite-${inv.id}`) ? '...' : 'Reenviar'}
                              </button>
                              <button type="button" disabled={isActionRunning(`copy-link-${inv.token}`)} onClick={() => copyInviteLink(inv.token)} className="rounded-xl bg-[#1e1b4b] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 hover:bg-[#2d2878] transition-colors">
                                {isActionRunning(`copy-link-${inv.token}`) ? '...' : 'Copiar link'}
                              </button>
                              <button type="button" disabled={isActionRunning(`cancel-invite-${inv.id}`)} onClick={() => handleCancelInvite(inv)} className="rounded-xl bg-rose-500 hover:bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-colors">
                                {isActionRunning(`cancel-invite-${inv.id}`) ? '...' : 'Cancelar'}
                              </button>
                              <button type="button" disabled={isActionRunning(`delete-invite-${inv.id}`)} onClick={() => handleDeleteInvite(inv)} className="rounded-xl bg-white border border-rose-200 p-1.5 hover:bg-rose-50 disabled:opacity-60 transition-colors" title="Excluir convite">
                                <Trash2 size={13} className="text-rose-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {invites.length === 0 && (
                        <tr><td colSpan="7" className="px-5 py-10 text-center text-sm text-gray-400">Nenhum convite pendente.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ── PLANOS ── */}
          {activeTab === 'planos' && (
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
          )}

          {/* ── PAGAMENTOS ── */}
          {activeTab === 'pagamentos' && (
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

          {/* ── CONFIGURAÇÕES ── */}
          {activeTab === 'configuracoes' && (
            <section className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                {/* admins */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-gray-900 text-sm">Administradores</h3>
                    <button onClick={() => setShowAdminModal(true)} className="rounded-xl bg-[#7c3aed] text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 hover:bg-[#6d28d9] transition-colors">
                      <Plus size={13} />Novo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {admins.map(a => (
                      <div key={a.id} className="rounded-xl bg-gray-50 p-4 flex items-center gap-3">
                        <Avatar name={a.name} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{a.name}</p>
                          <p className="text-xs text-gray-400 truncate">{a.email}</p>
                        </div>
                        <StatusBadge value={a.is_active ? 'ativo' : 'inativo'} />
                      </div>
                    ))}
                    {!loading && admins.length === 0 && (
                      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">Nenhum administrador.</div>
                    )}
                  </div>
                </div>

                {/* security */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="font-black text-gray-900 text-sm mb-4">Segurança</h3>
                  <div className="space-y-2">
                    {[
                      { Icon: Shield, label: 'Tempo de sessão', value: '8 horas', sub: 'Controle centralizado' },
                      { Icon: KeyRound, label: 'Política de senha', value: 'Ativa', sub: 'Mín. 8 caracteres + recuperação' },
                      { Icon: Lock, label: 'Autenticação 2FA', value: 'Preparado', sub: 'Ativação futura' },
                    ].map(({ Icon, label, value, sub }) => (
                      <div key={label} className="rounded-xl bg-gray-50 p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center">
                            <Icon size={15} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{label}</p>
                            <p className="text-xs text-gray-400">{sub}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gray-500 shrink-0">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* gateways */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings2 size={16} className="text-gray-400" />
                    <h3 className="font-black text-gray-900 text-sm">Gateways e Tokens</h3>
                  </div>
                  <div className="space-y-3">
                    {PROVIDER_OPTIONS.map(provider => (
                      <div key={provider} className="rounded-xl bg-gray-50 p-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                          {provider.replace('_', ' ')}
                        </label>
                        <div className="flex gap-2">
                          <input type="text" className="flex-1 rounded-xl bg-white border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                            value={gatewayDraft[provider] || ''} onChange={e => setGatewayDraft(prev => ({ ...prev, [provider]: e.target.value }))} placeholder="Token / API Key" />
                          <button type="button" disabled={isActionRunning(`gateway-${provider}`)} onClick={() => handleGatewayChange(provider, gatewayDraft[provider] || '')}
                            className="rounded-xl bg-[#1e1b4b] hover:bg-[#2d2878] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors">
                            {isActionRunning(`gateway-${provider}`) ? '...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* logs */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={16} className="text-gray-400" />
                    <h3 className="font-black text-gray-900 text-sm">Logs do Sistema</h3>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {logs.map(log => (
                      <div key={log.id} className="rounded-xl bg-gray-50 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-bold text-gray-900 text-sm">{log.action}</p>
                          <span className="text-[10px] text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{log.description || 'Sem descrição.'}</p>
                      </div>
                    ))}
                    {!loading && logs.length === 0 && (
                      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">Nenhum log.</div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── FUNÇÕES ── */}
          {activeTab === 'funcoes' && (
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
          )}
        </main>
      </div>

      {/* ════ MODALS ════ */}

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

      {/* admin modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">Novo Administrador</h3>
              <button onClick={() => setShowAdminModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveAdmin} className="space-y-4">
              <input required placeholder="Nome" className={inp} value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} />
              <input required type="email" placeholder="E-mail" className={inp} value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} />
              <select className={inp} value={adminForm.profile} onChange={e => setAdminForm({ ...adminForm, profile: e.target.value })}>
                <option value="super_admin">Super Admin</option>
                <option value="administrador">Administrador</option>
              </select>
              <button type="submit" disabled={isActionRunning('submit-admin')} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                {isActionRunning('submit-admin') ? 'Salvando...' : 'Salvar Administrador'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
