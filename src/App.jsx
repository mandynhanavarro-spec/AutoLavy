import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
import { TenantProvider } from './core/contexts/TenantContext'
import Register from './core/pages/Register'
import SuspensaoPage from './core/pages/Suspenso'
import { supabase } from './shared/lib/supabase'

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

// ── Paginas pequenas (eager — necessarias no primeiro load) ────
function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Acessar painel</h1>
          <p className="text-sm text-slate-500 mt-1">Entre com sua conta para acessar a plataforma.</p>
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
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
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

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)

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

      let loadedTenant = null
      if (loadedProfile?.org_id) {
        const { data } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', loadedProfile.org_id)
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

      if (!mounted) return
      setProfile(loadedProfile || null)
      setTenant(loadedTenant)
      setModules(loadedModules)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return
      setSession(initialSession)
      loadUserContext(initialSession)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      loadUserContext(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Carregando...</div>
  }

  // ── SuperAdmin: arvore de rotas propria, sem vertical ────────
  if (session && profile?.role === 'superadmin') {
    return (
      <TenantProvider value={{ tenant: null, modules: [], profile, loading: false }}>
        <Router>
          <S>
            <Routes>
              <Route path="/login"     element={<Navigate to="/superadmin" replace />} />
              <Route path="/registrar" element={<Register />} />
              <Route path="/upgrade"   element={<Navigate to="/superadmin" replace />} />
              <Route path="/superadmin" element={<SuperAdminDashboard />} />
              <Route path="*"          element={<Navigate to="/superadmin" replace />} />
            </Routes>
          </S>
        </Router>
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

  return (
    <TenantProvider value={{ tenant, modules, profile, loading: false }}>
      <Router>
        <Routes>
          <Route path="/login"      element={!session ? <LoginPage /> : <Navigate to="/" replace />} />
          <Route path="/registrar"  element={<Register />} />
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
                : <Navigate to={session ? '/' : '/login'} replace />
            }
          />
        </Routes>
      </Router>
    </TenantProvider>
  )
}
