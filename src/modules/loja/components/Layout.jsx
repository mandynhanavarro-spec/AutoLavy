import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Box,
  Users,
  History,
  LogOut,
  Menu,
  ShieldCheck,
  Settings,
  DollarSign,
  X,
} from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { LogoMC, LogoAutoLavy } from '../../../shared/components/Logo'
import ModuleGuard from '../../../shared/components/ModuleGuard'
import { useTenantContext } from '../../../core/contexts/TenantContext'

const VERTICAL_DISPLAY = {
  loja:    { label: 'Meu Caixa',   Logo: LogoMC       },
  servico: { label: 'Meu Servico', Logo: LogoAutoLavy },
  beleza:  { label: 'Meu Studio',  Logo: LogoAutoLavy },
}

/* ── nav definitions ─────────────────────────────────────── */

const NAV_MAIN = [
  { path: '/',           icon: LayoutDashboard, label: 'Dashboard'                        },
  { path: '/pdv',        icon: ShoppingCart,    label: 'Venda'                            },
  { path: '/produtos',   icon: Package,         label: 'Produtos',   module: 'produtos'   },
  { path: '/equipe',     icon: Users,           label: 'Equipe'                           },
]
const NAV_FINANCEIRO = [
  { path: '/fechamento', icon: DollarSign,      label: 'Fechamento', module: 'relatorios' },
  { path: '/historico',  icon: History,         label: 'Histórico',  module: 'historico'  },
]
const NAV_SISTEMA = [
  { path: '/configuracoes', icon: Settings, label: 'Configurações' },
]
const MOBILE_BAR = [
  { path: '/',           icon: LayoutDashboard, label: 'Dashboard'  },
  { path: '/pdv',        icon: ShoppingCart,    label: 'Venda'      },
  { path: '/produtos',   icon: Box,             label: 'Produtos'   },
  { path: '/fechamento', icon: DollarSign,      label: 'Fechamento' },
]

/* ── component ───────────────────────────────────────────── */

export default function Layout({ profile }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { tenant } = useTenantContext()
  const { label: verticalLabel, Logo: FooterLogo } =
    VERTICAL_DISPLAY[tenant?.product_id] ?? VERTICAL_DISPLAY.loja

  useEffect(() => {
    if (profile?.org_id) {
      supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.org_id)
        .single()
        .then(({ data }) => setOrg(data))
    }
  }, [profile])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  /* sidebar link */
  function SLink({ path, icon: Icon, label }) {
    const active = location.pathname === path
    return (
      <Link
        to={path}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          active
            ? 'text-white shadow-sm'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`}
        style={active ? { backgroundColor: '#0891b2' } : {}}
      >
        <Icon size={17} />
        {label}
      </Link>
    )
  }

  /* drawer link */
  function DLink({ path, icon: Icon, label }) {
    const active = location.pathname === path
    return (
      <Link
        to={path}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        style={{
          color: active ? 'white' : 'rgba(255,255,255,0.7)',
          backgroundColor: active ? '#0891b2' : undefined,
        }}
      >
        <Icon size={17} />
        {label}
      </Link>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ════════════════════════════════════════════════════
          DESKTOP SIDEBAR  (hidden on mobile)
      ════════════════════════════════════════════════════ */}
      <aside
        className="hidden md:flex flex-col w-60 border-r border-white/10 shrink-0 z-20"
        style={{ backgroundColor: '#1a2e4a' }}
      >

        {/* Org identity */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={org?.logo_url || '/Meu_Caixa_Logo.png'}
              alt="Meu Caixa"
              style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }}
              className="shrink-0"
            />
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate leading-tight">
                {org?.name || 'Carregando...'}
              </p>
              <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider mt-0.5">
                {verticalLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV_MAIN.map(({ module: mod, ...i }) =>
            mod
              ? <ModuleGuard key={i.path} module={mod}><SLink {...i} /></ModuleGuard>
              : <SLink key={i.path} {...i} />
          )}

          <p className="text-[10px] font-bold text-white/50 px-3 pt-5 pb-1 uppercase tracking-widest">
            Financeiro
          </p>
          {NAV_FINANCEIRO.map(({ module: mod, ...i }) =>
            mod
              ? <ModuleGuard key={i.path} module={mod}><SLink {...i} /></ModuleGuard>
              : <SLink key={i.path} {...i} />
          )}

          <p className="text-[10px] font-bold text-white/50 px-3 pt-5 pb-1 uppercase tracking-widest">
            Sistema
          </p>
          {NAV_SISTEMA.map(i => <SLink key={i.path} {...i} />)}

          {profile?.role === 'superadmin' && (
            <>
              <p className="text-[10px] font-bold text-white/50 px-3 pt-5 pb-1 uppercase tracking-widest">
                Admin
              </p>
              <SLink path="/superadmin" icon={ShieldCheck} label="SuperAdmin" />
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-red-400 transition-colors"
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════
          CONTENT AREA
      ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile header */}
        <header
          className="md:hidden h-14 px-4 flex items-center justify-between text-white shadow-md shrink-0"
          style={{ backgroundColor: '#1a2e4a' }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={org?.logo_url || '/Meu_Caixa_Logo.png'}
              alt="Meu Caixa"
              style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }}
              className="shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-sm truncate leading-tight">
                {org?.name || 'Carregando...'}
              </h1>
              <p className="text-[9px] opacity-75 font-semibold tracking-widest uppercase">
                {verticalLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors shrink-0"
          >
            <LogOut size={17} />
          </button>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">

          {/* Mobile quick access — Dashboard only */}
          {location.pathname === '/' && (
            <div className="md:hidden px-4 pt-4 pb-2 grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/pdv')}
                className="flex flex-col items-center gap-1 py-3 rounded-lg"
                style={{ background: 'white', border: '0.5px solid #e5e7eb' }}
              >
                <ShoppingCart size={18} style={{ color: '#0891b2' }} />
                <span className="text-[9px] font-semibold text-gray-600">Nova venda</span>
              </button>
              <button
                onClick={() => navigate('/fechamento')}
                className="flex flex-col items-center gap-1 py-3 rounded-lg"
                style={{ background: 'white', border: '0.5px solid #e5e7eb' }}
              >
                <DollarSign size={18} style={{ color: '#0891b2' }} />
                <span className="text-[9px] font-semibold text-gray-600">Fechar caixa</span>
              </button>
            </div>
          )}

          <Outlet />
          <footer className="py-8 px-4 text-center opacity-25 flex flex-col items-center gap-1.5">
            <FooterLogo variant="white" className="h-5 w-auto" />
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              Powered by {verticalLabel}
            </p>
          </footer>
        </main>

        {/* Mobile bottom bar */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch h-16 z-20"
          style={{ backgroundColor: '#1a2e4a' }}
        >
          {MOBILE_BAR.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className="flex-1 flex flex-col items-center justify-center relative"
              >
                {active && (
                  <span
                    className="absolute top-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: '#0891b2' }}
                  />
                )}
                <Icon size={22} style={{ color: active ? '#0891b2' : 'rgba(255,255,255,0.7)' }} />
                <span
                  className="text-[9px] font-semibold mt-0.5"
                  style={{ color: active ? '#0891b2' : 'rgba(255,255,255,0.7)' }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════
          MOBILE DRAWER  (hidden on desktop)
      ════════════════════════════════════════════════════ */}
      {drawerOpen && (
        <>
          {/* Overlay */}
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div
            className="md:hidden fixed inset-y-0 left-0 w-72 z-40 flex flex-col"
            style={{ backgroundColor: '#1a2e4a' }}
          >
            {/* Drawer header */}
            <div className="px-4 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={org?.logo_url || '/Meu_Caixa_Logo.png'}
                  alt="Meu Caixa"
                  style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate leading-tight">
                    {org?.name || 'Carregando...'}
                  </p>
                  <p className="text-[10px] text-purple-300 font-semibold uppercase tracking-wider mt-0.5">
                    {verticalLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors shrink-0"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Drawer nav */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {NAV_MAIN.map(({ module: mod, ...i }) =>
                mod
                  ? <ModuleGuard key={i.path} module={mod}><DLink {...i} /></ModuleGuard>
                  : <DLink key={i.path} {...i} />
              )}

              <p className="text-[10px] font-bold text-purple-400/60 px-3 pt-5 pb-1 uppercase tracking-widest">
                Financeiro
              </p>
              {NAV_FINANCEIRO.map(({ module: mod, ...i }) =>
                mod
                  ? <ModuleGuard key={i.path} module={mod}><DLink {...i} /></ModuleGuard>
                  : <DLink key={i.path} {...i} />
              )}

              <p className="text-[10px] font-bold text-purple-400/60 px-3 pt-5 pb-1 uppercase tracking-widest">
                Sistema
              </p>
              {NAV_SISTEMA.map(i => <DLink key={i.path} {...i} />)}
            </nav>

            {/* Drawer logout */}
            <div className="p-3 border-t border-white/10 shrink-0">
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <LogOut size={17} />
                Sair
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
