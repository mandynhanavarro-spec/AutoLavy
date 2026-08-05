import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

const codeInputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-center tracking-[0.4em] font-bold outline-none focus:ring-2 focus:ring-blue-500'

export default function MFAGate({ mode = 'required', children }) {
  const [phase, setPhase] = useState('loading') // loading | challenge | enroll | ready
  const [factorId, setFactorId] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    init()
  }, [])

  async function init() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') { setPhase('ready'); return }

    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const verifiedFactor = factorsData?.totp?.find(f => f.status === 'verified')

    if (verifiedFactor) {
      setFactorId(verifiedFactor.id)
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id })
      if (challengeErr) { setError('Não foi possível iniciar a verificação. Recarregue a página.') }
      else { setChallengeId(challengeData.id) }
      setPhase('challenge')
      return
    }

    if (mode === 'optional') { setPhase('ready'); return }

    const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (enrollErr) { setError('Não foi possível iniciar o cadastro do 2FA. Recarregue a página.'); setPhase('enroll'); return }
    setFactorId(enrollData.id)
    setQrCode(enrollData.totp.qr_code)
    setSecret(enrollData.totp.secret)
    setPhase('enroll')
  }

  async function handleVerifyChallenge(e) {
    e.preventDefault()
    setError(''); setSubmitting(true)
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    setSubmitting(false)
    if (verifyErr) { setError('Código inválido, tente novamente.'); setCode(''); return }
    setPhase('ready')
  }

  async function handleConfirmEnroll(e) {
    e.preventDefault()
    setError(''); setSubmitting(true)

    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) { setError('Código inválido, tente novamente.'); setCode(''); setSubmitting(false); return }

    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challengeData.id, code })
    setSubmitting(false)
    if (verifyErr) { setError('Código inválido, tente novamente.'); setCode(''); return }
    setPhase('ready')
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Verificando autenticação...</p>
      </div>
    )
  }

  if (phase === 'ready') return children

  if (phase === 'challenge') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-blue-500" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-900">Verificação em duas etapas</h1>
            <p className="text-sm text-slate-500 mt-1">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
          </div>

          <form onSubmit={handleVerifyChallenge} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className={codeInputCls}
            />

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Verificando...' : 'Verificar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // phase === 'enroll'
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-black text-slate-900">Ative a verificação em duas etapas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Obrigatório para contas de SuperAdmin. Escaneie o QR code com o Google Authenticator, Authy ou similar.
          </p>
        </div>

        {qrCode && (
          <div className="flex justify-center">
            <img src={qrCode} alt="QR code para configurar 2FA" className="w-48 h-48 rounded-2xl border border-slate-100" />
          </div>
        )}

        {secret && (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide font-bold mb-1">Não consegue escanear? Digite manualmente</p>
            <p className="text-sm font-mono font-bold text-slate-700 break-all">{secret}</p>
          </div>
        )}

        <form onSubmit={handleConfirmEnroll} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={codeInputCls}
          />

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Confirmando...' : 'Confirmar'}
          </button>
        </form>
      </div>
    </div>
  )
}
