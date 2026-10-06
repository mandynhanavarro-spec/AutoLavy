import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, MessageCircle, Shield } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { useTenantContext } from '../../contexts/TenantContext'
import { billingStatusMeta } from '../../../shared/lib/billingStatus'
import { BILLING_CYCLE_LABEL } from '../../../shared/lib/billingCycle'

function waLink(whatsapp, text) {
  const digits = (whatsapp || '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function UsageBar({ label, used, max }) {
  const hasLimit = typeof max === 'number' && max > 0
  const pct = hasLimit ? Math.min(100, Math.round((used / max) * 100)) : 0
  const danger = hasLimit && used >= max
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-bold ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
          {used}{hasLimit ? ` de ${max}` : ''}
        </span>
      </div>
      {hasLimit && (
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${danger ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function MeuPlano() {
  const { tenant, profile } = useTenantContext()
  const [plan, setPlan] = useState(null)
  const [usage, setUsage] = useState(null)
  const [status, setStatus] = useState(null)
  const [comparison, setComparison] = useState([])
  const [contact, setContact] = useState(null)
  const [lastNotice, setLastNotice] = useState(undefined)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [noticeError, setNoticeError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant?.id) return
    let active = true
    setLoading(true)

    async function load() {
      const [planRes, usageRes, statusRes, cmpRes, contactRes, noticeRes] = await Promise.all([
        supabase.rpc('get_my_plan'),
        supabase.rpc('get_org_usage', { p_org_id: tenant.id }),
        supabase.rpc('get_billing_status', { p_org_id: tenant.id }),
        supabase.rpc('get_plan_comparison'),
        supabase.rpc('get_billing_contact'),
        supabase.from('payment_notices').select('*').eq('org_id', tenant.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!active) return
      setPlan(Array.isArray(planRes.data) ? planRes.data[0] : planRes.data)
      setUsage(Array.isArray(usageRes.data) ? usageRes.data[0] : usageRes.data)
      setStatus(Array.isArray(statusRes.data) ? statusRes.data[0] : statusRes.data)
      setComparison(cmpRes.data || [])
      setContact(Array.isArray(contactRes.data) ? contactRes.data[0] : contactRes.data)
      setLastNotice(noticeRes.data || null)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [tenant?.id])

  async function handleJaPaguei(e) {
    e.preventDefault()
    setSending(true)
    setNoticeError('')
    const { data, error } = await supabase
      .from('payment_notices')
      .insert({
        org_id: tenant.id,
        user_id: profile?.id,
        amount: amount ? Number(amount) : null,
        note: note.trim() || null,
      })
      .select()
      .single()
    setSending(false)
    if (error) {
      setNoticeError(
        error.code === '23505'
          ? 'Já existe um aviso de pagamento pendente. Aguarde a confirmação.'
          : 'Não foi possível enviar o aviso. Tente novamente.'
      )
      return
    }
    setLastNotice(data)
  }

  const isPending = lastNotice?.status === 'pendente'
  const wasRejected = lastNotice?.status === 'recusado'

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Shield size={28} className="text-gray-300" />
        </div>
        <p className="font-bold text-gray-700">Acesso restrito</p>
        <p className="text-sm text-gray-400">Apenas o dono/admin da loja pode ver o plano e o pagamento.</p>
      </div>
    )
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Carregando...</div>
  }

  const meta = billingStatusMeta(status?.situacao)
  const mudarPlanoHref = waLink(
    contact?.support_whatsapp,
    `Olá! Sou da loja "${tenant?.name || ''}" e quero mudar de plano.`
  )
  const cycle = plan?.billing_cycle || 'mensal'
  const cycleMeta = BILLING_CYCLE_LABEL[cycle] || BILLING_CYCLE_LABEL.mensal
  const cycleAmount = plan?.billing_amount != null ? plan.billing_amount : plan?.plan_price
  const mudarAnualHref = waLink(
    contact?.support_whatsapp,
    `Olá! Sou da loja "${tenant?.name || ''}" e quero mudar para o plano anual.`
  )

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl">
      <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Plano atual</p>
            <h1 className="text-2xl font-black text-slate-900">{plan?.plan_name || 'Sem plano'}</h1>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Cobrança</p>
            <p className="font-bold text-slate-800">
              {cycleAmount != null ? `${cycleMeta.label} · R$ ${Number(cycleAmount).toFixed(2)}${cycleMeta.suffix}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">
              {status?.situacao === 'teste' ? 'Período de teste até' : 'Próximo vencimento'}
            </p>
            <p className="font-bold text-slate-800">
              {status?.due_date ? new Date(status.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
        </div>

        {usage && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <UsageBar label="Produtos" used={usage.produtos_usados} max={usage.produtos_max} />
            <UsageBar
              label={usage.usuarios_max ? `Você + equipe` : 'Equipe'}
              used={usage.usuarios_usados}
              max={usage.usuarios_max}
            />
            <UsageBar label="Caixas" used={usage.caixas_usados} max={usage.caixas_max} />
          </div>
        )}
      </div>

      {(status?.situacao === 'vence_em_breve' || status?.situacao === 'atrasado') && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <Clock size={16} className="shrink-0 mt-0.5" />
          <span>
            {status.situacao === 'atrasado'
              ? `Pagamento em atraso há ${status.dias_atraso} dia(s). Regularize para evitar a suspensão da conta.`
              : `Seu plano vence em ${status.dias_para_vencer} dia(s).`}
          </span>
        </div>
      )}

      {/* Pagamento */}
      <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Pagamento</h2>
        {isPending ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
            <Clock size={16} className="shrink-0 mt-0.5" />
            <span>
              Aviso enviado em {new Date(lastNotice.created_at).toLocaleDateString('pt-BR')}. Aguardando confirmação.
            </span>
          </div>
        ) : (
          <>
            {wasRejected && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 space-y-1">
                <p className="font-bold">Seu último aviso de pagamento foi recusado</p>
                <p>{lastNotice.rejection_reason}</p>
              </div>
            )}
            {contact?.pix_key && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Chave PIX</p>
                <p className="text-sm font-mono text-slate-800 break-all">{contact.pix_key}</p>
                {contact.pix_recipient_name && (
                  <p className="text-xs text-slate-500">Recebedor: {contact.pix_recipient_name}</p>
                )}
                {contact.qr_code_url && (
                  <img src={contact.qr_code_url} alt="QR Code PIX" className="w-36 h-36 rounded-xl border border-slate-200" />
                )}
              </div>
            )}
            <form onSubmit={handleJaPaguei} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="number" step="0.01" min="0"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="Valor pago (opcional)"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <input
                  type="text"
                  value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Observação (opcional)"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              {noticeError && <p className="text-sm text-rose-600">{noticeError}</p>}
              <button
                type="submit"
                disabled={sending}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3 font-bold text-white text-sm disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                {sending ? 'Enviando...' : 'Já paguei'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Comparação de planos */}
      {comparison.length > 0 && (
        <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-sm space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Planos disponíveis</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {comparison.map((p) => (
              <div
                key={p.plan_id}
                className={`rounded-2xl border p-4 space-y-1 ${p.plan_id === plan?.plan_id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}
              >
                <p className="font-bold text-slate-900 text-sm">{p.plan_name}</p>
                <p className="text-xs text-slate-500">R$ {Number(p.plan_price || 0).toFixed(2)}/mês</p>
                <p className="text-xs text-slate-400">
                  {p.max_products ?? '∞'} produtos · {p.max_users ?? '∞'} usuários
                </p>
                {p.plan_id === plan?.plan_id && (
                  <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Plano atual
                  </span>
                )}
              </div>
            ))}
          </div>
          {mudarPlanoHref && (
            <a
              href={mudarPlanoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-4 py-3 font-bold text-sm transition-colors"
            >
              <MessageCircle size={16} />
              Quero mudar de plano
            </a>
          )}
          {cycle === 'mensal' && mudarAnualHref && (
            <a
              href={mudarAnualHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-3 font-bold text-sm transition-colors"
            >
              <MessageCircle size={16} />
              Quero mudar para o plano anual
            </a>
          )}
        </div>
      )}
    </div>
  )
}
