import { useEffect, useState } from 'react'
import { X, History } from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { PERM_LABELS } from '../../../../core/hooks/usePermissions'

const ROLE_NAMES = { operador: 'Operador', gerente: 'Gerente', admin: 'Admin', superadmin: 'Suporte' }
const STATUS_NAMES = { ativo: 'ativo', bloqueado: 'bloqueado', excluido: 'excluído' }

const PERIODS = [
  { key: '7',   label: 'Últimos 7 dias' },
  { key: '30',  label: 'Últimos 30 dias' },
  { key: '90',  label: 'Últimos 90 dias' },
  { key: 'all', label: 'Tudo' },
]

const selectCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 bg-white'

function brl(value) {
  if (value == null || value === '') return 'sem preço'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtWhen(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Uma linha do change_log em frase simples, sem termos técnicos. */
export function describeChange(row) {
  const who  = row.user_name || 'Sistema'
  const name = row.entity_name || 'item'

  if (row.entity === 'produto' || row.entity === 'variacao') {
    const isVar = row.entity === 'variacao'
    switch (row.field) {
      case 'preco':
        return `${who} alterou o preço de ${name} de ${brl(row.old_value)} para ${brl(row.new_value)}`
      case 'custo':
        return `${who} alterou o custo de ${name} de ${brl(row.old_value)} para ${brl(row.new_value)}`
      case 'criado':
        return isVar
          ? `${who} criou a variação ${name}${row.new_value ? ` por ${brl(row.new_value)}` : ''}`
          : `${who} cadastrou ${name}${row.new_value ? ` por ${brl(row.new_value)}` : ''}`
      case 'arquivado':
        return `${who} arquivou ${name}`
      case 'reativado':
        return `${who} reativou ${name}`
      case 'excluido':
        return isVar ? `${who} excluiu a variação ${name}` : `${who} excluiu ${name}`
      default:
        return `${who} alterou ${name}`
    }
  }

  // funcionário
  if (row.field === 'cargo') {
    return `${who} mudou o cargo de ${name} de ${ROLE_NAMES[row.old_value] || row.old_value} para ${ROLE_NAMES[row.new_value] || row.new_value}`
  }
  if (row.field === 'situacao') {
    if (row.new_value === 'bloqueado') return `${who} bloqueou o acesso de ${name}`
    if (row.new_value === 'excluido')  return `${who} excluiu ${name} da equipe`
    if (row.new_value === 'ativo')     return `${who} reativou o acesso de ${name}`
    return `${who} mudou a situação de ${name} para ${STATUS_NAMES[row.new_value] || row.new_value}`
  }
  if (row.field?.startsWith('permissao:')) {
    const label = PERM_LABELS[row.field.slice('permissao:'.length)] || 'uma permissão'
    return row.new_value === 'sim'
      ? `${who} liberou "${label}" para ${name}`
      : `${who} retirou "${label}" de ${name}`
  }
  return `${who} alterou ${name}`
}

/*
 * Histórico de alterações (change_log) -- só admin. O banco só deixa ler o
 * admin da própria loja e o superadmin; ninguém altera nem apaga.
 */
export default function ChangeHistoryModal({ orgId, products, color, onClose }) {
  const [rows, setRows]         = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [productId, setProductId] = useState('')
  const [userId, setUserId]     = useState('')
  const [period, setPeriod]     = useState('30')

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId).order('full_name')
      .then(({ data }) => setMembers(data || []))
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let query = supabase
        .from('change_log')
        .select('id, user_name, entity, entity_id, entity_name, field, old_value, new_value, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(300)

      if (userId) query = query.eq('user_id', userId)
      if (period !== 'all') {
        const since = new Date()
        since.setDate(since.getDate() - Number(period))
        query = query.gte('created_at', since.toISOString())
      }
      if (productId) {
        // o produto e as variações dele
        const { data: vars } = await supabase.from('product_variants')
          .select('id').eq('product_id', productId).eq('org_id', orgId)
        const ids = [productId, ...(vars || []).map(v => v.id)]
        query = query.in('entity_id', ids)
      }

      const { data } = await query
      if (cancelled) return
      setRows(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [orgId, productId, userId, period])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={18} style={{ color }} />
            <h2 className="text-lg font-black text-gray-900">Histórico de alterações</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={productId} onChange={e => setProductId(e.target.value)} className={selectCls}>
            <option value="">Todos os produtos</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={userId} onChange={e => setUserId(e.target.value)} className={selectCls}>
            <option value="">Todos os funcionários</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || 'Sem nome'}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className={selectCls}>
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto -mx-1 px-1 space-y-2 flex-1">
          {loading ? (
            [1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma alteração neste período.</p>
          ) : (
            rows.map(r => (
              <div key={r.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-sm text-gray-800">{describeChange(r)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{fmtWhen(r.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
