import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { friendlyError } from '../../../../shared/lib/planLimitError'

const fieldCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2'

function variantLabel(attributes) {
  return Object.values(attributes || {}).filter(Boolean).join(' · ') || 'Variação'
}

/*
 * "Alterar preço": só preço, custo e preço das variações -- para quem tem
 * can_edit_prices sem can_manage_products (ex.: gerente). Grava direto nas
 * colunas de preço (não regrava estoque nem o resto do cadastro); o banco
 * confere a permissão (products_guard / product_variants_guard).
 */
export default function PriceOnlyModal({ product, isGrade, orgId, color, onClose, onSaved }) {
  const [price, setPrice]       = useState(String(product.price ?? ''))
  const [cost, setCost]         = useState(product.cost_price != null ? String(product.cost_price) : '')
  const [variants, setVariants] = useState([])
  const [loading, setLoading]   = useState(isGrade)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!isGrade) return
    supabase.from('product_variants')
      .select('id, attributes, price_override')
      .eq('product_id', product.id)
      .eq('org_id', orgId)
      .order('created_at')
      .then(({ data }) => {
        setVariants((data || []).map(v => ({
          ...v,
          original: v.price_override,
          value: v.price_override != null ? String(v.price_override) : '',
        })))
        setLoading(false)
      })
  }, [product.id, orgId, isGrade])

  async function save() {
    setSaving(true)
    setError('')
    try {
      let newPrice = price === '' ? 0 : parseFloat(price)
      if (isGrade) {
        for (const v of variants) {
          const next = v.value === '' ? null : parseFloat(v.value)
          if (next === v.original || (next != null && Number(next) === Number(v.original))) continue
          const { error: e } = await supabase.from('product_variants')
            .update({ price_override: next })
            .eq('id', v.id)
            .eq('org_id', orgId)
          if (e) throw e
        }
        // preço do produto com grade = menor preço das variações (como no
        // cadastro completo)
        const prices = variants
          .map(v => (v.value === '' ? null : parseFloat(v.value)))
          .filter(n => n != null && n > 0)
        newPrice = prices.length > 0 ? Math.min(...prices) : Number(product.price)
      }
      const { error: e2 } = await supabase.from('products')
        .update({ price: newPrice, cost_price: cost === '' ? null : parseFloat(cost) })
        .eq('id', product.id)
        .eq('org_id', orgId)
      if (e2) throw e2
      onSaved?.()
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível salvar o preço. Tente novamente.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Alterar preço</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {isGrade ? (
          loading ? (
            <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ) : (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700 truncate">{variantLabel(v.attributes)}</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={v.value}
                    onChange={e => setVariants(list => list.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="0,00"
                    className={fieldCls + ' w-28'}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          <div>
            <label className="text-[11px] font-bold text-gray-500 mb-1 block">Preço de venda</label>
            <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" className={fieldCls} />
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold text-gray-500 mb-1 block">Custo</label>
          <input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00" className={fieldCls} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {saving ? 'Salvando...' : 'Salvar preço'}
          </button>
        </div>
      </div>
    </div>
  )
}
