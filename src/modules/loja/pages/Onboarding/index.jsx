import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Store, Tag, Users, Check, Plus, X, ArrowRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'

const SEGMENT_SUGGESTIONS = {
  geral:       ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'],
  moda:        ['Feminino', 'Masculino', 'Infantil', 'Calçados', 'Acessórios'],
  eletronicos: ['Celulares', 'Informática', 'TV e Áudio', 'Acessórios', 'Peças'],
}
const FALLBACK_SUGGESTIONS = ['Produtos', 'Serviços', 'Promoções', 'Importados', 'Outros']

const DEMO_PRODUCTS = [
  { name: 'Produto A', price: 25.90, cost_price: 0, stock_quantity: 42, min_stock_alert: 5 },
  { name: 'Produto B', price: 14.50, cost_price: 0, stock_quantity: 18, min_stock_alert: 5 },
  { name: 'Produto C', price:  8.00, cost_price: 0, stock_quantity:  5, min_stock_alert: 5 },
  { name: 'Produto D', price: 47.00, cost_price: 0, stock_quantity:  2, min_stock_alert: 5 },
]

export default function LojaOnboarding() {
  const { tenant, profile } = useTenantContext()
  const orgId    = tenant?.id
  const segment  = tenant?.segment || 'geral'
  const color    = tenant?.theme_color || '#3b82f6'
  const suggestions = SEGMENT_SUGGESTIONS[segment] || FALLBACK_SUGGESTIONS

  const [step, setStep]                     = useState(0)
  const [pendingCategories, setPending]     = useState([])
  const [saving, setSaving]                 = useState(false)

  // Categorias já existentes no banco (criadas pelo SuperAdmin via preset)
  const [existingCats, setExistingCats]     = useState(null) // null = carregando
  const [checked, setChecked]               = useState(() => new Set(suggestions))
  const [customInput, setCustomInput]       = useState('')
  const [customCats, setCustomCats]         = useState([])

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('categories')
      .select('id, name')
      .eq('org_id', orgId)
      .then(({ data }) => {
        const cats = data || []
        setExistingCats(cats)
        if (cats.length > 0) {
          // Banco já tem categorias — marcar todas como checked para o usuário ver
          setChecked(new Set(cats.map(c => c.name)))
        }
      })
  }, [orgId])

  // Já concluído (acesso direto via URL) → redireciona
  if (tenant?.onboarding_completed) {
    return <Navigate to="/" replace />
  }

  function toggleSuggestion(name) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function addCustom() {
    const name = customInput.trim()
    if (!name || customCats.includes(name)) return
    setCustomCats(prev => [...prev, name])
    setChecked(prev => new Set([...prev, name]))
    setCustomInput('')
  }

  function removeCustom(name) {
    setCustomCats(prev => prev.filter(c => c !== name))
    setChecked(prev => { const n = new Set(prev); n.delete(name); return n })
  }

  function goToTeamStep(cats) {
    setPending(cats)
    setStep(2)
  }

  async function finish() {
    setSaving(true)
    try {
      if (pendingCategories.length > 0) {
        await supabase.from('categories').insert(
          pendingCategories.map(name => ({ org_id: orgId, name, segment_id: segment }))
        )
      }
      await supabase.from('products').insert(
        DEMO_PRODUCTS.map(p => ({ ...p, org_id: orgId, is_demo: true }))
      )
      await supabase.from('organizations')
        .update({ onboarding_completed: true })
        .eq('id', orgId)
      window.location.assign('/')
    } catch {
      setSaving(false)
    }
  }

  function Dots() {
    return (
      <div className="flex items-center justify-center gap-1.5 mb-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{ width: i === step ? 20 : 6, backgroundColor: i <= step ? color : '#e5e7eb' }}
          />
        ))}
      </div>
    )
  }

  /* ── Step 0: Boas-vindas ─────────────────────────────────── */
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-5 text-center">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{ backgroundColor: color + '20' }}
          >
            <Store size={28} style={{ color }} />
          </div>
          <Dots />
          <div>
            <h1 className="text-2xl font-black text-gray-900">Bem-vindo ao Meu Caixa!</h1>
            <p className="text-sm text-gray-400 mt-2">Vamos configurar sua loja em poucos passos.</p>
          </div>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
            style={{ backgroundColor: color }}
          >
            Começar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Step 1: Categorias ──────────────────────────────────── */
  if (step === 1) {
    // Aguarda a query do banco antes de renderizar o step
    if (existingCats === null) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
        </div>
      )
    }

    const hasExisting = existingCats.length > 0
    // Lista base: categorias do banco OU sugestões hardcoded por segmento
    const baseList    = hasExisting ? existingCats.map(c => c.name) : suggestions
    // Nomes que já existem no banco — não serão re-inseridos no finish()
    const existingNames = new Set(existingCats.map(c => c.name))
    // Todos os itens exibidos (base + customizados pelo usuário nesta sessão)
    const allItems    = [...baseList, ...customCats]
    const allChecked  = allItems.filter(n => checked.has(n))

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <Dots />

          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: color + '20' }}
            >
              <Tag size={16} style={{ color }} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">Categorias da loja</h2>
              <p className="text-xs text-gray-400">
                {hasExisting
                  ? 'Categorias configuradas — adicione mais se quiser'
                  : 'Quais categorias sua loja tem?'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {allItems.map(name => {
              const isChecked  = checked.has(name)
              const isExisting = existingNames.has(name)
              const isCustom   = customCats.includes(name)
              return (
                <label
                  key={name}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 border transition-colors"
                  style={isChecked
                    ? { borderColor: color + '40', backgroundColor: color + '12' }
                    : { borderColor: '#f3f4f6', backgroundColor: '#f9fafb' }
                  }
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${isExisting ? '' : 'cursor-pointer'}`}
                    style={isChecked
                      ? { backgroundColor: color, borderColor: color }
                      : { borderColor: '#d1d5db' }
                    }
                    onClick={() => !isExisting && toggleSuggestion(name)}
                  >
                    {isChecked && <Check size={11} color="white" strokeWidth={3} />}
                  </div>
                  <span
                    className={`flex-1 text-sm font-semibold ${isExisting ? '' : 'cursor-pointer'}`}
                    style={{ color: isChecked ? '#111827' : '#6b7280' }}
                    onClick={() => !isExisting && toggleSuggestion(name)}
                  >
                    {name}
                  </span>
                  {isExisting && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">já criada</span>
                  )}
                  {isCustom && (
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); removeCustom(name) }}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </label>
              )
            })}
          </div>

          <div className="flex gap-2">
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              placeholder="Adicionar outra categoria..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-300 bg-white"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customInput.trim()}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: color }}
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            {!hasExisting && (
              <button
                onClick={() => goToTeamStep([])}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm"
              >
                Pular
              </button>
            )}
            <button
              onClick={() => {
                // Só envia para criação os itens NÃO existentes no banco
                const toCreate = allChecked.filter(n => !existingNames.has(n))
                goToTeamStep(toCreate)
              }}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md transition-opacity"
              style={{ backgroundColor: color }}
            >
              {hasExisting
                ? customCats.filter(n => checked.has(n)).length > 0
                  ? `Confirmar e adicionar (${customCats.filter(n => checked.has(n)).length})`
                  : 'Confirmar e continuar'
                : allChecked.length > 0
                  ? `Criar (${allChecked.length})`
                  : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 2: Equipe ──────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-5">
        <Dots />

        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: color + '20' }}
          >
            <Users size={16} style={{ color }} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Equipe</h2>
            <p className="text-xs text-gray-400">Opcional</p>
          </div>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          Quer adicionar gerentes ou operadores à sua loja? Você pode fazer isso a qualquer momento pelo menu <strong className="text-gray-700">Equipe</strong>.
        </p>

        <div className="bg-gray-50 rounded-2xl p-3.5 space-y-1 text-xs text-gray-500 border border-gray-100">
          <p className="font-semibold text-gray-600 text-[11px] uppercase tracking-wide mb-2">O que será criado agora</p>
          {pendingCategories.length > 0 ? (
            <p>✓ {pendingCategories.length} categori{pendingCategories.length !== 1 ? 'as' : 'a'}: {pendingCategories.join(', ')}</p>
          ) : (
            <p className="text-gray-400">– Nenhuma categoria (você pulou)</p>
          )}
          <p>✓ 4 produtos demo para explorar o sistema</p>
        </div>

        <button
          onClick={finish}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60 flex items-center justify-center gap-2 transition-opacity"
          style={{ backgroundColor: color }}
        >
          {saving ? 'Configurando...' : 'Concluir configuração'}
          {!saving && <CheckCircle2 size={15} />}
        </button>
      </div>
    </div>
  )
}
