import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { TenantProvider } from './core/contexts/TenantContext'
import Register from './core/pages/Register'
import DefinirSenha from './core/pages/DefinirSenha'
import MFAGate from './shared/components/MFAGate'
import SuspensaoPage from './core/pages/Suspenso'
import { supabase } from './shared/lib/supabase'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useOrgBranding } from './core/hooks/useOrgBranding'
import { TermosPage, PrivacidadePage } from './core/pages/Legal'
import { TERMS_VERSION, PRIVACY_VERSION } from './shared/lib/legal'

// ── Loja vertical (lazy) ──────────────────────────────────────
const LojaLayout        = lazy(() => import('./modules/loja/components/Layout'))
const LojaDashboard     = lazy(() => import('./modules/loja/pages/Dashboard'))
const LojaCaixa         = lazy(() => import('./modules/loja/pages/Caixa'))
const LojaProdutos      = lazy(() => import('./modules/loja/pages/Produtos'))
const LojaHistorico     = lazy(() => import('./modules/loja/pages/Historico'))
const LojaFechamento    = lazy(() => import('./modules/loja/pages/Fechamento'))
const LojaEquipe        = lazy(() => import('./modules/loja/pages/Equipe'))
const LojaConfiguracoes = lazy(() => import('./modules/loja/pages/Configuracoes'))
const LojaOnboarding    = lazy(() => import('./modules/loja/pages/Onboarding'))

// ── Beleza vertical (lazy) ────────────────────────────────────
const BelezaLayout         = lazy(() => import('./modules/beleza/components/Layout'))
const BelezaDashboard      = lazy(() => import('./modules/beleza/pages/Dashboard'))
const BelezaClientes       = lazy(() => import('./modules/beleza/pages/Clientes'))
const BelezaAlertas        = lazy(() => import('./modules/beleza/pages/Alertas'))
const BelezaRanking        = lazy(() => import('./modules/beleza/pages/Ranking'))
const BelezaAgenda         = lazy(() => import('./modules/beleza/pages/Agenda'))
const BelezaProcedimentos  = lazy(() => import('./modules/beleza/pages/Procedimentos'))
const BelezaProfissionais  = lazy(() => import('./modules/beleza/pages/Profissionais'))
const BelezaFinanceiro     = lazy(() => import('./modules/beleza/pages/Financeiro'))
const BelezaRelatorios     = lazy(() => import('./modules/beleza/pages/Relatorios'))
const BelezaEquipe         = lazy(() => import('./modules/beleza/pages/Equipe'))
const BelezaConfiguracoes  = lazy(() => import('./modules/beleza/pages/Configuracoes'))

// ── Admin (lazy) ──────────────────────────────────────────────
const SuperAdminDashboard = lazy(() => import('./admin/pages/SuperAdminDashboard'))

// ── Vertical dispatch map ─────────────────────────────────────
// To add a new vertical: import its Layout + pages above, then add an entry here.
// No other changes are required in App.jsx.
const VERTICAL_ROUTES = {
  loja: {
    Layout: LojaLayout,
    pages: [
      { path: '/',              Component: LojaDashboard     },
      { path: '/pdv',           Component: LojaCaixa         },
      { path: '/produtos',      Component: LojaProdutos      },
      { path: '/historico',     Component: LojaHistorico     },
      { path: '/fechamento',    Component: LojaFechamento    },
      { path: '/equipe',        Component: LojaEquipe        },
      { path: '/configuracoes', Component: LojaConfiguracoes },
      { path: '/onboarding',    Component: LojaOnboarding    },
    ],
  },
  // servico: { Layout: ServicoLayout, pages: [...] },  // fase 2
  beleza: {
    Layout: BelezaLayout,
    pages: [
      { path: '/',               Component: BelezaDashboard     },
      { path: '/clientes',       Component: BelezaClientes      },
      { path: '/clientes/:id',   Component: BelezaClientes      },
      { path: '/alertas',        Component: BelezaAlertas       },
      { path: '/ranking',        Component: BelezaRanking       },
      { path: '/agenda',         Component: BelezaAgenda        },
      { path: '/procedimentos',  Component: BelezaProcedimentos },
      { path: '/profissionais',  Component: BelezaProfissionais },
      { path: '/financeiro',     Component: BelezaFinanceiro    },
      { path: '/relatorios',     Component: BelezaRelatorios    },
      { path: '/equipe',         Component: BelezaEquipe        },
      { path: '/configuracoes',  Component: BelezaConfiguracoes },
    ],
  },
}

// ── Suspense helper ───────────────────────────────────────────
function PageLoader() {
  return <div className="h-screen flex items-center justify-center text-slate-400 text-sm">Carregando...</div>
}

function S({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// ── Placeholder para verticais ainda nao construidas ──────────
function VerticalEmConstrucao({ productId }) {
  const LABELS = { servico: 'Meu Servico', beleza: 'Meu Studio' }
  const label = LABELS[productId] || productId
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-100 text-center space-y-4">
        <h1 className="text-2xl font-black text-slate-900">{label}</h1>
        <p className="text-sm text-slate-500">
          Esta vertical esta em construcao e sera disponibilizada em breve.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm font-semibold text-slate-500 hover:text-slate-900 underline"
        >
          Sair
        </button>
      </div>
    </div>
  )
}

function RouteTracker() {
  const location = useLocation()
  useEffect(() => {
    // Exclui tanto /login quanto /:orgSlug/login -- sem isso, visitar uma
    // rota de login por slug gravaria ela como last_route e, apos
    // autenticar, o redirect da propria rota de login voltaria pra ela
    // mesma (loop).
    if (!/\/login$/.test(location.pathname)) {
      sessionStorage.setItem('last_route', location.pathname)
    }
  }, [location.pathname])
  return null
}

// ── Paginas pequenas (eager — necessarias no primeiro load) ────
function LoginPage() {
  // orgSlug so existe quando a rota e /:orgSlug/login; na rota generica
  // /login ele vem undefined e o hook devolve branding=null (visual padrao).
  const { orgSlug } = useParams()
  const { branding } = useOrgBranding(orgSlug)

  // "Interruptor" do white label: SOMENTE branding.logoUrl decide a troca
  // (garantido pelo proprio useOrgBranding). CSS vars sao aplicadas so no
  // escopo deste componente (nao em :root), via style no wrapper.
  const brandingVars = branding
    ? {
        ...(branding.themeColor ? { '--color-primary': branding.themeColor } : {}),
        ...(branding.secondaryColor ? { '--color-secondary': branding.secondaryColor } : {}),
      }
    : {}
  const logoSrc   = branding?.logoUrl || '/Meu_Caixa_Logo.png'
  const logoAlt   = branding?.name || 'Meu Caixa'
  const brandTitle = branding ? `Bem-vindo à ${branding.name}` : 'Bem-vindo ao Meu Caixa'
  const brandSubtitle = branding?.slogan || 'Gerencie sua loja com facilidade, digite seus dados para continuar.'

  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotNotice, setForgotNotice] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMessage(error.message || 'Nao foi possivel fazer login.')
    }

    setSubmitting(false)
  }

  const openForgotPassword = () => {
    setForgotEmail(email)
    setForgotSent(false)
    setForgotNotice('')
    setMode('forgot')
  }

  const handleForgotSubmit = async (event) => {
    event.preventDefault()

    // Logins de funcionário usam e-mail fictício <login>@<slug-da-org>.local
    // (ver src/shared/lib/employeeEmail.js). O TLD .local nunca entrega e-mail
    // de verdade, então o link de recuperação jamais chegaria -- em vez de
    // deixar a pessoa esperando um e-mail que não vem, avisa o caminho real:
    // o responsável da loja redefine pela tela Equipe.
    if (forgotEmail.trim().toLowerCase().endsWith('.local')) {
      setForgotNotice('Este é um login de funcionário. Peça ao responsável da loja para redefinir sua senha.')
      return
    }

    setForgotNotice('')
    setForgotSubmitting(true)

    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })

    setForgotSubmitting(false)
    setForgotSent(true)
  }

  if (mode === 'forgot') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" style={brandingVars}>
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px' }}>
            <img
              src={logoSrc}
              alt={logoAlt}
              style={{ width: '72px', height: '72px', borderRadius: '16px', objectFit: 'cover', marginBottom: '8px' }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Esqueci minha senha</h1>
            <p className="text-sm text-slate-500 mt-1">Informe seu e-mail para receber um link de recuperação.</p>
          </div>

          {forgotSent ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Se esse e-mail existir no sistema, você receberá um link para redefinir sua senha.
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(event) => { setForgotEmail(event.target.value); setForgotNotice('') }}
                placeholder="E-mail"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />

              {forgotNotice && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {forgotNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotSubmitting}
                className="w-full rounded-2xl bg-[var(--color-primary,#0f172a)] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {forgotSubmitting ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => setMode('login')}
            className="w-full text-center text-sm text-[var(--color-secondary,#64748b)] hover:opacity-80 font-medium"
          >
            Voltar ao login
          </button>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Termos de Uso</a>
            <span>•</span>
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Política de Privacidade</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" style={brandingVars}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px' }}>
          <img
            src={logoSrc}
            alt={logoAlt}
            style={{ width: '72px', height: '72px', borderRadius: '16px', objectFit: 'cover', marginBottom: '8px' }}
          />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">{brandTitle}</h1>
          <p className="text-sm text-slate-500 mt-1">{brandSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-[var(--color-primary,#0f172a)] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={openForgotPassword}
            className="w-full text-center text-sm text-[var(--color-secondary,#64748b)] hover:opacity-80 font-medium"
          >
            Esqueci minha senha
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
          <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Termos de Uso</a>
          <span>•</span>
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Política de Privacidade</a>
        </div>
      </div>
    </div>
  )
}

function UpgradePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-3">
        <h1 className="text-2xl font-black text-slate-900">Upgrade</h1>
        <p className="text-sm text-slate-600">Pagina preparada para expansao futura de planos e limites.</p>
      </div>
    </div>
  )
}

function SimplePage({ title, description }) {
  return (
    <div className="p-4 md:p-6">
      <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-sm space-y-2">
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </div>
  )
}

function NoOrganizationPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-3">
      <h2 className="text-xl font-black text-gray-900">Conta sem Organizacao</h2>
      <p className="text-gray-500 text-sm">
        Seu usuario ainda nao esta vinculado a uma empresa. Peca um convite ao administrador do SaaS.
      </p>
      <button
        onClick={() => {
          supabase.auth.signOut().finally(() => window.location.assign('/login'))
        }}
        className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl"
      >
        Voltar ao Login
      </button>
    </div>
  )
}

// ── Modal bloqueante de nova versao dos Termos/Privacidade ────
// So aparece pro dono/admin da loja (nunca pra operador/gerente/
// superadmin) quando o aceite registrado em terms_acceptances nao
// cobre a versao vigente (TERMS_VERSION/PRIVACY_VERSION).
function TermsUpdateModal({ userId, orgId, onAccepted, isFirstAcceptance }) {
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('terms_acceptances').insert({
      user_id: userId,
      org_id: orgId,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      user_agent: navigator.userAgent,
    })
    setSaving(false)
    if (insertError) {
      setError('Nao foi possivel registrar o aceite. Tente novamente.')
      return
    }
    onAccepted()
  }

  return (
    <div className="fixed inset-0 z-[9997] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-100 space-y-4">
        <h2 className="text-xl font-black text-slate-900">
          {isFirstAcceptance ? 'Para começar, leia e aceite os Termos' : 'Atualizamos nossos Termos'}
        </h2>
        <p className="text-sm text-slate-600">
          {isFirstAcceptance
            ? 'Para começar a usar o Meu Caixa, leia e aceite os Termos de Uso e a Política de Privacidade.'
            : 'Revisamos os Termos de Uso e a Política de Privacidade do Meu Caixa. Para continuar usando o sistema, leia e aceite a nova versão.'}
        </p>
        <div className="flex gap-2 text-sm">
          <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
            Ver Termos de Uso
          </a>
          <span className="text-slate-300">•</span>
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
            Ver Politica de Privacidade
          </a>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          {isFirstAcceptance
            ? 'Li e aceito os Termos de Uso e a Política de Privacidade'
            : 'Li e aceito os novos Termos de Uso e a Política de Privacidade'}
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={!checked || saving}
          onClick={handleAccept}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Aceitar e continuar'}
        </button>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const { needRefresh, updateServiceWorker } = useServiceWorker()

  const supportMode    = sessionStorage.getItem('support_mode') === 'true'
  const supportOrgName = sessionStorage.getItem('support_org_name')

  function exitSupportMode() {
    sessionStorage.removeItem('support_mode')
    sessionStorage.removeItem('support_org_id')
    sessionStorage.removeItem('support_org_name')
    window.location.href = '/superadmin'
  }

  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [latestTermsAcceptance, setLatestTermsAcceptance] = useState(null)
  const currentUserIdRef = useRef(null)

  useEffect(() => {
    let mounted = true

    async function loadUserContext(currentSession) {
      if (!currentSession?.user?.id) {
        if (!mounted) return
        setProfile(null)
        setTenant(null)
        setModules([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data: loadedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .single()

      const _supportOrgId   = sessionStorage.getItem('support_org_id')
      const _isSupportMode  = sessionStorage.getItem('support_mode') === 'true'
      const effectiveOrgId  = (_isSupportMode && _supportOrgId) ? _supportOrgId : loadedProfile?.org_id

      let loadedTenant = null
      if (effectiveOrgId) {
        const { data } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', effectiveOrgId)
          .single()
        loadedTenant = data || null
      }

      let loadedModules = []
      if (loadedTenant?.plan_id) {
        const cacheKey = `autolavy_modules_${loadedTenant.plan_id}`
        const cached = sessionStorage.getItem(cacheKey)
        let fromCache = false
        if (cached !== null) {
          try {
            const parsed = JSON.parse(cached)
            if (parsed.length > 0) {
              loadedModules = parsed
              fromCache = true
            }
          } catch { /* JSON invalido, re-fetch */ }
        }
        if (!fromCache) {
          try {
            const { data: features, error } = await supabase
              .from('saas_plan_features')
              .select('feature_key')
              .eq('plan_id', loadedTenant.plan_id)
              .eq('enabled', true)
            if (error) throw error
            loadedModules = features?.map(f => f.feature_key) ?? []
            if (loadedModules.length > 0) {
              sessionStorage.setItem(cacheKey, JSON.stringify(loadedModules))
            }
          } catch (err) {
            console.error('[AutoLavy] Falha ao carregar modules do plano:', err)
            loadedModules = []
          }
        }
      }

      let loadedLatestAcceptance = null
      if (loadedProfile?.role === 'admin') {
        const { data: acceptanceRows } = await supabase
          .from('terms_acceptances')
          .select('terms_version, privacy_version')
          .eq('user_id', currentSession.user.id)
          .order('accepted_at', { ascending: false })
          .limit(1)
        loadedLatestAcceptance = acceptanceRows?.[0] || null
      }

      if (!mounted) return
      currentUserIdRef.current = currentSession?.user?.id || null
      setProfile(loadedProfile || null)
      setTenant(loadedTenant)
      setModules(loadedModules)
      setLatestTermsAcceptance(loadedLatestAcceptance)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return
      setSession(initialSession)
      loadUserContext(initialSession)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)

      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null
        loadUserContext(nextSession)
        return
      }

      if (event === 'INITIAL_SESSION') {
        loadUserContext(nextSession)
        return
      }

      if (event === 'SIGNED_IN') {
        const nextUserId = nextSession?.user?.id
        if (nextUserId && nextUserId !== currentUserIdRef.current) {
          loadUserContext(nextSession)
          return
        }
        return
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // ── Paginas publicas de Termos/Privacidade: acessiveis em qualquer
  // estado de sessao (logado ou nao), por isso o short-circuit vem
  // antes de qualquer branch de auth/tenant.
  const publicPath = window.location.pathname
  if (publicPath === '/termos') return <TermosPage />
  if (publicPath === '/privacidade') return <PrivacidadePage />

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Carregando...</div>
  }

  // ── SuperAdmin: arvore de rotas propria, sem vertical ────────
  if (session && profile?.role === 'superadmin' && !supportMode) {
    return (
      <TenantProvider value={{ tenant: null, modules: [], profile, loading: false }}>
        {needRefresh && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
            backgroundColor: '#1a2e4a', padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, color: 'white' }}>Nova versão disponível</span>
            <button
              onClick={() => updateServiceWorker(true)}
              style={{
                fontSize: 12, fontWeight: 500, color: '#1a2e4a',
                background: 'white', border: 'none',
                borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
              }}
            >
              Atualizar agora
            </button>
          </div>
        )}
        <MFAGate mode="required">
          <Router>
            <RouteTracker />
            <S>
              <Routes>
                <Route path="/login"     element={<Navigate to="/superadmin" replace />} />
                <Route path="/registrar" element={<Register />} />
                <Route path="/definir-senha" element={<DefinirSenha />} />
                <Route path="/upgrade"   element={<Navigate to="/superadmin" replace />} />
                <Route path="/superadmin" element={<SuperAdminDashboard />} />
                <Route path="*"          element={<Navigate to={sessionStorage.getItem('last_route') || '/superadmin'} replace />} />
              </Routes>
            </S>
          </Router>
        </MFAGate>
      </TenantProvider>
    )
  }

  // ── Sem organizacao vinculada ─────────────────────────────────
  if (session && !tenant && window.location.pathname !== '/registrar') {
    return (
      <TenantProvider value={{ tenant: null, modules: [], profile, loading: false }}>
        <NoOrganizationPage />
      </TenantProvider>
    )
  }

  // ── Conta suspensa ────────────────────────────────────────────
  const isSuspended =
    tenant?.access_status === 'bloqueado' ||
    tenant?.customer_status === 'suspenso' ||
    tenant?.is_active === false

  if (session && tenant && isSuspended) {
    return (
      <TenantProvider value={{ tenant, modules: [], profile, loading: false }}>
        <Router>
          <Routes>
            <Route path="*" element={<SuspensaoPage />} />
          </Routes>
        </Router>
      </TenantProvider>
    )
  }

  // ── Despacho de vertical ──────────────────────────────────────
  const productId = tenant?.product_id || 'loja'
  const vertical = VERTICAL_ROUTES[productId]
  // Variavel com inicial maiuscula para JSX tratar como componente
  const VerticalLayout = vertical?.Layout
  const verticalPages  = vertical?.pages ?? []

  // So dono/admin precisa re-aceitar; operador/gerente nunca veem isto.
  const needsTermsAcceptance =
    session && profile?.role === 'admin' && !supportMode &&
    (!latestTermsAcceptance ||
      latestTermsAcceptance.terms_version !== TERMS_VERSION ||
      latestTermsAcceptance.privacy_version !== PRIVACY_VERSION)

  return (
    <TenantProvider value={{ tenant, modules, profile, loading: false }}>
      {needsTermsAcceptance && (
        <TermsUpdateModal
          userId={session.user.id}
          orgId={tenant?.id}
          isFirstAcceptance={!latestTermsAcceptance}
          onAccepted={() => setLatestTermsAcceptance({ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION })}
        />
      )}
      {supportMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          backgroundColor: '#f59e0b', padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>
            Modo suporte — {supportOrgName}
          </span>
          <button
            onClick={exitSupportMode}
            style={{
              fontSize: 12, fontWeight: 700, color: '#78350f',
              background: 'rgba(0,0,0,0.1)', border: 'none',
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            }}
          >
            Sair do suporte
          </button>
        </div>
      )}
      {needRefresh && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
          backgroundColor: '#1a2e4a', padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: 'white' }}>Nova versão disponível</span>
          <button
            onClick={() => updateServiceWorker(true)}
            style={{
              fontSize: 12, fontWeight: 500, color: '#1a2e4a',
              background: 'white', border: 'none',
              borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
            }}
          >
            Atualizar agora
          </button>
        </div>
      )}
      <Router>
        <RouteTracker />
        <Routes>
          <Route path="/login"      element={!session ? <LoginPage /> : <Navigate to={sessionStorage.getItem('last_route') || '/'} replace />} />
          <Route path="/:orgSlug/login" element={!session ? <LoginPage /> : <Navigate to={sessionStorage.getItem('last_route') || '/'} replace />} />
          <Route path="/registrar"  element={<Register />} />
          <Route path="/definir-senha" element={<DefinirSenha />} />
          <Route path="/upgrade"    element={<UpgradePage />} />
          <Route path="/superadmin" element={session ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />

          {/* Arvore de rotas da vertical ativa */}
          {session && VerticalLayout && (
            <Route element={<S><VerticalLayout profile={profile} /></S>}>
              {verticalPages.map(({ path, Component }) => (
                <Route key={path} path={path} element={<S><Component /></S>} />
              ))}
            </Route>
          )}

          {/* Rota catch-all:
              - vertical nao construida → placeholder
              - nao autenticado          → /login
              - autenticado sem rota     → / */}
          <Route
            path="*"
            element={
              session && !VerticalLayout
                ? <VerticalEmConstrucao productId={productId} />
                : <Navigate to={session ? (sessionStorage.getItem('last_route') || '/') : '/login'} replace />
            }
          />
        </Routes>
      </Router>
    </TenantProvider>
  )
}
