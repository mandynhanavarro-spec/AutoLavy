import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2, CreditCard, LayoutDashboard,
  LogOut, Plus, Settings2,
  WalletCards, Users,
} from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { LogoAutoLavy } from '../../shared/components/Logo'
import ClientOnboarding from './ClientOnboarding'
import FuncoesTab from './SuperAdminDashboard/FuncoesTab'
import PagamentosTab from './SuperAdminDashboard/PagamentosTab'
import PlanosTab from './SuperAdminDashboard/PlanosTab'
import ConfiguracoesTab from './SuperAdminDashboard/ConfiguracoesTab'
import DashboardTab from './SuperAdminDashboard/DashboardTab'
import ClientesTab from './SuperAdminDashboard/ClientesTab'

/* ── constants ─────────────────────────────────────────────── */

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

const initialSummary = {
  totalCustomers: 0, activeCustomers: 0, suspendedCustomers: 0,
  monthlyRevenue: 0, activePlans: 0,
}

/* ── main component ─────────────────────────────────────────── */

export default function SuperAdminDashboard() {
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
  const [activeAction, setActiveAction] = useState('')
  const [feedback, setFeedback] = useState(null)

  /* onboarding overlay */
  const [onboardingOrg, setOnboardingOrg]           = useState(null)
  const [onboardingIsNew, setOnboardingIsNew]       = useState(false)
  const [showNewClientTypeModal, setShowNewClientTypeModal] = useState(false)
  const sessionCheckDone = useRef(false)
  const funcoesTabRef = useRef(null)
  const pagamentosTabRef = useRef(null)
  const planosTabRef = useRef(null)
  const clientesTabRef = useRef(null)

  useEffect(() => { loadAdminData() }, [])

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

  /* ── helpers ─────────────────────────────────────────────── */

  const buildInviteLink = token => `${window.location.origin}/registrar?token=${token}`
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

  /* ── action handlers ─────────────────────────────────────── */

  const copyInviteLink = async token => {
    const key = `copy-link-${token}`; startAction(key)
    try { await copyTextToClipboard(buildInviteLink(token)); showSuccess('Link copiado.') }
    catch (err) { showError(err, 'Nao foi possivel copiar.') }
    finally { finishAction() }
  }

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
                  clientesTabRef.current?.openClientModal()
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
            {activeTab === 'clientes' && (
              <button onClick={() => setShowNewClientTypeModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
                <Plus size={15} />
                Novo Cliente
              </button>
            )}
            {activeTab === 'planos' && (
              <button onClick={() => planosTabRef.current?.openNewPlan()} className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <Plus size={15} />
                Novo Plano
              </button>
            )}
            {activeTab === 'pagamentos' && (
              <button onClick={() => pagamentosTabRef.current?.openPaymentModal()} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
                <CreditCard size={15} />
                Registrar Pagamento
              </button>
            )}
            {activeTab === 'funcoes' && (
              <button onClick={() => funcoesTabRef.current?.openNewTemplate()} className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-200 transition-colors">
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
            <DashboardTab
              summary={summary}
              revenueChange={revenueChange}
              monthlyRevenueData={monthlyRevenueData}
              organizationRows={organizationRows}
              invites={invites}
              loading={loading}
              isActionRunning={isActionRunning}
              openEditInviteModal={invite => clientesTabRef.current?.openEditInviteModal(invite)}
              copyInviteLink={copyInviteLink}
              onNewClient={() => setShowNewClientTypeModal(true)}
              onNewPlan={() => planosTabRef.current?.openNewPlan()}
              onRegisterPayment={() => pagamentosTabRef.current?.openPaymentModal()}
              onViewAllClients={() => setActiveTab('clientes')}
            />
          )}

          {/* ── CLIENTES ── */}
          <ClientesTab
            ref={clientesTabRef}
            isActive={activeTab === 'clientes'}
            organizationRows={organizationRows}
            subscriptions={subscriptions}
            invites={invites}
            plans={plans}
            limitsByPlan={limitsByPlan}
            segments={segments}
            products={products}
            orgSegmentsMap={orgSegmentsMap}
            orgsWithRegisters={orgsWithRegisters}
            loading={loading}
            loadAdminData={loadAdminData}
            showSuccess={showSuccess}
            showWarning={showWarning}
            showError={showError}
            startAction={startAction}
            finishAction={finishAction}
            isActionRunning={isActionRunning}
            onContinueOnboarding={org => setOnboardingOrg(org)}
          />

          {/* ── PLANOS ── */}
          <PlanosTab
            ref={planosTabRef}
            isActive={activeTab === 'planos'}
            plans={plans}
            featuresByPlan={featuresByPlan}
            limitsByPlan={limitsByPlan}
            loading={loading}
            loadAdminData={loadAdminData}
            showSuccess={showSuccess}
            showError={showError}
            startAction={startAction}
            finishAction={finishAction}
            isActionRunning={isActionRunning}
          />

          {/* ── PAGAMENTOS ── */}
          <PagamentosTab
            ref={pagamentosTabRef}
            isActive={activeTab === 'pagamentos'}
            payments={payments}
            organizations={organizations}
            subscriptions={subscriptions}
            loading={loading}
            loadAdminData={loadAdminData}
            showSuccess={showSuccess}
            showError={showError}
            startAction={startAction}
            finishAction={finishAction}
            isActionRunning={isActionRunning}
          />

          {/* ── CONFIGURAÇÕES ── */}
          {activeTab === 'configuracoes' && (
            <ConfiguracoesTab
              admins={admins}
              logs={logs}
              gatewayConfigs={gatewayConfigs}
              gatewayDraft={gatewayDraft}
              setGatewayDraft={setGatewayDraft}
              loading={loading}
              loadAdminData={loadAdminData}
              showSuccess={showSuccess}
              showError={showError}
              startAction={startAction}
              finishAction={finishAction}
              isActionRunning={isActionRunning}
            />
          )}

          {/* ── FUNÇÕES ── */}
          {activeTab === 'funcoes' && (
            <FuncoesTab ref={funcoesTabRef} loading={loading} showSuccess={showSuccess} showError={showError} />
          )}
        </main>
      </div>

    </div>
  )
}
