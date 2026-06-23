import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  History,
  LogOut,
  ShieldCheck,
  Settings,
  DollarSign,
} from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { LogoMC, LogoAutoLavy } from '../../../shared/components/Logo'
import ModuleGuard from '../../../shared/components/ModuleGuard'
import { useModules } from '../../../core/hooks/useModules'
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
const NAV_BOTTOM = [
  { path: '/',         icon: LayoutDashboard, label: 'Início'  },
  { path: '/pdv',      icon: ShoppingCart,    label: 'Venda'   },
  { path: '/produtos', icon: Package,          label: 'Estoque', module: 'estoque'  },
  { path: '/equipe',   icon: Users,            label: 'Equipe'  },
  { path: '/configuracoes', icon: Settings,    label: 'Ajustes' },
]

/* ── component ───────────────────────────────────────────── */

export default function Layout({ profile }) {
  const location = useLocation()
  const [org, setOrg] = useState(null)
  const { hasModule } = useModules()
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

  const color = org?.theme_color || '#3b82f6'

  /* sidebar link */
  function SLink({ path, icon: Icon, label }) {
    const active = location.pathname === path
    return (
      <Link
        to={path}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          active
            ? 'text-white shadow-sm'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
        style={active ? { backgroundColor: color } : {}}
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
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0 z-20">

        {/* Org identity */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {org?.logo_url ? (
              <img
                src={org.logo_url}
                alt={org.name}
                className="w-10 h-10 rounded-xl object-contain bg-gray-100 p-1 shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shrink-0"
                style={{ backgroundColor: color }}
              >
                {org?.name?.charAt(0) || 'L'}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate leading-tight">
                {org?.name || 'Carregando...'}
              </p>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
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

          <p className="text-[10px] font-bold text-gray-400 px-3 pt-5 pb-1 uppercase tracking-widest">
            Financeiro
          </p>
          {NAV_FINANCEIRO.map(({ module: mod, ...i }) =>
            mod
              ? <ModuleGuard key={i.path} module={mod}><SLink {...i} /></ModuleGuard>
              : <SLink key={i.path} {...i} />
          )}

          <p className="text-[10px] font-bold text-gray-400 px-3 pt-5 pb-1 uppercase tracking-widest">
            Sistema
          </p>
          {NAV_SISTEMA.map(i => <SLink key={i.path} {...i} />)}

          {profile?.role === 'superadmin' && (
            <>
              <p className="text-[10px] font-bold text-gray-400 px-3 pt-5 pb-1 uppercase tracking-widest">
                Admin
              </p>
              <SLink path="/superadmin" icon={ShieldCheck} label="SuperAdmin" />
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
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
          style={{ backgroundColor: color }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {org?.logo_url ? (
              <img
                src={org.logo_url}
                alt={org.name}
                className="w-8 h-8 object-contain bg-white rounded-lg p-0.5 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-black text-xs border border-white/30 shrink-0">
                {org?.name?.charAt(0) || 'L'}
              </div>
            )}
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
          <Outlet />
          <footer className="py-8 px-4 text-center opacity-25 flex flex-col items-center gap-1.5">
            <FooterLogo variant="white" className="h-5 w-auto" />
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              Powered by {verticalLabel}
            </p>
          </footer>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center h-16 z-10">
          {NAV_BOTTOM.filter(({ module: mod }) => !mod || hasModule(mod)).map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                  active ? 'scale-110' : 'text-gray-400'
                }`}
                style={{ color: active ? color : undefined }}
              >
                <Icon size={22} />
                <span className="text-[10px] font-semibold mt-0.5">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
