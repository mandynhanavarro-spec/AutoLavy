import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, TrendingUp, CreditCard, Package, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'

function fmt(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

function sumTotal(arr) {
  return arr.reduce((s, r) => s + Number(r.total_amount), 0)
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Dashboard() {
  const { tenant } = useTenantContext()
  const navigate = useNavigate()
  const [tab, setTab]               = useState('hoje')
  const [loading, setLoading]       = useState(true)
  const [todaySales, setTodaySales] = useState([])
  const [ystSales, setYstSales]     = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [lowStock, setLowStock]     = useState(0)
  const [topProducts, setTopProducts] = useState([])
  const [registers, setRegisters]       = useState([])
  const [regSalesMap, setRegSalesMap]   = useState({})
  const [regClosedMap, setRegClosedMap] = useState({})

  const orgId      = tenant?.id
  const themeColor = tenant?.theme_color || '#3b82f6'

  useEffect(() => {
    if (!orgId) return

    const now        = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const ystStart   = new Date(todayStart); ystStart.setDate(ystStart.getDate() - 1)
    const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6)
    const rangeStart = tab === 'hoje' ? todayStart : weekStart

    async function load() {
      setLoading(true)

      const [todayRes, ystRes, salesListRes, productsRes, itemsRes, regsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_amount, register_id')
          .eq('org_id', orgId)
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('sales')
          .select('id, total_amount')
          .eq('org_id', orgId)
          .gte('created_at', ystStart.toISOString())
          .lt('created_at', todayStart.toISOString()),
        supabase
          .from('sales')
          .select('id, total_amount, payment_method, created_at, profiles!user_id(full_name)')
          .eq('org_id', orgId)
          .gte('created_at', rangeStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('products')
          .select('id, stock_quantity, min_stock_alert')
          .eq('org_id', orgId),
        supabase
          .from('sale_items')
          .select('product_id, quantity, products(name)')
          .eq('org_id', orgId),
        supabase
          .from('cash_registers')
          .select('id, name')
          .eq('is_active', true),
      ])

      const todayData = todayRes.data || []
      const regsData  = regsRes?.data ?? []

      setTodaySales(todayData)
      setYstSales(ystRes.data || [])
      setRecentSales(salesListRes.data || [])
      setRegisters(regsData)

      if (regsData.length >= 2) {
        const map = {}
        for (const s of todayData) {
          const rid = s.register_id
          if (!rid) continue
          if (!map[rid]) map[rid] = { total: 0, count: 0 }
          map[rid].total += Number(s.total_amount)
          map[rid].count++
        }
        setRegSalesMap(map)

        try {
          const { data: closings } = await supabase
            .from('cash_closings')
            .select('register_id')
            .eq('org_id', orgId)
            .eq('date', todayISO())
          const closed = {}
          for (const c of (closings || [])) {
            if (c.register_id) closed[c.register_id] = true
          }
          setRegClosedMap(closed)
        } catch {}
      }

      const prods = productsRes.data || []
      setLowStock(prods.filter(p => Number(p.stock_quantity) <= Number(p.min_stock_alert)).length)

      const map = {}
      for (const item of (itemsRes.data || [])) {
        if (!item.product_id) continue
        if (!map[item.product_id]) map[item.product_id] = { name: item.products?.name || '—', qty: 0 }
        map[item.product_id].qty += Number(item.quantity)
      }
      setTopProducts(Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5))

      setLoading(false)
    }

    load()
  }, [orgId, tab])

  const todayTotal  = sumTotal(todaySales)
  const ystTotal    = sumTotal(ystSales)
  const ticketToday = todaySales.length > 0 ? todayTotal / todaySales.length : 0
  const ticketYst   = ystSales.length   > 0 ? ystTotal   / ystSales.length   : 0
  const maxQty      = topProducts[0]?.qty || 1

  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const cards = [
    { label: 'Vendas hoje',   value: fmt(todayTotal),      delta: pct(todayTotal, ystTotal),             icon: TrendingUp, bg: 'bg-blue-500'    },
    { label: 'Transações',    value: todaySales.length,    delta: pct(todaySales.length, ystSales.length), icon: CreditCard, bg: 'bg-emerald-500' },
    { label: 'Ticket médio',  value: fmt(ticketToday),     delta: pct(ticketToday, ticketYst),           icon: ShoppingCart, bg: 'bg-violet-500' },
    { label: 'Estoque baixo', value: lowStock,              icon: Package, bg: lowStock > 0 ? 'bg-orange-500' : 'bg-gray-400', isAlert: true },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-6">

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-black text-gray-900">Dashboard</h1>
        </div>
        <button
          onClick={() => navigate('/pdv')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-md active:scale-95 transition-transform"
          style={{ backgroundColor: themeColor }}
        >
          <ShoppingCart size={15} />
          Abrir PDV
        </button>
      </div>

      {/* Metric cards */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {cards.map((card) => {
          const Icon     = card.icon
          const positive = (card.delta ?? 0) >= 0
          return (
            <div key={card.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-gray-400 font-semibold leading-tight">{card.label}</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.bg}`}>
                  <Icon size={13} color="white" />
                </div>
              </div>
              <p className="text-xl font-black text-gray-900">{card.value}</p>
              {card.isAlert ? (
                lowStock > 0
                  ? <p className="text-[11px] mt-1 font-semibold text-orange-500 flex items-center gap-1"><AlertTriangle size={10} /> Atenção necessária</p>
                  : <p className="text-[11px] mt-1 text-gray-400">Tudo em ordem</p>
              ) : (
                <p className={`text-[11px] mt-1 font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {positive ? '+' : ''}{card.delta}% vs ontem
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Per-register cards — só com 2+ caixas */}
      {registers.length >= 2 && !loading && (
        <div className="px-4 mt-5">
          <h2 className="text-sm font-black text-gray-900 mb-3">Caixas — hoje</h2>
          <div className="space-y-2">
            {registers.map(reg => {
              const data     = regSalesMap[reg.id] || { total: 0, count: 0 }
              const isClosed = !!regClosedMap[reg.id]
              return (
                <div
                  key={reg.id}
                  className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{reg.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {data.count} transaç{data.count !== 1 ? 'ões' : 'ão'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-base font-black text-gray-900">{fmt(data.total)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isClosed ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                    }`}>
                      {isClosed ? 'Fechado' : 'Aberto'}
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Total do Dia</p>
              <p className="text-base font-black text-white">{fmt(todayTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent sales */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-900">Últimas vendas</h2>
          <div className="flex gap-0.5 bg-gray-100 rounded-xl p-0.5">
            {['hoje', 'semana'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t === 'hoje' ? 'Hoje' : 'Semana'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : recentSales.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <ShoppingCart size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-medium">
              Nenhuma venda {tab === 'hoje' ? 'hoje' : 'esta semana'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSales.map((sale, i) => (
              <div
                key={sale.id}
                className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-400 shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{fmt(sale.total_amount)}</p>
                    <p className="text-[11px] text-gray-400">
                      {sale.profiles?.full_name || 'Vendedor'} ·{' '}
                      {new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                  {sale.payment_method}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="px-4 mt-5">
          <h2 className="text-sm font-black text-gray-900 mb-3">Mais vendidos</h2>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
            {topProducts.map((product, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-gray-700 truncate max-w-[75%]">{product.name}</span>
                  <span className="font-black text-gray-900">{product.qty} un.</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(product.qty / maxQty) * 100}%`, backgroundColor: themeColor }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
