import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, LogOut } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { getVerticalBrand } from '../../../shared/lib/verticalBrand'

function waLink(whatsapp, text) {
  const digits = (whatsapp || '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function WhatsAppButton({ href, children }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm transition-opacity hover:opacity-90 active:opacity-80"
      style={{ backgroundColor: '#25D366' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {children}
    </a>
  )
}

function LogoutButton() {
  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.assign('/login')
  }
  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-red-200 text-red-500 hover:bg-red-50 font-bold text-sm transition-colors"
    >
      <LogOut size={16} />
      Sair da conta
    </button>
  )
}

function Shell({ brandName, iconBg, icon, title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-2xl ${iconBg} flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-gray-900">{title}</h1>
        </div>
        {children}
        <p className="text-xs text-gray-400">{brandName} · Plataforma de Gestão</p>
      </div>
    </div>
  )
}

// ── Dono/admin suspenso: PIX + QR + "Ja paguei" + WhatsApp ────
function OwnerBlockedScreen({ brandName, orgId, userId, situacao }) {
  const [contact, setContact] = useState(null)
  const [lastNotice, setLastNotice] = useState(undefined) // undefined = carregando
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.rpc('get_billing_contact').then(({ data }) => {
      if (active) setContact(Array.isArray(data) ? data[0] : data)
    })
    supabase
      .from('payment_notices')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (active) setLastNotice(data || null) })
    return () => { active = false }
  }, [orgId])

  const isPending = lastNotice?.status === 'pendente'
  const wasRejected = lastNotice?.status === 'recusado'

  async function handleJaPaguei(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    const { data, error: insertError } = await supabase
      .from('payment_notices')
      .insert({
        org_id: orgId,
        user_id: userId,
        amount: amount ? Number(amount) : null,
        note: note.trim() || null,
      })
      .select()
      .single()
    setSending(false)
    if (insertError) {
      if (insertError.code === '23505') {
        setError('Já existe um aviso de pagamento pendente pra essa loja. Aguarde a confirmação.')
      } else {
        setError('Não foi possível enviar o aviso. Tente novamente.')
      }
      return
    }
    setLastNotice(data)
  }

  const whatsappHref = waLink(
    contact?.support_whatsapp,
    `Olá, minha conta ${brandName} está ${situacao === 'cancelado' ? 'cancelada' : 'suspensa'} e preciso de ajuda com o pagamento.`
  )

  return (
    <Shell
      brandName={brandName}
      iconBg="bg-amber-50 border border-amber-200"
      icon={<AlertTriangle size={32} className="text-amber-500" />}
      title={situacao === 'cancelado' ? 'Assinatura encerrada' : 'Conta suspensa'}
    >
      {situacao === 'cancelado' ? (
        <p className="text-sm text-gray-500 leading-relaxed">
          Sua assinatura foi encerrada por falta de pagamento. Seus dados ficam guardados por 90 dias.
          Fale conosco para reativar.
        </p>
      ) : (
        <p className="text-sm text-gray-500 leading-relaxed">
          O acesso à sua conta foi suspenso por falta de pagamento. Regularize para voltar a usar o sistema.
        </p>
      )}

      {lastNotice === undefined ? null : isPending ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-2 text-left">
          <Clock size={16} className="shrink-0 mt-0.5" />
          <span>
            Aviso de pagamento enviado em {new Date(lastNotice.created_at).toLocaleDateString('pt-BR')}.
            Aguardando confirmação do suporte.
          </span>
        </div>
      ) : (
        <>
          {wasRejected && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 text-left space-y-1">
              <p className="font-bold">Seu último aviso de pagamento foi recusado</p>
              <p>{lastNotice.rejection_reason}</p>
            </div>
          )}
          {contact?.pix_key && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Chave PIX</p>
              <p className="text-sm font-mono text-slate-800 break-all">{contact.pix_key}</p>
              {contact.pix_recipient_name && (
                <p className="text-xs text-slate-500">Recebedor: {contact.pix_recipient_name}</p>
              )}
              {contact.qr_code_url && (
                <img src={contact.qr_code_url} alt="QR Code PIX" className="w-40 h-40 mx-auto rounded-xl border border-slate-200" />
              )}
            </div>
          )}

          <form onSubmit={handleJaPaguei} className="space-y-3 text-left">
            <input
              type="number" step="0.01" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Valor pago (opcional)"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <input
              type="text"
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Observação (opcional)"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3.5 font-bold text-white text-sm disabled:opacity-60"
            >
              <CheckCircle2 size={16} />
              {sending ? 'Enviando...' : 'Já paguei'}
            </button>
          </form>
        </>
      )}

      <div className="space-y-3">
        <WhatsAppButton href={whatsappHref}>Falar com suporte via WhatsApp</WhatsAppButton>
        <LogoutButton />
      </div>
    </Shell>
  )
}

// ── Funcionario: so informa e sai ──────────────────────────────
function EmployeeBlockedScreen({ brandName }) {
  return (
    <Shell
      brandName={brandName}
      iconBg="bg-amber-50 border border-amber-200"
      icon={<AlertTriangle size={32} className="text-amber-500" />}
      title="Acesso pausado"
    >
      <p className="text-sm text-gray-500 leading-relaxed">
        O acesso da loja está pausado. Fale com o responsável pela conta para regularizar a situação.
      </p>
      <LogoutButton />
    </Shell>
  )
}

export default function SuspensaoPage({ tenant, profile, session, billingSituacao }) {
  const brand = getVerticalBrand(tenant?.product_id)
  const isOwner = profile?.role === 'admin'

  if (!isOwner) {
    return <EmployeeBlockedScreen brandName={brand.name} />
  }

  return (
    <OwnerBlockedScreen
      brandName={brand.name}
      orgId={tenant?.id}
      userId={session?.user?.id}
      situacao={billingSituacao}
    />
  )
}
