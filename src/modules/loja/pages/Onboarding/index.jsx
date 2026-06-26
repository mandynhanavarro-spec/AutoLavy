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

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function normalizeDomain(name) {
  return (name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

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
  const color    = '#0891b2'
  const suggestions = SEGMENT_SUGGESTIONS[segment] || FALLBACK_SUGGESTIONS

  const [step, setStep]                     = useState(0)
  const [pendingCategories, setPending]     = useState([])
  const [saving, setSaving]                 = useState(false)

  const [teamMembers, setTeamMembers]   = useState([])
  const [teamResults, setTeamResults]   = useState([])
  const [creatingTeam, setCreatingTeam] = useState(false)

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

  function addMember() {
    setTeamMembers(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: '', email: '', role: 'operador', password: genPassword() },
    ])
  }
  const updateMember = (id, field, val) =>
    setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m))
  const removeMember = id =>
    setTeamMembers(prev => prev.filter(m => m.id !== id))

  async function createAllMembers() {
    const valid = teamMembers.filter(m => m.name.trim() && m.email.trim())
    if (!valid.length || !orgId) return
    setCreatingTeam(true)
    const results = []
    for (const m of valid) {
      try {
        const { data, error } = await supabase.functions.invoke('create-employee', {
          body: {
            org_id:    orgId,
            email:     m.email.trim().toLowerCase(),
            full_name: m.name.trim(),
            role:      m.role,
            password:  m.password,
          },
        })
        if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro')
        results.push({ ...m, email: data?.email || m.email, success: true })
      } catch (err) {
        results.push({ ...m, success: false, errorMsg: err.message })
      }
    }
    setTeamResults(results)
    setCreatingTeam(false)
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
  const domain = normalizeDomain(tenant?.name) || 'empresa'
  const successCount = teamResults.filter(r => r.success).length
  const hasMembersOrResults = teamMembers.length > 0 || teamResults.length > 0

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
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
            <p className="text-xs text-gray-400">Opcional — adicione depois pelo menu Equipe</p>
          </div>
        </div>

        {/* Cards dos membros */}
        {teamMembers.length > 0 && (
          <div className="space-y-3">
            {teamMembers.map(m => (
              <div key={m.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={m.name}
                    onChange={e => updateMember(m.id, 'name', e.target.value)}
                    placeholder="Nome completo"
                    className="flex-1 text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    type="button"
                    onClick={() => removeMember(m.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                  >
                    <X size={12} className="text-gray-400" />
                  </button>
                </div>
                <div>
                  <input
                    type="text"
                    value={m.email}
                    onChange={e => updateMember(m.id, 'email', e.target.value)}
                    placeholder="nome ou email@completo.com"
                    className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  {m.email && !m.email.includes('@') && (
                    <p className="text-[10px] font-mono mt-1 px-1" style={{ color }}>
                      → {m.email}@{domain}.com
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={m.role}
                    onChange={e => updateMember(m.id, 'role', e.target.value)}
                    className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="operador">Operador</option>
                    <option value="gerente">Gerente</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input
                    value={m.password}
                    onChange={e => updateMember(m.id, 'password', e.target.value)}
                    className="text-xs font-mono bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 text-gray-600"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botão adicionar membro */}
        <button
          type="button"
          onClick={addMember}
          className="w-full py-2.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-sm hover:border-gray-300 hover:text-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={14} /> Adicionar membro
        </button>

        {/* Botão criar contas */}
        {teamMembers.length > 0 && teamResults.length === 0 && (
          <button
            type="button"
            onClick={createAllMembers}
            disabled={creatingTeam || teamMembers.filter(m => m.name.trim() && m.email.trim()).length === 0}
            className="w-full py-3 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: '#10b981' }}
          >
            {creatingTeam
              ? 'Criando contas...'
              : `Criar ${teamMembers.filter(m => m.name.trim() && m.email.trim()).length} conta(s)`
            }
          </button>
        )}

        {/* Resultados */}
        {teamResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Contas criadas</p>
            {teamResults.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2.5 flex items-start gap-2 ${r.success ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}
              >
                {r.success
                  ? <Check size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                  : <X size={13} className="text-red-500 mt-0.5 shrink-0" />
                }
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{r.name} · {r.email}</p>
                  {r.success
                    ? <p className="text-[10px] font-mono text-emerald-700 mt-0.5">Senha: {r.password}</p>
                    : <p className="text-[10px] text-red-600 mt-0.5">{r.errorMsg}</p>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resumo do que será criado (só quando sem membros) */}
        {!hasMembersOrResults && (
          <div className="bg-gray-50 rounded-2xl p-3.5 space-y-1 text-xs text-gray-500 border border-gray-100">
            <p className="font-semibold text-gray-600 text-[11px] uppercase tracking-wide mb-2">O que será criado agora</p>
            {pendingCategories.length > 0 ? (
              <p>✓ {pendingCategories.length} categori{pendingCategories.length !== 1 ? 'as' : 'a'}: {pendingCategories.join(', ')}</p>
            ) : (
              <p className="text-gray-400">– Nenhuma categoria (você pulou)</p>
            )}
            <p>✓ 4 produtos demo para explorar o sistema</p>
          </div>
        )}

        {/* Rodapé */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={finish}
            disabled={saving}
            className={`${hasMembersOrResults ? 'flex-1' : 'w-full'} py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm disabled:opacity-60`}
          >
            {hasMembersOrResults ? 'Pular' : 'Pular e configurar depois'}
          </button>
          {hasMembersOrResults && (
            <button
              onClick={finish}
              disabled={saving || successCount === 0}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60 flex items-center justify-center gap-2 transition-opacity"
              style={{ backgroundColor: color }}
            >
              {saving ? 'Configurando...' : 'Criar e continuar'}
              {!saving && <CheckCircle2 size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
