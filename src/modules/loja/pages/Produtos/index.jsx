import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Package, AlertTriangle, FlaskConical, Lock, Tag, LayoutGrid, List } from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { usePermissions } from '../../../../core/hooks/usePermissions'
import { useMultiPDV } from '../../../../core/hooks/useMultiPDV'

/* ── helpers ─────────────────────────────────────────────── */

function brl(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const EMPTY = {
  name: '', price: '', cost_price: '', stock_quantity: '', min_stock_alert: '5', sku: '', category_id: '',
}

const DEMOS = [
  { name: 'Produto A', price: 25.90, cost_price: 0, stock_quantity: 42, min_stock_alert: 5 },
  { name: 'Produto B', price: 14.50, cost_price: 0, stock_quantity: 18, min_stock_alert: 5 },
  { name: 'Produto C', price:  8.00, cost_price: 0, stock_quantity:  5, min_stock_alert: 5 },
  { name: 'Produto D', price: 47.00, cost_price: 0, stock_quantity:  2, min_stock_alert: 5 },
]

const fieldCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 bg-white'
const fieldClsXs = 'w-full px-2 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:ring-2 bg-white'

const WARRANTY_MONTHS = [3, 6, 12, 24, 36]

const SEGMENT_COPY = {
  geral:       { title: 'Produto simples',                    desc: 'Preço e estoque únicos (a maioria dos produtos)' },
  moda:        { title: 'Roupa, calçado ou cama/mesa/banho',  desc: 'Tem variação de cor e tamanho' },
  eletronicos: { title: 'Eletrônico',                         desc: 'Tem número de série e garantia' },
  kit:         { title: 'Kit / Pacote',                       desc: 'Produto vendido em tamanhos e pacotes (ex: sacolas, atacado)' },
}

function todayISO() { return new Date().toISOString().split('T')[0] }

function calcWarrantyUntil(from, months) {
  if (!from || !months) return ''
  const d = new Date(from)
  d.setMonth(d.getMonth() + Number(months))
  return d.toISOString().split('T')[0]
}

/* ── cadastro rápido (múltiplos produtos) ───────────────────────────── */

function QuickAddModal({
  orgId, segment, categories, catSegmentMap,
  gradeConfig, onClose, onSaved, color
}) {
  const TABS = [
    { key: 'simples', label: 'Produto simples' },
    { key: 'kit', label: 'Kit / Variações' },
  ]
  const [tab, setTab] = useState('simples')
  const [saving, setSaving] = useState(false)

  /* ── ABA SIMPLES ── */
  const [lines, setLines] = useState([
    { _key: 1, name: '', price: '', cost: '', stock: '', min_stock: '' },
    { _key: 2, name: '', price: '', cost: '', stock: '', min_stock: '' },
  ])
  const [simpleCatId, setSimpleCatId] = useState('')

  function addLine() {
    setLines(prev => [...prev, {
      _key: Date.now(), name: '', price: '',
      cost: '', stock: '', min_stock: ''
    }])
  }

  function updateLine(key, field, value) {
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l))
  }

  function removeLine(key) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter(l => l._key !== key))
  }

  const validLines = lines.filter(l => l.name.trim() && l.price)

  async function saveSimples() {
    if (!validLines.length) return
    setSaving(true)
    try {
      const rows = validLines.map(l => ({
        org_id:         orgId,
        name:           l.name.trim(),
        price:          parseFloat(l.price),
        cost_price:     l.cost ? parseFloat(l.cost) : null,
        stock_quantity: parseInt(l.stock || '0'),
        min_stock_alert: l.min_stock ? parseInt(l.min_stock) : 5,
        category_id:    simpleCatId || null,
        is_active:      true,
        sku:            null,
      }))
      const { error } = await supabase.from('products').insert(rows)
      if (error) throw error
      onSaved()
      onClose()
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── ABA KIT ── */
  const [kitName, setKitName]     = useState('')
  const [kitCatId, setKitCatId]   = useState('')
  const kitCategories = categories.filter(c => catSegmentMap[c.id] === 'kit')

  const tamanhos = gradeConfig?.tamanhos || []
  const pacotes  = gradeConfig?.pacotes  || []
  const combos   = tamanhos.flatMap(t => pacotes.map(p => ({ tamanho: t, pacote: p })))

  const [kitLines, setKitLines] = useState({})

  function updateKitLine(key, field, value) {
    setKitLines(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  const validKitLines = combos.filter(c => {
    const key = c.tamanho + '|' + c.pacote
    return kitLines[key]?.price
  })

  async function saveKit() {
    if (!kitName.trim() || !validKitLines.length) return
    setSaving(true)
    try {
      const prices = validKitLines.map(c =>
        parseFloat(kitLines[c.tamanho + '|' + c.pacote].price)
      ).filter(n => !isNaN(n) && n > 0)
      const finalPrice = prices.length ? Math.min(...prices) : 0
      const totalStock = validKitLines.reduce((s, c) =>
        s + parseInt(kitLines[c.tamanho + '|' + c.pacote].stock || '0'), 0)

      const { data: product, error: e1 } = await supabase
        .from('products')
        .insert({
          org_id:         orgId,
          name:           kitName.trim(),
          price:          finalPrice,
          stock_quantity: totalStock,
          category_id:    kitCatId || null,
          is_active:      true,
          sku:            null,
        })
        .select('id')
        .single()
      if (e1) throw e1

      const variantRows = validKitLines.map(c => {
        const key = c.tamanho + '|' + c.pacote
        const kl  = kitLines[key] || {}
        return {
          org_id:         orgId,
          product_id:     product.id,
          attributes:     { tamanho: c.tamanho, pacote: c.pacote },
          stock_quantity: parseInt(kl.stock || '0'),
          price_override: kl.price ? parseFloat(kl.price) : null,
          is_active:      true,
        }
      })
      const { error: e2 } = await supabase
        .from('product_variants')
        .insert(variantRows)
      if (e2) throw e2

      onSaved()
      onClose()
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── RENDER ── */
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center
      justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl
        max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5
          border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">
            Cadastro rápido
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 flex
              items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-5 py-3 text-sm font-bold transition-colors"
              style={{
                borderBottom: tab === t.key
                  ? `2px solid ${color}` : '2px solid transparent',
                color: tab === t.key ? color : '#6b7280',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── ABA SIMPLES ── */}
          {tab === 'simples' && (
            <div className="space-y-4">
              {/* Categoria */}
              <div>
                <label className="text-[11px] font-bold text-gray-400
                  uppercase tracking-wide block mb-1.5">
                  Categoria (opcional)
                </label>
                <select
                  value={simpleCatId}
                  onChange={e => setSimpleCatId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border
                    border-gray-200 text-sm outline-none"
                >
                  <option value="">Sem categoria</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Cabeçalho da lista */}
              <div className="grid gap-2"
                style={{ gridTemplateColumns: '1fr 80px 80px 70px 60px 28px' }}>
                {['Nome', 'Preço', 'Custo', 'Estoque', 'Mín.', ''].map(h => (
                  <span key={h} className="text-[10px] font-bold text-gray-400
                    uppercase tracking-wide">{h}</span>
                ))}
              </div>

              {/* Linhas */}
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l._key} className="grid gap-2 items-center"
                    style={{ gridTemplateColumns: '1fr 80px 80px 70px 60px 28px' }}>
                    <input
                      type="text"
                      placeholder="Nome do produto"
                      value={l.name}
                      onChange={e => updateLine(l._key, 'name', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gray-200
                        text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="0,00"
                      value={l.price}
                      onChange={e => updateLine(l._key, 'price', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gray-200
                        text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="—"
                      value={l.cost}
                      onChange={e => updateLine(l._key, 'cost', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gray-200
                        text-sm outline-none text-gray-400"
                    />
                    <input
                      type="number"
                      placeholder="0"
                      value={l.stock}
                      onChange={e => updateLine(l._key, 'stock', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gray-200
                        text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="5"
                      value={l.min_stock}
                      onChange={e => updateLine(l._key, 'min_stock', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gray-200
                        text-sm outline-none text-gray-400"
                    />
                    <button
                      onClick={() => removeLine(l._key)}
                      disabled={lines.length <= 1}
                      className="w-7 h-7 rounded-lg bg-red-50 flex items-center
                        justify-center disabled:opacity-30"
                    >
                      <X size={12} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addLine}
                className="w-full py-2 rounded-xl border border-dashed
                  border-gray-300 text-xs font-bold text-gray-400
                  hover:border-gray-400 transition-colors"
              >
                + Adicionar linha
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100
                    text-gray-700 font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSimples}
                  disabled={saving || !validLines.length}
                  className="flex-2 px-6 py-2.5 rounded-xl text-white
                    font-bold text-sm disabled:opacity-40"
                  style={{ backgroundColor: color, flex: 2 }}
                >
                  {saving ? 'Salvando...'
                    : `Salvar ${validLines.length} produto${validLines.length > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* ── ABA KIT ── */}
          {tab === 'kit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400
                    uppercase tracking-wide block mb-1.5">Nome</label>
                  <input
                    type="text"
                    placeholder="Ex: Sacola Preta"
                    value={kitName}
                    onChange={e => setKitName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border
                      border-gray-200 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400
                    uppercase tracking-wide block mb-1.5">Categoria</label>
                  <select
                    value={kitCatId}
                    onChange={e => setKitCatId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border
                      border-gray-200 text-sm outline-none"
                  >
                    <option value="">Selecione...</option>
                    {kitCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {combos.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">
                  Configure tamanhos e pacotes em{' '}
                  <strong>Configurações › Grade de Variações</strong>
                </div>
              ) : (
                <>
                  {/* Cabeçalho */}
                  <div className="grid gap-2"
                    style={{ gridTemplateColumns: '1fr 1fr 80px 80px 70px' }}>
                    {['Tamanho', 'Pacote', 'Preço', 'Custo', 'Estoque'].map(h => (
                      <span key={h} className="text-[10px] font-bold text-gray-400
                        uppercase tracking-wide">{h}</span>
                    ))}
                  </div>

                  {/* Combinações */}
                  <div className="space-y-2">
                    {combos.map(c => {
                      const key = c.tamanho + '|' + c.pacote
                      const kl  = kitLines[key] || {}
                      return (
                        <div key={key} className="grid gap-2 items-center"
                          style={{ gridTemplateColumns: '1fr 1fr 80px 80px 70px' }}>
                          <span className="text-sm text-gray-700 px-3 py-2
                            bg-gray-50 rounded-xl">{c.tamanho}</span>
                          <span className="text-sm text-gray-700 px-3 py-2
                            bg-gray-50 rounded-xl">{c.pacote}</span>
                          <input
                            type="number"
                            placeholder="0,00"
                            value={kl.price || ''}
                            onChange={e => updateKitLine(key, 'price', e.target.value)}
                            className="px-3 py-2 rounded-xl border border-gray-200
                              text-sm outline-none"
                          />
                          <input
                            type="number"
                            placeholder="—"
                            value={kl.cost || ''}
                            onChange={e => updateKitLine(key, 'cost', e.target.value)}
                            className="px-3 py-2 rounded-xl border border-gray-200
                              text-sm outline-none text-gray-400"
                          />
                          <input
                            type="number"
                            placeholder="0"
                            value={kl.stock || ''}
                            onChange={e => updateKitLine(key, 'stock', e.target.value)}
                            className="px-3 py-2 rounded-xl border border-gray-200
                              text-sm outline-none"
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-gray-100
                        text-gray-700 font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveKit}
                      disabled={saving || !kitName.trim() || !validKitLines.length}
                      className="flex-2 px-6 py-2.5 rounded-xl text-white
                        font-bold text-sm disabled:opacity-40"
                      style={{ backgroundColor: color, flex: 2 }}
                    >
                      {saving ? 'Salvando...'
                        : `Salvar ${kitName || 'produto'} (${validKitLines.length} variações)`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

/* ── modal ───────────────────────────────────────────────── */

function ProductModal({
  editing, form, setForm, onSave, onClose, saving, color, categories, hasMultiplePDV,
  catSegmentMap, tenantSegment, gradeConfig, variants, setVariants, variantAttrMode, setVariantAttrMode, techForm, setTechForm,
  orgMinStock,
}) {
  const effectiveSegment = (form.category_id && catSegmentMap[form.category_id]) || tenantSegment || 'geral'
  const isKit  = effectiveSegment === 'kit'
  const isModa = effectiveSegment === 'moda'
  const hasGradeVariants = isModa || isKit
  const [noBarcode, setNoBarcode] = useState(() => !form.sku)
  const corOptions     = gradeConfig?.cores    || []
  const tamanhoOptions = gradeConfig?.tamanhos || []
  const numeroOptions  = gradeConfig?.numeros  || []
  const pacoteOptions  = gradeConfig?.pacotes  || []
  const eixo1Label       = isKit ? 'Tamanho' : 'Cor'
  const eixo2Label       = isKit ? 'Pacote' : (variantAttrMode === 'tamanho' ? 'Tamanho' : 'Número')
  const eixo1Placeholder = isKit ? 'Tamanho...' : 'Cor'
  const eixo2Placeholder = isKit ? 'Pacote...' : (variantAttrMode === 'tamanho' ? 'Tam.' : 'Nº')
  const eixo1Options     = isKit ? tamanhoOptions : corOptions
  const eixo2Options     = isKit ? pacoteOptions : (variantAttrMode === 'tamanho' ? tamanhoOptions : numeroOptions)
  const hasGradeConfig   = eixo1Options.length > 0 || eixo2Options.length > 0

  function addVariant() {
    setVariants(v => [...v, { _key: Date.now(), id: null, cor: '', attrVal: '', stock_quantity: '', price_override: '' }])
  }
  function removeVariant(idx) {
    setVariants(v => v.filter((_, i) => i !== idx))
  }
  function updateVariant(idx, field, val) {
    setVariants(v => v.map((row, i) => i === idx ? { ...row, [field]: val } : row))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div
        className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">
            {editing ? 'Editar produto' : 'Novo produto'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Base fields */}
        <div className="space-y-3">
          {hasMultiplePDV && (
            <Field label="Categoria">
              <select
                value={form.category_id}
                onChange={e => {
                  const newCatId = e.target.value
                  const newCat = categories.find(c => c.id === newCatId)
                  setForm(f => ({
                    ...f,
                    category_id: newCatId,
                    min_stock_alert: String(newCat?.min_stock_alert || orgMinStock),
                  }))
                  if (!editing && (catSegmentMap[newCatId] === 'moda' || catSegmentMap[newCatId] === 'kit') && variants.length === 0) {
                    setVariants([{ _key: Date.now(), id: null, cor: '', attrVal: '', stock_quantity: '', price_override: '' }])
                  }
                }}
                className={fieldCls}
              >
                <option value="">Sem categoria</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Nome *">
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome do produto"
              className={fieldCls}
            />
          </Field>

          {/* Código de barras */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={noBarcode}
              onChange={e => {
                setNoBarcode(e.target.checked)
                if (e.target.checked) setForm(f => ({ ...f, sku: '' }))
              }}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-gray-500 font-medium">Não tenho código de barras</span>
          </label>
          {!noBarcode && (
            <Field label="SKU / Código de barras">
              <input
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="Digite o código"
                className={fieldCls}
              />
            </Field>
          )}

          {/* Preço + Custo (moda/kit: sem preço — vem das variações) */}
          {!hasGradeVariants && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço de venda *">
                <input
                  type="number" step="0.01" min="0"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,00"
                  className={fieldCls}
                />
              </Field>
              <Field label="Custo">
                <input
                  type="number" step="0.01" min="0"
                  value={form.cost_price}
                  onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                  placeholder="0,00"
                  className={fieldCls}
                />
              </Field>
            </div>
          )}

          {/* Estoque (oculto em moda/kit — gerenciado por variação) */}
          {!hasGradeVariants && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estoque">
                <input
                  type="number" min="0"
                  value={form.stock_quantity}
                  onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))}
                  placeholder="0"
                  className={fieldCls}
                />
              </Field>
              <Field label="Estoque mínimo">
                <input
                  type="number" min="0"
                  value={form.min_stock_alert}
                  onChange={e => setForm(f => ({ ...f, min_stock_alert: e.target.value }))}
                  placeholder="5"
                  className={fieldCls}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── Moda / Kit: Grade de Variações ── */}
        {hasGradeVariants && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Grade de Variações</p>
              {!isKit && (
                <div className="flex gap-1">
                  {['tamanho', 'numero'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setVariantAttrMode(mode)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${
                        variantAttrMode === mode
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {mode === 'tamanho' ? 'Tamanho' : 'Número'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!hasGradeConfig && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {isKit
                  ? <>Configure seus tamanhos e pacotes em <strong>Configurações › Grade de Variações</strong>.</>
                  : <>Configure suas cores e tamanhos em <strong>Configurações › Grade de Variações</strong>.</>
                }
              </p>
            )}

            {variants.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_56px_68px_28px] gap-1 text-[9px] font-bold text-gray-400 uppercase px-0.5">
                  <span>{eixo2Label}</span>
                  <span>{eixo1Label}</span>
                  <span>Qtd</span>
                  <span>Preço</span>
                  <span />
                </div>
                {variants.map((v, i) => (
                  <div key={v._key} className="grid grid-cols-[1fr_1fr_56px_68px_28px] gap-1 items-center">
                    <select value={v.attrVal} onChange={e => updateVariant(i, 'attrVal', e.target.value)} className={fieldClsXs}>
                      <option value="">{eixo2Placeholder}</option>
                      {eixo2Options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select value={v.cor} onChange={e => updateVariant(i, 'cor', e.target.value)} className={fieldClsXs}>
                      <option value="">{eixo1Placeholder}</option>
                      {eixo1Options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input
                      type="number" min="0"
                      value={v.stock_quantity}
                      onChange={e => updateVariant(i, 'stock_quantity', e.target.value)}
                      placeholder="0"
                      className={fieldClsXs}
                    />
                    <input
                      type="number" step="0.01" min="0"
                      value={v.price_override}
                      onChange={e => updateVariant(i, 'price_override', e.target.value)}
                      placeholder="—"
                      className={fieldClsXs}
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
            >
              <Plus size={12} /> Adicionar variação
            </button>
          </div>
        )}

        {/* ── Moda: Custo + Estoque mínimo ── */}
        {hasGradeVariants && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Custo">
              <input
                type="number" step="0.01" min="0"
                value={form.cost_price}
                onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                placeholder="0,00"
                className={fieldCls}
              />
            </Field>
            <Field label="Estoque mínimo">
              <input
                type="number" min="0"
                value={form.min_stock_alert}
                onChange={e => setForm(f => ({ ...f, min_stock_alert: e.target.value }))}
                placeholder="5"
                className={fieldCls}
              />
            </Field>
          </div>
        )}

        {/* ── Eletronicos: Informações Técnicas ── */}
        {effectiveSegment === 'eletronicos' && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Informações Técnicas</p>

            <Field label="Número de Série">
              <input
                value={techForm.serial_number}
                onChange={e => setTechForm(f => ({ ...f, serial_number: e.target.value }))}
                placeholder="Opcional"
                className={fieldCls}
              />
            </Field>

            <Field label="IMEI">
              <input
                value={techForm.imei}
                onChange={e => setTechForm(f => ({ ...f, imei: e.target.value }))}
                placeholder="Opcional"
                className={fieldCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Garantia">
                <select
                  value={techForm.warranty_months}
                  onChange={e => setTechForm(f => ({ ...f, warranty_months: e.target.value }))}
                  className={fieldCls}
                >
                  <option value="">Sem garantia</option>
                  {WARRANTY_MONTHS.map(m => (
                    <option key={m} value={m}>{m} {m === 1 ? 'mês' : 'meses'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Início da Garantia">
                <input
                  type="date"
                  value={techForm.warranty_from}
                  onChange={e => setTechForm(f => ({ ...f, warranty_from: e.target.value }))}
                  className={fieldCls}
                />
              </Field>
            </div>

            {techForm.warranty_months && techForm.warranty_from && (
              <p className="text-[10px] text-gray-400">
                Validade até:{' '}
                <span className="font-bold text-gray-600">
                  {new Date(calcWarrantyUntil(techForm.warranty_from, techForm.warranty_months) + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim() || (!hasGradeVariants && !form.price)}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60"
            style={{ backgroundColor: color }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

/* ── main component ──────────────────────────────────────── */

export default function Produtos() {
  const { tenant } = useTenantContext()
  const { can } = usePermissions()
  const { hasMultiplePDV } = useMultiPDV()
  const canManage = can('can_manage_products')
  const orgId  = tenant?.id
  const color  = '#0891b2'
  const segment = tenant?.segment || 'geral'

  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)   // null | 'new' | product
  const [quickModal, setQuickModal] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [seeding, setSeeding]   = useState(false)
  const [search, setSearch]     = useState('')
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('produtos_view_mode') || 'cards')

  /* segment-specific state */
  const [gradeConfig, setGradeConfig]       = useState(null)
  const [hasGradeCategories, setHasGradeCategories] = useState(false)
  const [variants, setVariants]             = useState([])
  const [variantAttrMode, setVariantAttrMode] = useState('tamanho')
  const [techForm, setTechForm]             = useState({ serial_number: '', imei: '', warranty_months: '', warranty_from: todayISO() })

  /* categories */
  const [categories, setCategories]   = useState([])
  const [catModal, setCatModal]       = useState(null)   // null | 'new' | category
  const [catForm, setCatForm]         = useState({ name: '', description: '', segment_id: '', min_stock_alert: '' })
  const [catSaving, setCatSaving]     = useState(false)
  const [catDeleting, setCatDeleting] = useState(null)
  const [orgSegments, setOrgSegments] = useState([])

  const hasDemos       = products.some(p => p.is_demo)
  const catMap         = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catSegmentMap  = Object.fromEntries(categories.filter(c => c.segment_id).map(c => [c.id, c.segment_id]))
  const showCategories = hasMultiplePDV || orgSegments.length >= 2

  /* load products */
  async function load() {
    if (!orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, price, cost_price, stock_quantity, min_stock_alert, sku, is_demo, category_id')
      .eq('org_id', orgId)
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  /* load categories */
  async function loadCategories() {
    if (!orgId) return
    const { data } = await supabase
      .from('categories')
      .select('id, name, description, segment_id, min_stock_alert')
      .eq('org_id', orgId)
      .order('name')
    setCategories(data || [])
  }

  async function loadOrgSegments() {
    if (!orgId) return
    const { data: orgSegsData } = await supabase
      .from('organization_segments')
      .select('segment_id')
      .eq('org_id', orgId)
    if (!orgSegsData?.length) { setOrgSegments([]); return }
    const slugs = orgSegsData.map(r => r.segment_id)
    const { data: segData } = await supabase
      .from('segments')
      .select('id, name')
      .in('id', slugs)
    setOrgSegments(segData || [])
  }

  useEffect(() => { load() }, [orgId])
  useEffect(() => { if (showCategories) loadCategories() }, [orgId, showCategories])
  useEffect(() => { loadOrgSegments() }, [orgId])
  useEffect(() => {
    if (!orgId) return
    supabase
      .from('categories')
      .select('segment_id')
      .eq('org_id', orgId)
      .in('segment_id', ['moda', 'kit'])
      .then(({ data }) => setHasGradeCategories((data || []).length > 0))
  }, [orgId])
  useEffect(() => {
    const hasGrade =
      segment === 'moda' || segment === 'kit' ||
      orgSegments.some(s => s.id === 'moda' || s.id === 'kit')
    if (!orgId) return
    if (!hasGrade && !hasGradeCategories) return
    supabase.from('organizations').select('grade_config').eq('id', orgId).single()
      .then(({ data }) => setGradeConfig(data?.grade_config || null))
  }, [orgId, segment, orgSegments, hasGradeCategories])

  /* estoque mínimo efetivo: categoria > padrão global > 5 */
  function effectiveMinStock(categoryId) {
    const cat = categories.find(c => c.id === categoryId)
    return cat?.min_stock_alert || tenant?.min_stock_alert || 5
  }

  /* open new / edit */
  function openNew() {
    setForm({ ...EMPTY, min_stock_alert: String(effectiveMinStock('')) })
    setVariants(
      (segment === 'moda' || segment === 'kit')
        ? [{ _key: Date.now(), id: null, cor: '', attrVal: '', stock_quantity: '', price_override: '' }]
        : []
    )
    setVariantAttrMode('tamanho')
    setTechForm({ serial_number: '', imei: '', warranty_months: '', warranty_from: todayISO() })
    setModal('new')
  }
  function openEdit(p) {
    setForm({
      name:            p.name,
      price:           String(p.price),
      cost_price:      String(p.cost_price ?? ''),
      stock_quantity:  String(p.stock_quantity ?? ''),
      min_stock_alert: String(p.min_stock_alert ?? '5'),
      sku:             p.sku ?? '',
      category_id:     p.category_id ?? '',
    })
    setVariants([])
    setVariantAttrMode('tamanho')
    setTechForm({ serial_number: '', imei: '', warranty_months: '', warranty_from: todayISO() })
    setModal(p)
    const productSeg = catSegmentMap[p.category_id] || segment || 'geral'

    if (productSeg === 'moda' || productSeg === 'kit') {
      supabase.from('product_variants').select('*')
        .eq('product_id', p.id).eq('org_id', orgId)
        .then(({ data }) => {
          const rows = data || []
          if (productSeg === 'moda' && rows[0]?.attributes && 'numero' in rows[0].attributes) {
            setVariantAttrMode('numero')
          }
          setVariants(rows.map((v, idx) => ({
            _key: v.id || idx,
            id: v.id,
            cor: productSeg === 'kit'
              ? (v.attributes?.tamanho || '')
              : (v.attributes?.cor || ''),
            attrVal: productSeg === 'kit'
              ? (v.attributes?.pacote ?? '')
              : (v.attributes?.tamanho ?? v.attributes?.numero ?? ''),
            stock_quantity: String(v.stock_quantity ?? ''),
            price_override: v.price_override != null ? String(v.price_override) : '',
          })))
        })
    }

    if (productSeg === 'eletronicos') {
      supabase.from('product_attributes').select('*')
        .eq('product_id', p.id).eq('org_id', orgId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setTechForm({
            serial_number: data.serial_number || '',
            imei: data.imei || '',
            warranty_months: data.warranty_months != null ? String(data.warranty_months) : '',
            warranty_from: data.warranty_from || todayISO(),
          })
        })
    }
  }

  /* save product */
  async function save() {
    if (!form.name.trim()) return
    const effectiveSeg = catSegmentMap[form.category_id] || segment || 'geral'
    if (effectiveSeg !== 'moda' && effectiveSeg !== 'kit' && !form.price) return
    setSaving(true)
    let finalPrice = parseFloat(form.price || '0')
    let finalStock = parseInt(form.stock_quantity || '0')
    let variantRows = []
    if (effectiveSeg === 'moda' || effectiveSeg === 'kit') {
      variantRows = variants
        .filter(v => v.cor || v.attrVal)
        .map(v => ({
          org_id: orgId,
          attributes: effectiveSeg === 'kit'
            ? { tamanho: v.cor, pacote: v.attrVal }
            : { cor: v.cor, [variantAttrMode]: v.attrVal },
          stock_quantity: parseInt(v.stock_quantity || '0'),
          price_override: v.price_override ? parseFloat(v.price_override) : null,
          is_active: true,
        }))
      const prices = variantRows
        .map(v => v.price_override)
        .filter(n => n != null && n > 0)
      if (prices.length > 0) finalPrice = Math.min(...prices)
      finalStock = variantRows.reduce((s, v) => s + v.stock_quantity, 0)
    }
    const payload = {
      name:            form.name.trim(),
      price:           finalPrice,
      cost_price:      parseFloat(form.cost_price || '0'),
      stock_quantity:  finalStock,
      min_stock_alert: parseInt(form.min_stock_alert || '5'),
      sku:             form.sku.trim() || null,
      category_id:     form.category_id || null,
    }

    let productId
    if (modal === 'new') {
      const { data } = await supabase.from('products').insert({ ...payload, org_id: orgId }).select('id').single()
      productId = data?.id
    } else {
      await supabase.from('products').update(payload).eq('id', modal.id).eq('org_id', orgId)
      productId = modal.id
    }

    if (productId && (effectiveSeg === 'moda' || effectiveSeg === 'kit')) {
      await supabase.from('product_variants').delete().eq('product_id', productId).eq('org_id', orgId)
      if (variantRows.length > 0) {
        await supabase.from('product_variants').insert(
          variantRows.map(v => ({ ...v, product_id: productId }))
        )
      }
    }

    if (productId && effectiveSeg === 'eletronicos') {
      const warrantyUntil = calcWarrantyUntil(techForm.warranty_from, techForm.warranty_months)
      const attrPayload = {
        org_id: orgId,
        product_id: productId,
        serial_number: techForm.serial_number || null,
        imei: techForm.imei || null,
        warranty_months: techForm.warranty_months ? parseInt(techForm.warranty_months) : null,
        warranty_from: techForm.warranty_from || null,
        warranty_until: warrantyUntil || null,
      }
      console.log('[debug] payload product_attributes:', attrPayload)
      const { error: attrErr } = await supabase
        .from('product_attributes')
        .upsert(attrPayload, { onConflict: 'product_id' })
      if (attrErr) console.log('[debug] erro completo:', attrErr)
    }

    setSaving(false)
    setModal(null)
    load()
  }

  /* delete product */
  async function del(product) {
    if (!window.confirm(`Excluir "${product.name}"?`)) return
    setDeleting(product.id)
    await supabase.from('products').delete().eq('id', product.id).eq('org_id', orgId)
    setDeleting(null)
    setProducts(prev => prev.filter(p => p.id !== product.id))
  }

  /* remove all demos */
  async function removeDemos() {
    if (!window.confirm('Remover todos os produtos demo desta loja?')) return
    await supabase.from('products').delete().eq('org_id', orgId).eq('is_demo', true)
    setProducts(prev => prev.filter(p => !p.is_demo))
  }

  /* seed demo products */
  async function seedDemos() {
    setSeeding(true)
    const { error } = await supabase.from('products').insert(
      DEMOS.map(d => ({ ...d, org_id: orgId, is_demo: true }))
    )
    setSeeding(false)
    if (error) {
      if (error.message.includes('is_demo')) {
        alert(
          'Coluna is_demo ainda não existe.\n\nRode este SQL no Supabase SQL Editor:\n\n' +
          'ALTER TABLE public.products\nADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;'
        )
      } else {
        alert('Erro: ' + error.message)
      }
      return
    }
    load()
  }

  /* category CRUD */
  async function saveCategory() {
    if (!catForm.name.trim()) return
    setCatSaving(true)
    const segmentId = catForm.segment_id || 'geral'
    const minStockAlert = catForm.min_stock_alert ? parseInt(catForm.min_stock_alert) : null
    if (catModal === 'new') {
      await supabase.from('categories').insert({
        org_id: orgId,
        name: catForm.name.trim(),
        description: catForm.description.trim() || null,
        segment_id: segmentId,
        min_stock_alert: minStockAlert,
      })
    } else {
      await supabase.from('categories').update({
        name: catForm.name.trim(),
        description: catForm.description.trim() || null,
        segment_id: segmentId,
        min_stock_alert: minStockAlert,
      }).eq('id', catModal.id).eq('org_id', orgId)
    }
    setCatSaving(false)
    setCatModal(null)
    loadCategories()
  }

  async function deleteCategory(cat) {
    if (!window.confirm(`Excluir categoria "${cat.name}"?`)) return
    setCatDeleting(cat.id)
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .eq('org_id', orgId)
    if (count > 0) {
      alert(`Não é possível excluir. ${count} produto${count !== 1 ? 's' : ''} ainda ${count !== 1 ? 'estão' : 'está'} nesta categoria.`)
      setCatDeleting(null)
      return
    }
    await supabase.from('categories').delete().eq('id', cat.id).eq('org_id', orgId)
    setCatDeleting(null)
    loadCategories()
  }

  /* filtered list */
  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
  })

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-gray-900">Produtos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{products.length} cadastrado{products.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl
                border text-sm font-bold transition-colors"
              style={{ borderColor: color, color: color }}
            >
              <List size={15} />
              Cadastro rápido
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
              style={{ backgroundColor: color }}
            >
              <Plus size={15} />
              Novo produto
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold cursor-not-allowed" title="Sem permissão para gerenciar produtos">
            <Lock size={14} />
            Sem permissão
          </div>
        )}
      </div>

      {/* ── Categories section ── */}
      {showCategories && (
        <div className="mb-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Tag size={14} style={{ color }} />
              <span className="text-sm font-black text-gray-900">Categorias</span>
              <span className="text-xs text-gray-400">({categories.length})</span>
            </div>
            {canManage && (
              <button
                onClick={() => {
                  const hasModa  = orgSegments.some(s => s.id === 'moda')
                  const hasGeral = orgSegments.some(s => s.id === 'geral')
                  const defaultSegment = hasModa ? 'moda' : hasGeral ? 'geral' : 'kit'
                  setCatForm({ name: '', description: '', segment_id: defaultSegment, min_stock_alert: '' })
                  setCatModal('new')
                }}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl text-white active:scale-95 transition-transform"
                style={{ backgroundColor: color }}
              >
                <Plus size={11} />
                Nova
              </button>
            )}
          </div>

          {categories.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5 px-4">
              Nenhuma categoria ainda. Crie categorias para filtrar produtos por PDV.
            </p>
          ) : (
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5"
                >
                  <span className="text-xs font-bold text-gray-700">{cat.name}</span>
                  {canManage && (
                    <>
                      <button
                        onClick={() => { setCatForm({ name: cat.name, description: cat.description || '', segment_id: cat.segment_id || '', min_stock_alert: cat.min_stock_alert != null ? String(cat.min_stock_alert) : '' }); setCatModal(cat) }}
                        className="text-gray-300 hover:text-blue-500 transition-colors"
                        title="Editar categoria"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => deleteCategory(cat)}
                        disabled={catDeleting === cat.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Excluir categoria"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      {products.length > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 shadow-sm">
          <Package size={15} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou SKU..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* View mode toggle */}
      {products.length > 0 && (
        <div className="mb-3 flex gap-1.5">
          {[
            { mode: 'cards', icon: LayoutGrid, label: 'Cards' },
            { mode: 'lista', icon: List,        label: 'Lista'  },
          ].map(({ mode, icon: Icon, label }) => {
            const active = viewMode === mode
            return (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); localStorage.setItem('produtos_view_mode', mode) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border"
                style={active
                  ? { backgroundColor: '#0891b2', color: 'white', borderColor: '#0891b2' }
                  : { backgroundColor: 'white',   color: '#6b7280', borderColor: '#e5e7eb' }
                }
              >
                <Icon size={13} style={{ color: active ? 'white' : '#9ca3af' }} />
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Demo warning banner */}
      {hasDemos && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <FlaskConical size={15} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 font-medium flex-1">
            Esta lista contém produtos de demonstração.
          </p>
          <button
            onClick={removeDemos}
            className="text-xs font-bold text-red-600 hover:underline whitespace-nowrap"
          >
            Remover todos os demos
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Package size={28} className="text-gray-300" />
          </div>
          <div>
            <p className="font-bold text-gray-600">Nenhum produto ainda</p>
            <p className="text-sm text-gray-400 mt-1">Crie seu primeiro produto ou adicione dados demo para testar.</p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              onClick={openNew}
              className="py-3 rounded-2xl text-white font-bold shadow-md"
              style={{ backgroundColor: color }}
            >
              + Criar produto
            </button>
            <button
              onClick={seedDemos}
              disabled={seeding}
              className="py-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 font-bold text-sm hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              {seeding ? 'Adicionando...' : '🧪 Adicionar produtos demo'}
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Nenhum produto encontrado.</p>
      ) : (
        <>
          {viewMode === 'cards' ? (<>
          {/* Desktop table header */}
          <div className="hidden sm:grid grid-cols-[1fr_110px_90px_70px_72px] gap-2 px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            <span>Produto</span>
            <span className="text-right">Preço</span>
            <span className="text-right">Estoque</span>
            <span className="text-right">Mín.</span>
            <span />
          </div>

          <div className="space-y-2">
            {filtered.map(p => {
              const low     = p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_alert
              const out     = p.stock_quantity <= 0
              const catName = showCategories && p.category_id ? catMap[p.category_id] : null
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 ${
                    p.is_demo ? 'border-l-[3px] border-l-amber-400' : ''
                  }`}
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900 truncate">{p.name}</span>
                      {catName && (
                        <span
                          className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0"
                          style={{ backgroundColor: color + '20', color }}
                        >
                          {catName}
                        </span>
                      )}
                      {p.is_demo && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-md shrink-0">
                          demo
                        </span>
                      )}
                      {out && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-red-100 text-red-500 rounded-md shrink-0">
                          sem estoque
                        </span>
                      )}
                      {low && !out && (
                        <AlertTriangle size={11} className="text-orange-400 shrink-0" />
                      )}
                    </div>
                    {p.sku && <p className="text-[10px] text-gray-400 mt-0.5">{p.sku}</p>}
                    {/* Mobile values */}
                    <div className="flex items-center gap-3 mt-1 sm:hidden">
                      <span className="text-xs font-black" style={{ color }}>{brl(p.price)}</span>
                      <span className={`text-xs font-semibold ${out ? 'text-red-500' : low ? 'text-orange-400' : 'text-gray-500'}`}>
                        {p.stock_quantity} un.
                      </span>
                    </div>
                  </div>

                  {/* Desktop columns */}
                  <span
                    className="hidden sm:block text-sm font-black w-[110px] text-right shrink-0"
                    style={{ color }}
                  >
                    {brl(p.price)}
                  </span>
                  <span
                    className={`hidden sm:block text-sm font-semibold w-[90px] text-right shrink-0 ${
                      out ? 'text-red-500' : low ? 'text-orange-400' : 'text-gray-600'
                    }`}
                  >
                    {p.stock_quantity} un.
                  </span>
                  <span className="hidden sm:block text-sm text-gray-400 w-[70px] text-right shrink-0">
                    {p.min_stock_alert}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {canManage ? (
                      <>
                        <button
                          onClick={() => openEdit(p)}
                          className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-blue-50 flex items-center justify-center transition-colors group"
                          title="Editar"
                        >
                          <Pencil size={13} className="text-gray-400 group-hover:text-blue-600" />
                        </button>
                        <button
                          onClick={() => del(p)}
                          disabled={deleting === p.id}
                          className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-red-50 flex items-center justify-center transition-colors group disabled:opacity-40"
                          title="Excluir"
                        >
                          <Trash2 size={13} className="text-gray-400 group-hover:text-red-500" />
                        </button>
                      </>
                    ) : (
                      <div title="Sem permissão para gerenciar produtos" className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                        <Lock size={13} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </>) : (
            <div>
              <div className="grid grid-cols-[1fr_80px_70px_32px] gap-2 px-2 py-1 mb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                <span>Nome</span>
                <span className="text-right">Preço</span>
                <span className="text-right">Estoque</span>
                <span />
              </div>
              {filtered.map(p => {
                const low = p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_alert
                const out = p.stock_quantity <= 0
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[1fr_80px_70px_32px] gap-2 items-center bg-white"
                    style={{ borderRadius: '6px', border: '0.5px solid #e5e7eb', padding: '6px 8px', marginBottom: '3px', fontSize: '11px' }}
                  >
                    <span className="font-semibold text-gray-900 truncate">{p.name}</span>
                    <span className="text-right font-bold" style={{ color: '#0891b2' }}>{brl(p.price)}</span>
                    <span className={`text-right font-semibold ${out ? 'text-red-500' : low ? 'text-amber-500' : 'text-green-600'}`}>
                      {p.stock_quantity} un.
                    </span>
                    <div className="flex justify-end">
                      {canManage ? (
                        <button
                          onClick={() => openEdit(p)}
                          className="w-6 h-6 rounded-lg bg-gray-50 hover:bg-blue-50 flex items-center justify-center transition-colors group"
                        >
                          <Pencil size={11} className="text-gray-400 group-hover:text-blue-600" />
                        </button>
                      ) : (
                        <Lock size={11} className="text-gray-300" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Seed button when products exist but no demos */}
          {!hasDemos && (
            <button
              onClick={seedDemos}
              disabled={seeding}
              className="mt-5 text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <FlaskConical size={13} />
              {seeding ? 'Adicionando demos...' : 'Adicionar produtos demo'}
            </button>
          )}
        </>
      )}

      {/* Product Modal */}
      {modal && (
        <ProductModal
          editing={modal !== 'new'}
          form={form}
          setForm={setForm}
          onSave={save}
          onClose={() => setModal(null)}
          saving={saving}
          color={color}
          categories={categories}
          hasMultiplePDV={showCategories}
          catSegmentMap={catSegmentMap}
          tenantSegment={segment}
          gradeConfig={gradeConfig}
          variants={variants}
          setVariants={setVariants}
          variantAttrMode={variantAttrMode}
          setVariantAttrMode={setVariantAttrMode}
          techForm={techForm}
          setTechForm={setTechForm}
          orgMinStock={tenant?.min_stock_alert || 5}
        />
      )}

      {/* Quick Add Modal */}
      {quickModal && (
        <QuickAddModal
          orgId={orgId}
          segment={segment}
          categories={categories}
          catSegmentMap={catSegmentMap}
          gradeConfig={gradeConfig}
          color={color}
          onClose={() => setQuickModal(false)}
          onSaved={() => { load(); setQuickModal(false) }}
        />
      )}

      {/* Category Modal */}
      {catModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">
                {catModal === 'new' ? 'Nova categoria' : 'Editar categoria'}
              </h2>
              <button onClick={() => setCatModal(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">Nome *</label>
                <input
                  value={catForm.name}
                  onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveCategory()}
                  placeholder="Ex: Bebidas, Alimentos, Higiene..."
                  className={fieldCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">Descrição (opcional)</label>
                <input
                  value={catForm.description}
                  onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição da categoria"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">
                  Tipo de produto
                </label>
                {(() => {
                  const hasModa  = orgSegments.some(s => s.id === 'moda')
                  const hasGeral = orgSegments.some(s => s.id === 'geral')
                  return (
                    <select
                      value={catForm.segment_id || (hasModa ? 'moda' : hasGeral ? 'geral' : 'kit')}
                      onChange={e => setCatForm(f => ({ ...f, segment_id: e.target.value }))}
                      className={fieldCls}
                    >
                      {hasGeral && (
                        <option value="geral">
                          Produto único — um preço, um estoque
                        </option>
                      )}
                      {hasModa && (
                        <option value="moda">
                          Roupa / Calçado — variação de cor e tamanho
                        </option>
                      )}
                      <option value="kit">
                        Kit ou Pacote — vários tamanhos e quantidades
                      </option>
                    </select>
                  )
                })()}
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">
                  Estoque mínimo (opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder={`Padrão global (${tenant?.min_stock_alert || 5})`}
                  value={catForm.min_stock_alert || ''}
                  onChange={e => setCatForm(f => ({ ...f, min_stock_alert: e.target.value }))}
                  className={fieldCls}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Vazio = usa o padrão global. Pode ser ajustado individualmente por produto.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setCatModal(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveCategory}
                disabled={catSaving || !catForm.name.trim()}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60"
                style={{ backgroundColor: color }}
              >
                {catSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
