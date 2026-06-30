import { useState, useEffect, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, ShoppingCart, RotateCcw,
  ArrowDownCircle, ArrowUpCircle, Plus, X,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { usePermissions } from '../../../../core/hooks/usePermissions'

/* ── helpers ─────────────────────────────────────────────── */

function brl(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const FILTERS = [
  { key: 'hoje',   label: 'Hoje'     },
  { key: '7dias',  label: '7 dias'   },
  { key: '30dias', label: '30 dias'  },
  { key: 'mes',    label: 'Este mês' },
]

const METHOD_LABEL = {
  dinheiro: 'Dinheiro',
  pix:      'PIX',
  debito:   'Débito',
  credito:  'Crédito',
  misto:    'Misto',
}

function saleItemName(si) {
  const base  = si.products?.name || '—'
  const attrs = si.product_variants?.attributes
  if (!attrs) return base
  const { cor, tamanho, numero } = attrs
  const size    = tamanho ?? numero ?? ''
  const variant = [cor, size].filter(Boolean).join(' ')
  return variant ? `${base} - ${variant}` : base
}

const METHOD_COLOR = {
  dinheiro: 'bg-green-100 text-green-700',
  pix:      'bg-sky-100 text-sky-700',
  debito:   'bg-blue-100 text-blue-700',
  credito:  'bg-purple-100 text-purple-700',
  misto:    'bg-amber-100 text-amber-700',
}

const REGISTER_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function getStart(key) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (key === 'hoje')   return today
  if (key === '7dias')  { const d = new Date(today); d.setDate(d.getDate() - 6); return d }
  if (key === '30dias') { const d = new Date(today); d.setDate(d.getDate() - 29); return d }
  if (key === 'mes')    return new Date(now.getFullYear(), now.getMonth(), 1)
  return today
}

/* ── component ───────────────────────────────────────────── */

export default function Historico() {
  const { tenant } = useTenantContext()
  const { can }    = usePermissions()
  const canVoid    = can('can_void_sale')
  const orgId      = tenant?.id
  const color      = '#0891b2'

  const [filter, setFilter]           = useState('7dias')
  const [rawSales, setRawSales]       = useState([])
  const [rawMovs, setRawMovs]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [expanded, setExpanded]       = useState(null)
  const [itemsMap, setItemsMap]       = useState({})
  const [loadingItem, setLoadingItem] = useState(null)
  const [registers, setRegisters]     = useState([])
  const [selectedReg, setSelectedReg] = useState('all')

  const [addItemsTarget, setAddItemsTarget]   = useState(null)
  const [addItemsSearch, setAddItemsSearch]   = useState('')
  const [addItemsCart, setAddItemsCart]       = useState([])
  const [addItemsPayment, setAddItemsPayment] = useState('pix')
  const [addItemsLoading, setAddItemsLoading] = useState(false)
  const [products, setProducts]               = useState([])

  const [voidTarget, setVoidTarget]     = useState(null)
  const [voidPassword, setVoidPassword] = useState('')
  const [voidReason, setVoidReason]     = useState('')
  const [voidError, setVoidError]       = useState('')
  const [voidLoading, setVoidLoading]   = useState(false)

  /* fetch registers once */
  useEffect(() => {
    if (!orgId) return
    supabase
      .from('cash_registers')
      .select('id, name')
      .eq('is_active', true)
      .then(({ data }) => setRegisters(data ?? []))
  }, [orgId])

  /* fetch sales + movements on period or org change */
  function load() {
    if (!orgId) return
    setLoading(true)
    setExpanded(null)

    const start = getStart(filter).toISOString()

    Promise.all([
      supabase
        .from('sales')
        .select('id, total_amount, payment_method, register_id, created_at, status, voided_at, profiles!user_id(full_name), sale_payments(payment_method, amount)')
        .eq('org_id', orgId)
        .gte('created_at', start)
        .order('created_at', { ascending: false }),
      supabase
        .from('cash_movements')
        .select('id, register_id, type, amount, reason, created_at')
        .gte('created_at', start)
        .order('created_at', { ascending: false }),
    ]).then(([salesRes, movsRes]) => {
      setRawSales(salesRes.data || [])
      setRawMovs(movsRes.data || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    load()
  }, [orgId, filter])

  /* fetch products once for the "add forgotten items" picker */
  useEffect(() => {
    if (!orgId) return
    supabase
      .from('products')
      .select('id, name, price, stock_quantity, cost_price')
      .eq('org_id', orgId)
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [orgId])

  /* reset expanded when switching register filter */
  useEffect(() => { setExpanded(null) }, [selectedReg])

  /* stable color map per register index */
  const regColorMap = useMemo(() => {
    const map = {}
    registers.forEach((r, i) => {
      map[r.id] = { cls: REGISTER_COLORS[i % REGISTER_COLORS.length], name: r.name }
    })
    return map
  }, [registers])

  /* filtered sales only — for count and total */
  const sales = useMemo(() =>
    selectedReg === 'all'
      ? rawSales
      : rawSales.filter(s => s.register_id === selectedReg),
    [rawSales, selectedReg]
  )

  /* merged + sorted timeline with pre-computed sale rank */
  const timelineItems = useMemo(() => {
    const filteredSales = selectedReg === 'all'
      ? rawSales
      : rawSales.filter(s => s.register_id === selectedReg)
    const filteredMovs = selectedReg === 'all'
      ? rawMovs
      : rawMovs.filter(m => m.register_id === selectedReg)

    const merged = [
      ...filteredSales.map(s => ({ ...s, _kind: 'sale' })),
      ...filteredMovs.map(m => ({ ...m, _kind: 'mov' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    let saleRank = filteredSales.length
    return merged.map(item =>
      item._kind === 'sale' ? { ...item, _num: saleRank-- } : item
    )
  }, [rawSales, rawMovs, selectedReg])

  async function toggle(saleId) {
    if (expanded === saleId) { setExpanded(null); return }
    setExpanded(saleId)
    if (itemsMap[saleId]) return

    setLoadingItem(saleId)
    const { data } = await supabase
      .from('sale_items')
      .select('id, quantity, unit_price, subtotal, products(name), product_variants(attributes)')
      .eq('sale_id', saleId)
    setItemsMap(prev => ({ ...prev, [saleId]: data || [] }))
    setLoadingItem(null)
  }

  const totalPeriod = sales.reduce((s, r) => s + Number(r.total_amount), 0)

  const diferenca = addItemsCart.reduce((s, i) =>
    s + Number(i.product.price) * i.qty, 0)

  async function confirmAddItems() {
    if (!addItemsCart.length || !addItemsTarget) return
    setAddItemsLoading(true)
    try {
      // 1. Inserir novos sale_items (id gerado automaticamente pelo Supabase)
      const newItems = addItemsCart.map(i => ({
        org_id:     orgId,
        sale_id:    addItemsTarget.id,
        product_id: i.product.id,
        quantity:   i.qty,
        unit_price: Number(i.product.price),
        unit_cost:  Number(i.product.cost_price || 0),
        subtotal:   Number(i.product.price) * i.qty,
        variant_id: null,
      }))
      const { error: e1 } = await supabase
        .from('sale_items')
        .insert(newItems)
      if (e1) throw e1

      // 2. Atualizar total_amount e payment_method da venda
      const novoTotal = Number(addItemsTarget.total_amount) + diferenca
      const novoMethod = addItemsTarget.payment_method === addItemsPayment
        ? addItemsTarget.payment_method
        : 'misto'
      const { error: e2 } = await supabase
        .from('sales')
        .update({ total_amount: novoTotal, payment_method: novoMethod })
        .eq('id', addItemsTarget.id)
        .eq('org_id', orgId)
      if (e2) throw e2

      // 3. Inserir pagamento da diferença em sale_payments
      const { error: e3 } = await supabase
        .from('sale_payments')
        .insert({
          sale_id:        addItemsTarget.id,
          payment_method: addItemsPayment,
          amount:         diferenca,
        })
      if (e3) throw e3

      // 4. Descontar estoque manualmente
      for (const item of addItemsCart) {
        const novoEstoque = Number(item.product.stock_quantity) - item.qty
        await supabase
          .from('products')
          .update({ stock_quantity: novoEstoque })
          .eq('id', item.product.id)
          .eq('org_id', orgId)
      }

      // 5. Fechar modal e recarregar
      setItemsMap(prev => {
        const next = { ...prev }
        delete next[addItemsTarget.id]
        return next
      })
      setAddItemsTarget(null)
      setAddItemsCart([])
      setAddItemsSearch('')
      load()
    } catch (err) {
      alert('Erro ao adicionar itens: ' + err.message)
    } finally {
      setAddItemsLoading(false)
    }
  }

  async function confirmVoid() {
    if (!voidPassword.trim()) {
      setVoidError('Digite sua senha para confirmar.')
      return
    }
    setVoidLoading(true)
    setVoidError('')
    try {
      // 1. Verificar senha via re-autenticação
      const { data: { user } } = await supabase.auth.getUser()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: voidPassword,
      })
      if (authError) {
        setVoidError('Senha incorreta. Tente novamente.')
        setVoidLoading(false)
        return
      }

      // 2. Buscar itens da venda para devolver estoque
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, quantity, variant_id')
        .eq('sale_id', voidTarget.id)

      // 3. Devolver estoque de cada item
      for (const item of (items || [])) {
        if (item.variant_id) {
          const { data: v } = await supabase
            .from('product_variants')
            .select('stock_quantity')
            .eq('id', item.variant_id)
            .single()
          if (v) {
            await supabase
              .from('product_variants')
              .update({ stock_quantity: v.stock_quantity + item.quantity })
              .eq('id', item.variant_id)
          }
        } else {
          const { data: p } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single()
          if (p) {
            await supabase
              .from('products')
              .update({ stock_quantity: p.stock_quantity + item.quantity })
              .eq('id', item.product_id)
              .eq('org_id', orgId)
          }
        }
      }

      // 4. Marcar venda como estornada
      const { error: voidUpdateError } = await supabase
        .from('sales')
        .update({
          status:      'voided',
          voided_at:   new Date().toISOString(),
          voided_by:   user.id,
          void_reason: voidReason.trim() || null,
        })
        .eq('id', voidTarget.id)
        .eq('org_id', orgId)
      if (voidUpdateError) throw voidUpdateError

      // 5. Fechar modal e recarregar
      setVoidTarget(null)
      setVoidPassword('')
      setVoidReason('')
      load()
    } catch (err) {
      setVoidError('Erro ao estornar: ' + err.message)
    } finally {
      setVoidLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-black text-gray-900">Histórico de vendas</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {loading ? '...' : `${sales.length} venda${sales.length !== 1 ? 's' : ''} no período`}
        </p>
      </div>

      {/* Period filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-3">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Register selector — só com 2+ caixas */}
      {registers.length >= 2 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedReg('all')}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedReg === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos os caixas
          </button>
          {registers.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedReg(r.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedReg === r.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary strip */}
      {!loading && sales.length > 0 && (
        <div className="mb-4 bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Total do período</p>
            <p className="text-2xl font-black text-gray-900">{brl(totalPeriod)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Transações</p>
            <p className="text-2xl font-black text-gray-900">{sales.length}</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-[62px] bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : timelineItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <ShoppingCart size={36} className="text-gray-300" />
          <p className="text-sm font-semibold text-gray-400">Nenhuma venda neste período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timelineItems.map(item => {
            /* ── movement row ── */
            if (item._kind === 'mov') {
              const isSangria = item.type === 'sangria'
              const regInfo   = regColorMap[item.register_id]
              return (
                <div
                  key={`mov-${item.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isSangria ? 'bg-red-50' : 'bg-emerald-50'
                  }`}>
                    {isSangria
                      ? <ArrowDownCircle size={16} className="text-red-500" />
                      : <ArrowUpCircle   size={16} className="text-emerald-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm font-black ${isSangria ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isSangria ? '−' : '+'}{brl(item.amount)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${
                        isSangria
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isSangria ? 'Sangria' : 'Reforço'}
                      </span>
                      {registers.length >= 2 && selectedReg === 'all' && regInfo && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg shrink-0 ${regInfo.cls}`}>
                          {regInfo.name}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {item.reason || (isSangria ? 'Sangria de caixa' : 'Reforço de caixa')}
                      {' · '}{fmtDate(item.created_at)} {fmtTime(item.created_at)}
                    </p>
                  </div>
                </div>
              )
            }

            /* ── sale row ── */
            const sale      = item
            const isOpen    = expanded === sale.id
            const saleItems = itemsMap[sale.id] || []
            const isLoading = loadingItem === sale.id
            const methodCls = METHOD_COLOR[sale.payment_method] || 'bg-gray-100 text-gray-500'
            const regInfo   = regColorMap[sale.register_id]

            return (
              <div
                key={`sale-${sale.id}`}
                className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
                  sale.status === 'voided' ? 'opacity-50' : ''
                }`}
              >
                {/* Row */}
                <button
                  onClick={() => toggle(sale.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-500 shrink-0">
                    {sale._num}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-black text-gray-900">{brl(sale.total_amount)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${methodCls}`}>
                        {METHOD_LABEL[sale.payment_method] || sale.payment_method}
                      </span>
                      {sale.status === 'voided' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-100 text-red-600">
                          Estornada
                        </span>
                      )}
                      {/* Badge do caixa — só em modo "Todos os caixas" com 2+ caixas */}
                      {registers.length >= 2 && selectedReg === 'all' && regInfo && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg shrink-0 ${regInfo.cls}`}>
                          {regInfo.name}
                        </span>
                      )}
                    </div>
                    {sale.payment_method === 'misto' && (sale.sale_payments || []).length > 0 && (
                      <div className="mt-1.5 pl-2 border-l-2 border-gray-200 flex flex-col gap-0.5">
                        {sale.sale_payments.map((p, i) => (
                          <div key={i} className="flex justify-between text-[11px] text-gray-500">
                            <span>{METHOD_LABEL[p.payment_method] || p.payment_method}</span>
                            <span className="font-semibold">{brl(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {sale.profiles?.full_name || 'Vendedor'} · {fmtDate(sale.created_at)} {fmtTime(sale.created_at)}
                    </p>
                  </div>

                  {sale.status !== 'voided' && canVoid && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setAddItemsTarget(sale)
                        setAddItemsCart([])
                        setAddItemsSearch('')
                        setAddItemsPayment('pix')
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                        text-xs font-bold bg-amber-50 text-amber-700 border
                        border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <Plus size={13} />
                      Adicionar itens esquecidos
                    </button>
                  )}

                  {sale.status !== 'voided' && canVoid && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setVoidTarget(sale)
                        setVoidPassword('')
                        setVoidReason('')
                        setVoidError('')
                      }}
                      title="Estornar venda"
                      className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <RotateCcw size={13} className="text-red-500" />
                    </button>
                  )}

                  {isOpen
                    ? <ChevronDown  size={15} className="text-gray-400 shrink-0" />
                    : <ChevronRight size={15} className="text-gray-400 shrink-0" />
                  }
                </button>

                {/* Expanded items */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3">
                    {isLoading ? (
                      <div className="space-y-1.5">
                        {[1, 2].map(i => <div key={i} className="h-5 bg-gray-200 rounded-lg animate-pulse" />)}
                      </div>
                    ) : saleItems.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem itens registrados.</p>
                    ) : (
                      <div className="space-y-2">
                        {saleItems.map((si, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 truncate flex-1 mr-4">
                              {saleItemName(si)}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-gray-400">
                                {si.quantity}× {brl(si.unit_price)}
                              </span>
                              <span className="font-bold text-gray-900 w-20 text-right">
                                {brl(si.subtotal)}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-500">Total</span>
                          <span className="text-sm font-black text-gray-900">{brl(sale.total_amount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {addItemsTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end
          sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl
            max-h-[90vh] overflow-y-auto space-y-4 p-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-gray-900">
                  Adicionar itens esquecidos
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Total atual: {brl(addItemsTarget.total_amount)}
                </p>
              </div>
              <button
                onClick={() => setAddItemsTarget(null)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Busca */}
            <input
              type="text"
              placeholder="Buscar produto..."
              value={addItemsSearch}
              onChange={e => setAddItemsSearch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200
                text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />

            {/* Lista de produtos filtrados */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {products
                .filter(p => p.name.toLowerCase()
                  .includes(addItemsSearch.toLowerCase()) && p.stock_quantity > 0)
                .slice(0, 10)
                .map(p => {
                  const inCart = addItemsCart.find(i => i.product.id === p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between
                      bg-gray-50 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400">
                          {brl(p.price)} · {p.stock_quantity} un.
                        </p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAddItemsCart(prev =>
                              prev.map(i => i.product.id === p.id
                                ? { ...i, qty: Math.max(1, i.qty - 1) }
                                : i))}
                            className="w-6 h-6 rounded-lg bg-white border flex
                              items-center justify-center text-gray-600 font-bold"
                          >−</button>
                          <span className="text-sm font-black w-4 text-center">
                            {inCart.qty}
                          </span>
                          <button
                            onClick={() => setAddItemsCart(prev =>
                              prev.map(i => i.product.id === p.id
                                ? { ...i, qty: Math.min(p.stock_quantity, i.qty + 1) }
                                : i))}
                            className="w-6 h-6 rounded-lg bg-white border flex
                              items-center justify-center text-gray-600 font-bold"
                          >+</button>
                          <button
                            onClick={() => setAddItemsCart(prev =>
                              prev.filter(i => i.product.id !== p.id))}
                            className="w-6 h-6 rounded-lg bg-red-50 flex items-center
                              justify-center"
                          >
                            <X size={11} className="text-red-400" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddItemsCart(prev =>
                            [...prev, { product: p, qty: 1 }])}
                          className="w-7 h-7 rounded-xl flex items-center
                            justify-center text-white"
                          style={{ backgroundColor: '#0891b2' }}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>

            {/* Diferença */}
            {addItemsCart.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl
                px-4 py-3 flex justify-between items-center">
                <span className="text-sm font-bold text-amber-700">
                  Diferença a cobrar
                </span>
                <span className="text-base font-black text-amber-700">
                  {brl(diferenca)}
                </span>
              </div>
            )}

            {/* Forma de pagamento da diferença */}
            {addItemsCart.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase
                  tracking-wide mb-2">Forma de pagamento da diferença</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'dinheiro', label: 'Dinheiro' },
                    { key: 'pix',     label: 'PIX' },
                    { key: 'debito',  label: 'Débito' },
                    { key: 'credito', label: 'Crédito' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setAddItemsPayment(key)}
                      className="py-2 rounded-xl text-xs font-bold border transition-all"
                      style={addItemsPayment === key
                        ? { backgroundColor: '#0891b2', color: 'white', borderColor: '#0891b2' }
                        : { backgroundColor: 'white', color: '#6b7280', borderColor: '#e5e7eb' }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={() => setAddItemsTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100
                  text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAddItems}
                disabled={!addItemsCart.length || addItemsLoading}
                className="flex-1 py-3 rounded-2xl text-white font-bold
                  text-sm disabled:opacity-40"
                style={{ backgroundColor: '#0891b2' }}
              >
                {addItemsLoading
                  ? 'Salvando...'
                  : `Confirmar — ${brl(diferenca)}`}
              </button>
            </div>

          </div>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center
          justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 w-full
            max-w-sm shadow-xl space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                Estornar venda
              </h3>
              <button onClick={() => setVoidTarget(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Aviso */}
            <div className="bg-red-50 border border-red-200
              rounded-xl p-3">
              <p className="text-sm text-red-700 font-semibold">
                Venda #{voidTarget.id.slice(-6).toUpperCase()}
                {' '}— {brl(voidTarget.total_amount)}
              </p>
              <p className="text-xs text-red-500 mt-1">
                O estoque será devolvido e a venda ficará
                marcada como estornada.
              </p>
            </div>

            {/* Motivo (opcional) */}
            <div>
              <label className="text-[11px] font-bold text-gray-400
                uppercase tracking-wide block mb-1.5">
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="Ex: produto danificado, erro de cobrança..."
                className="w-full px-3 py-2.5 rounded-xl border
                  border-gray-200 text-sm outline-none
                  focus:ring-2 focus:ring-red-400"
              />
            </div>

            {/* Senha */}
            <div>
              <label className="text-[11px] font-bold text-gray-400
                uppercase tracking-wide block mb-1.5">
                Confirme sua senha
              </label>
              <input
                type="password"
                value={voidPassword}
                onChange={e => setVoidPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmVoid()}
                placeholder="Digite sua senha..."
                className="w-full px-3 py-2.5 rounded-xl border
                  border-gray-200 text-sm outline-none
                  focus:ring-2 focus:ring-red-400"
                autoFocus
              />
            </div>

            {/* Erro */}
            {voidError && (
              <p className="text-xs text-red-500">{voidError}</p>
            )}

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={() => setVoidTarget(null)}
                className="flex-1 py-2.5 rounded-xl border
                  border-gray-200 text-sm font-bold text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={confirmVoid}
                disabled={voidLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-500
                  text-white text-sm font-bold disabled:opacity-50"
              >
                {voidLoading ? 'Estornando...' : 'Confirmar estorno'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
