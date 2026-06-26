import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle,
  X,
  Package,
  Banknote,
  QrCode,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Monitor,
  ChevronRight,
  Barcode,
  Receipt,
  History,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { usePermissions } from '../../../../core/hooks/usePermissions'

/* ─── helpers ─────────────────────────────────────────────── */

function brl(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const METHODS = [
  { key: 'dinheiro', label: 'Dinheiro', Icon: Banknote },
  { key: 'pix',      label: 'PIX',      Icon: QrCode },
  { key: 'cartao',   label: 'Cartão',   Icon: CreditCard },
]

function getSessionKey(orgId) {
  return `autolavy_active_register_${orgId}`
}

/* cart item helpers — pure functions, safe outside component */

function itemPrice(item) {
  if (item.variant?.price_override != null) return Number(item.variant.price_override)
  return Number(item.product.price)
}

function itemDisplayName(item) {
  if (!item.variant) return item.product.name
  const { cor, tamanho, numero } = item.variant.attributes || {}
  const size = tamanho ?? numero ?? ''
  return [item.product.name, [cor, size].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
}

function itemMaxQty(item) {
  return item.variant ? item.variant.stock_quantity : item.product.stock_quantity
}

/* ─── VariantSelectModal ──────────────────────────────────── */

function VariantSelectModal({ product, variants, onSelect, onClose }) {
  const sizeKey    = variants.some(v => 'tamanho' in (v.attributes || {})) ? 'tamanho' : 'numero'
  const colors     = [...new Set(variants.map(v => v.attributes?.cor).filter(Boolean))]
  const sizes      = [...new Set(variants.map(v => v.attributes?.[sizeKey]).filter(Boolean))]
  const hasGrid    = colors.length > 0 && sizes.length > 0

  function getVariant(cor, size) {
    return variants.find(v => v.attributes?.cor === cor && v.attributes?.[sizeKey] === size)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div
        className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-gray-900">{product.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Selecione uma variação</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {hasGrid ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-3 w-0" />
                  {sizes.map(s => (
                    <th key={s} className="text-center text-[10px] font-bold text-gray-500 uppercase pb-2 px-1.5 min-w-[52px]">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map(cor => (
                  <tr key={cor}>
                    <td className="text-xs font-bold text-gray-700 pr-3 py-1 whitespace-nowrap">{cor}</td>
                    {sizes.map(size => {
                      const v  = getVariant(cor, size)
                      const ok = v && v.stock_quantity > 0
                      return (
                        <td key={size} className="px-1 py-1 text-center">
                          {v ? (
                            <button
                              onClick={() => ok && onSelect(v)}
                              disabled={!ok}
                              className={`w-full rounded-xl px-2 py-2.5 text-xs font-black transition-all ${
                                ok
                                  ? 'text-gray-800 border border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-95'
                                  : 'text-gray-300 border border-gray-100 bg-gray-50 cursor-not-allowed'
                              }`}
                            >
                              {v.stock_quantity}
                            </button>
                          ) : (
                            <span className="block text-[10px] text-gray-200 text-center">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {variants.map(v => {
              const ok    = v.stock_quantity > 0
              const label = Object.values(v.attributes || {}).filter(Boolean).join(' · ') || 'Variação'
              return (
                <button
                  key={v.id}
                  onClick={() => ok && onSelect(v)}
                  disabled={!ok}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-bold transition-all ${
                    ok
                      ? 'border-gray-200 bg-white hover:bg-gray-50 text-gray-800 active:scale-[0.98]'
                      : 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-xs font-semibold ${ok ? 'text-gray-400' : 'text-gray-200'}`}>
                    {ok ? `${v.stock_quantity} un.` : 'Esgotado'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[10px] text-center text-gray-400 mt-4">Número = unidades em estoque</p>
      </div>
    </div>
  )
}

/* ─── component ───────────────────────────────────────────── */

export default function Caixa() {
  const { tenant, profile } = useTenantContext()
  const { can, role } = usePermissions()
  const canSangria = can('can_do_sangria')
  const canReforco = ['admin', 'gerente', 'superadmin'].includes(role)
  const navigate = useNavigate()

  const orgId   = tenant?.id
  const color   = '#0891b2'
  const segment = tenant?.segment || 'geral'

  /* register selection */
  const [registers, setRegisters]               = useState([])
  const [activeRegister, setActiveRegister]     = useState(null)
  const [registersLoading, setRegistersLoading] = useState(true)

  /* cash movement modal (sangria / reforço) */
  const [movType, setMovType]             = useState(null)  // null | 'sangria' | 'reforco'
  const [movVal, setMovVal]               = useState('')
  const [movReason, setMovReason]         = useState('')
  const [movSubmitting, setMovSubmitting] = useState(false)

  /* PDV */
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [cart, setCart]             = useState([])
  const [payment, setPayment]       = useState('dinheiro')
  const [cartOpen, setCartOpen]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(null)

  /* segment-specific state */
  const [variantsByProduct, setVariantsByProduct] = useState({})  // product_id → variant[]
  const [variantModal, setVariantModal]           = useState(null) // null | { product, variants }
  const [productAttrs, setProductAttrs]           = useState({})  // product_id → { serial_number }
  const [catSegmentMap, setCatSegmentMap]         = useState({})  // category_id → segment_id

  const cartItems = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cart.reduce((s, i) => s + itemPrice(i) * i.qty, 0)
  const getProductSegment = p => catSegmentMap[p?.category_id] || segment || 'geral'

  const searchRef = useRef(null)

  /* load registers */
  useEffect(() => {
    if (!orgId) return

    async function initRegisters() {
      setRegistersLoading(true)

      const { data, error } = await supabase.rpc('get_my_registers')

      const allRegs = error ? [] : (data || [])
      const regs = allRegs.filter(r => r.is_active)

      setRegisters(regs)

      /* restore from sessionStorage */
      const saved = sessionStorage.getItem(getSessionKey(orgId))
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          const found = regs.find(r => r.id === parsed.id)
          if (found) { setActiveRegister(found); setRegistersLoading(false); return }
        } catch {}
      }

      /* auto-select when only 1 active register */
      if (regs.length <= 1 && regs.length > 0) {
        setActiveRegister(regs[0])
        sessionStorage.setItem(getSessionKey(orgId), JSON.stringify(regs[0]))
      }

      setRegistersLoading(false)
    }

    initRegisters()
  }, [orgId])

  /* load products + categories (variants/attrs resolved per-category segment) */
  useEffect(() => {
    if (!orgId || !activeRegister) return
    async function load() {
      setLoading(true)
      const [{ data, error }, { data: catData }] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, cost_price, stock_quantity, min_stock_alert, sku, category_id')
          .eq('org_id', orgId)
          .order('name'),
        supabase
          .from('categories')
          .select('id, segment_id')
          .eq('org_id', orgId),
      ])

      const loaded = error ? [] : (data || [])
      setProducts(loaded)

      const localCatSegMap = {}
      for (const c of (catData || [])) {
        if (c.segment_id) localCatSegMap[c.id] = c.segment_id
      }
      setCatSegmentMap(localCatSegMap)

      const getSeg = p => localCatSegMap[p.category_id] || segment || 'geral'

      if (loaded.length > 0) {
        const modaIds = loaded.filter(p => getSeg(p) === 'moda').map(p => p.id)
        if (modaIds.length > 0) {
          const { data: vData } = await supabase
            .from('product_variants')
            .select('id, product_id, attributes, stock_quantity, price_override')
            .eq('org_id', orgId)
            .in('product_id', modaIds)
            .eq('is_active', true)
          const byProduct = (vData || []).reduce((acc, v) => {
            if (!acc[v.product_id]) acc[v.product_id] = []
            acc[v.product_id].push(v)
            return acc
          }, {})
          setVariantsByProduct(byProduct)
        }

        const eletroIds = loaded.filter(p => getSeg(p) === 'eletronicos').map(p => p.id)
        if (eletroIds.length > 0) {
          const { data: aData } = await supabase
            .from('product_attributes')
            .select('product_id, serial_number')
            .eq('org_id', orgId)
            .in('product_id', eletroIds)
          const byProduct = (aData || []).reduce((acc, a) => {
            if (a.serial_number) acc[a.product_id] = a
            return acc
          }, {})
          setProductAttrs(byProduct)
        }
      }

      setLoading(false)
    }
    load()
  }, [orgId, activeRegister, segment])

  function selectRegister(reg) {
    setActiveRegister(reg)
    sessionStorage.setItem(getSessionKey(orgId), JSON.stringify(reg))
    setCart([])
    setSearch('')
  }

  function changeRegister() {
    setActiveRegister(null)
    sessionStorage.removeItem(getSessionKey(orgId))
    setCart([])
    setSearch('')
    setDone(null)
  }

  function openMov(type) {
    setMovType(type)
    setMovVal('')
    setMovReason('')
  }

  async function confirmMov() {
    const amount = Number(movVal)
    if (!amount || amount <= 0) return
    setMovSubmitting(true)
    const { error } = await supabase.from('cash_movements').insert({
      org_id:      orgId,
      register_id: activeRegister?.id ?? null,
      session_id:  null,
      type:        movType,
      amount,
      reason:      movReason.trim() || null,
      created_by:  profile?.id ?? null,
    })
    setMovSubmitting(false)
    if (error) { alert('Erro ao registrar: ' + error.message); return }
    setMovType(null)
  }

  /* cart actions */
  const addItem = useCallback((product, variant = null) => {
    const key    = variant ? variant.id : product.id
    const maxQty = variant ? variant.stock_quantity : product.stock_quantity
    setCart(prev => {
      const found = prev.find(i => i.cartKey === key)
      if (found) {
        if (found.qty >= maxQty) return prev
        return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { product, qty: 1, variant, cartKey: key }]
    })
  }, [])

  const changeQty = useCallback((cartKey, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.cartKey !== cartKey))
      return
    }
    setCart(prev =>
      prev.map(i =>
        i.cartKey === cartKey
          ? { ...i, qty: Math.min(qty, itemMaxQty(i)) }
          : i
      )
    )
  }, [])

  /* finalize sale */
  async function finalize() {
    if (!cart.length || submitting) return
    setSubmitting(true)
    try {
      const { data: sale, error: e1 } = await supabase
        .from('sales')
        .insert({
          org_id:         orgId,
          user_id:        profile?.id ?? null,
          register_id:    activeRegister?.id ?? null,
          total_amount:   cartTotal,
          payment_method: payment,
        })
        .select('id')
        .single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('sale_items').insert(
        cart.map(i => ({
          org_id:     orgId,
          sale_id:    sale.id,
          product_id: i.product.id,
          variant_id: i.variant?.id ?? null,
          quantity:   i.qty,
          unit_price: itemPrice(i),
          unit_cost:  Number(i.product.cost_price ?? 0),
          subtotal:   itemPrice(i) * i.qty,
        }))
      )
      if (e2) throw e2

      /* stock deduction: variants → product_variants; regular → products */
      const variantItems = cart.filter(i => i.variant)
      const regularItems = cart.filter(i => !i.variant)

      await Promise.all([
        ...regularItems.map(i =>
          supabase
            .from('products')
            .update({ stock_quantity: i.product.stock_quantity - i.qty })
            .eq('id', i.product.id)
            .eq('org_id', orgId)
        ),
        ...variantItems.map(i =>
          supabase
            .from('product_variants')
            .update({ stock_quantity: i.variant.stock_quantity - i.qty })
            .eq('id', i.variant.id)
            .eq('org_id', orgId)
        ),
      ])

      /* update local state */
      setProducts(prev =>
        prev.map(p => {
          const sold = regularItems.find(i => i.product.id === p.id)
          return sold ? { ...p, stock_quantity: p.stock_quantity - sold.qty } : p
        })
      )
      if (variantItems.length > 0) {
        setVariantsByProduct(prev => {
          const next = { ...prev }
          for (const item of variantItems) {
            if (next[item.product.id]) {
              next[item.product.id] = next[item.product.id].map(v =>
                v.id === item.variant.id ? { ...v, stock_quantity: v.stock_quantity - item.qty } : v
              )
            }
          }
          return next
        })
      }

      setDone({ total: cartTotal, payment })
      setCart([])
      setCartOpen(false)
    } catch (err) {
      alert('Erro ao registrar venda: ' + (err.message || 'Tente novamente.'))
    } finally {
      setSubmitting(false)
    }
  }

  /* ── loading registers ─────────────────────────────────────── */
  if (registersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-sm text-gray-400">Carregando caixas...</p>
      </div>
    )
  }

  /* ── register selection screen ───────────────────────────── */
  if (!activeRegister) {
    return (
      <div className="bg-gray-50 min-h-screen p-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-900">Ponto de Venda</h1>
            <p className="text-xs text-gray-400">Selecione um caixa para continuar</p>
          </div>
        </div>

        {registers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Monitor size={40} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-400">Nenhum caixa ativo</p>
            <p className="text-xs text-gray-400">Peça ao administrador para ativar um caixa nas configurações.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {registers.map(reg => (
              <button
                key={reg.id}
                onClick={() => selectRegister(reg)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 text-left hover:border-gray-300 hover:shadow-md transition-all group active:scale-[0.98]"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color + '20' }}
                >
                  <Monitor size={22} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 text-base truncate">{reg.name}</p>
                  {reg.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{reg.description}</p>
                  )}
                  {reg.product_filter?.category_ids?.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {reg.product_filter.category_ids.length} categoria{reg.product_filter.category_ids.length !== 1 ? 's' : ''} configurada{reg.product_filter.category_ids.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ── success screen ───────────────────────────────────────── */
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 p-6 text-center">
        <CheckCircle size={56} style={{ color }} />
        <div>
          <h2 className="text-2xl font-black text-gray-900">Venda registrada!</h2>
          <p className="text-gray-500 text-sm mt-1">
            {brl(done.total)} · {METHODS.find(m => m.key === done.payment)?.label}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => setDone(null)}
            className="w-full py-3 rounded-2xl text-white font-bold shadow-md"
            style={{ backgroundColor: color }}
          >
            Nova venda
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold"
          >
            Ir para Dashboard
          </button>
        </div>
      </div>
    )
  }

  /* ── product filter by register ──────────────────────────── */
  const allowedCategoryIds = activeRegister?.product_filter?.category_ids || null

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = (
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    )
    const matchCategory = !allowedCategoryIds || allowedCategoryIds.includes(p.category_id)
    return matchSearch && matchCategory
  })

  const bottomPad = cart.length > 0 ? 'pb-[360px]' : 'pb-6'

  /* ── modal helpers ─────────────────────────────────────────── */
  const isSangria = movType === 'sangria'
  const movTitle  = isSangria ? 'Sangria' : 'Reforço de Caixa'
  const movDesc   = isSangria
    ? 'Informe o valor retirado do caixa.'
    : 'Informe o valor adicionado ao caixa.'

  return (
    <div className="bg-gray-50 min-h-screen">

      {/* ── header ── */}
      <div className="sticky top-0 z-10 bg-gray-50 px-4 pt-4 pb-2 flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black text-gray-900 leading-tight">Ponto de Venda</h1>
          {registers.length > 1 && (
            <button
              onClick={changeRegister}
              className="flex items-center gap-1 text-[11px] font-bold mt-0.5 hover:opacity-70 transition-opacity"
              style={{ color }}
            >
              <Monitor size={11} />
              {activeRegister.name}
              <span className="text-gray-400 font-normal ml-0.5">· trocar</span>
            </button>
          )}
        </div>

        {/* Sangria — operador, gerente, admin */}
        {/* Reforço  — gerente e admin apenas   */}
        {(canSangria || canReforco) && (
          <div className="flex gap-1.5 shrink-0">
            {canSangria && (
              <button
                onClick={() => openMov('sangria')}
                title="Sangria"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition-colors"
              >
                <ArrowDownCircle size={13} />
                Sangria
              </button>
            )}
            {canReforco && (
              <button
                onClick={() => openMov('reforco')}
                title="Reforço de Caixa"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
              >
                <ArrowUpCircle size={13} />
                Reforço
              </button>
            )}
          </div>
        )}

        {cartItems > 0 && (
          <button
            onClick={() => setCartOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: color }}
          >
            <ShoppingCart size={13} />
            {cartItems} {cartItems === 1 ? 'item' : 'itens'}
          </button>
        )}
      </div>

      {/* ── Mobile quick actions ── */}
      <div className="md:hidden px-4 pb-3 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => { setCart([]); setDone(null); setSearch(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3"
          style={{ backgroundColor: '#0891b2' }}
        >
          <ShoppingCart size={22} className="text-white" />
          <span className="text-[10px] font-bold text-white">Nova venda</span>
        </button>

        <button
          onClick={() => searchRef.current?.focus()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <Barcode size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Buscar por código</span>
        </button>

        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <Receipt size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Últimas vendas</span>
        </button>

        <button
          onClick={() => navigate('/historico')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <History size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Histórico</span>
        </button>
      </div>

      {/* ── search ── */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 shadow-sm">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto ou código..."
            className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── product grid ── */}
      <div className={`px-4 ${bottomPad}`}>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <Package size={36} className="text-gray-300" />
            <p className="text-sm font-semibold text-gray-400">
              {search ? 'Produto não encontrado' : 'Nenhum produto para este caixa'}
            </p>
            {!search && (
              <button
                onClick={() => navigate('/produtos')}
                className="mt-2 text-xs font-bold underline"
                style={{ color }}
              >
                Cadastrar produtos
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(product => {
              const hasVariants = getProductSegment(product) === 'moda' && (variantsByProduct[product.id]?.length > 0)

              /* stock check — variants use their own totals */
              const noStock = hasVariants
                ? !(variantsByProduct[product.id] || []).some(v => v.stock_quantity > 0)
                : product.stock_quantity <= 0
              const lowStock = !hasVariants && !noStock && product.stock_quantity <= product.min_stock_alert

              /* cart state */
              const inCart        = !hasVariants ? cart.find(i => i.cartKey === product.id) : null
              const variantInCart = hasVariants
                ? cart.filter(i => i.product.id === product.id).reduce((s, i) => s + i.qty, 0)
                : 0

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex flex-col gap-2 ${noStock ? 'opacity-40' : ''}`}
                >
                  <div className="flex-1 min-h-0">
                    <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                      {product.name}
                    </p>
                    {product.sku && (
                      <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{product.sku}</p>
                    )}
                    <p className="text-[15px] font-black mt-1.5" style={{ color }}>
                      {brl(product.price)}
                    </p>
                    {!hasVariants && (
                      <p className={`text-[10px] font-semibold mt-0.5 ${
                        noStock ? 'text-red-500' : lowStock ? 'text-orange-400' : 'text-gray-400'
                      }`}>
                        {noStock
                          ? 'Sem estoque'
                          : `${product.stock_quantity} un.${lowStock ? ' ⚠' : ''}`}
                      </p>
                    )}
                    {hasVariants && (
                      <p className="text-[10px] font-semibold mt-0.5 text-gray-400">
                        {(variantsByProduct[product.id] || []).reduce((s, v) => s + v.stock_quantity, 0)} un. (grade)
                      </p>
                    )}
                  </div>

                  {/* Non-variant: +/- controls or Add button */}
                  {!hasVariants && (inCart ? (
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl px-1 py-0.5">
                      <button
                        onClick={() => changeQty(product.id, inCart.qty - 1)}
                        className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center active:scale-90 transition-transform"
                      >
                        {inCart.qty === 1 ? (
                          <Trash2 size={13} className="text-red-400" />
                        ) : (
                          <Minus size={13} className="text-gray-600" />
                        )}
                      </button>
                      <span className="text-sm font-black text-gray-900">{inCart.qty}</span>
                      <button
                        onClick={() => changeQty(product.id, inCart.qty + 1)}
                        disabled={inCart.qty >= product.stock_quantity}
                        className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      >
                        <Plus size={13} className="text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => !noStock && addItem(product)}
                      disabled={noStock}
                      className="flex items-center justify-center gap-1 py-2 rounded-xl text-white text-xs font-bold disabled:cursor-not-allowed active:scale-95 transition-transform"
                      style={{ backgroundColor: noStock ? '#d1d5db' : color }}
                    >
                      <Plus size={13} />
                      Adicionar
                    </button>
                  ))}

                  {/* Variant: Selecionar button */}
                  {hasVariants && (
                    <button
                      onClick={() => !noStock && setVariantModal({ product, variants: variantsByProduct[product.id] })}
                      disabled={noStock}
                      className="flex items-center justify-center gap-1 py-2 rounded-xl text-white text-xs font-bold disabled:cursor-not-allowed active:scale-95 transition-transform"
                      style={{ backgroundColor: noStock ? '#d1d5db' : color }}
                    >
                      <Plus size={13} />
                      {variantInCart > 0 ? `${variantInCart} no carrinho` : 'Selecionar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sangria / Reforço modal ─────────────────────────── */}
      {movType && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">

            {/* Title */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isSangria
                  ? <ArrowDownCircle size={20} className="text-amber-500" />
                  : <ArrowUpCircle   size={20} className="text-emerald-500" />
                }
                <h2 className="text-lg font-black text-gray-900">{movTitle}</h2>
              </div>
              <button
                onClick={() => setMovType(null)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <p className="text-xs text-gray-500">{movDesc}</p>

            {/* Valor */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Valor *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={movVal}
                onChange={e => setMovVal(e.target.value)}
                placeholder="0,00"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-center text-2xl font-black outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': isSangria ? '#f59e0b' : '#10b981' }}
                autoFocus
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Motivo <span className="font-normal normal-case text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={movReason}
                onChange={e => setMovReason(e.target.value)}
                placeholder={isSangria ? 'Ex: pagamento de fornecedor' : 'Ex: reposição inicial'}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                onKeyDown={e => { if (e.key === 'Enter') confirmMov() }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMovType(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMov}
                disabled={!movVal || Number(movVal) <= 0 || movSubmitting}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: isSangria ? '#f59e0b' : '#10b981' }}
              >
                {movSubmitting ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── cart panel (fixed above bottom nav) ─────────────── */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 md:bottom-0 left-0 md:left-60 right-0 z-20 bg-white border-t border-gray-200 shadow-2xl">

          <button
            onClick={() => setCartOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold text-gray-700"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={15} style={{ color }} />
              Carrinho · {cartItems} {cartItems === 1 ? 'item' : 'itens'}
            </span>
            <span className="text-xs text-gray-400">{cartOpen ? '▼ fechar' : '▲ ver itens'}</span>
          </button>

          {cartOpen && (
            <div className="max-h-36 overflow-y-auto px-4 pb-2 space-y-2 border-t border-gray-100">
              {cart.map(item => (
                <div key={item.cartKey} className="flex items-center gap-2 pt-2">
                  <span className="flex-1 text-sm text-gray-800 truncate">{itemDisplayName(item)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => changeQty(item.cartKey, item.qty - 1)}
                      className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"
                    >
                      {item.qty === 1 ? <Trash2 size={11} className="text-red-400" /> : <Minus size={11} className="text-gray-500" />}
                    </button>
                    <span className="w-5 text-center text-xs font-black">{item.qty}</span>
                    <button
                      onClick={() => changeQty(item.cartKey, item.qty + 1)}
                      disabled={item.qty >= itemMaxQty(item)}
                      className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center disabled:opacity-30"
                    >
                      <Plus size={11} className="text-gray-500" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-bold text-gray-900 shrink-0">
                    {brl(itemPrice(item) * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Eletronicos: confirmar números de série */}
          {cart.some(i => getProductSegment(i.product) === 'eletronicos' && productAttrs[i.product.id]?.serial_number) && (
            <div className="px-4 py-2 border-t border-gray-100 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Números de série</p>
              {cart.filter(i => getProductSegment(i.product) === 'eletronicos' && productAttrs[i.product.id]?.serial_number).map(i => (
                <div key={i.cartKey} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 truncate flex-1">{i.product.name}</span>
                  <span className="text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 shrink-0">
                    {productAttrs[i.product.id].serial_number}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 pt-2 pb-1 flex gap-2">
            {METHODS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setPayment(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  payment === key
                    ? 'text-white border-transparent'
                    : 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
                style={payment === key ? { backgroundColor: color } : {}}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          <div className="px-4 pb-3 pt-1 flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total</p>
              <p className="text-xl font-black text-gray-900 leading-none">{brl(cartTotal)}</p>
            </div>
            <button
              onClick={finalize}
              disabled={submitting}
              className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm shadow-lg disabled:opacity-60 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: color }}
            >
              {submitting ? 'Registrando...' : `Finalizar · ${brl(cartTotal)}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Variant selection modal ─────────────────────────── */}
      {variantModal && (
        <VariantSelectModal
          product={variantModal.product}
          variants={variantModal.variants}
          onSelect={variant => { addItem(variantModal.product, variant); setVariantModal(null) }}
          onClose={() => setVariantModal(null)}
        />
      )}
    </div>
  )
}
