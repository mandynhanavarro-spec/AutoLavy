import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { isPasswordPwned } from '../../../shared/lib/checkPwnedPassword'

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, icon: Icon, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      {children}
    </div>
  )
}

export default function DefinirSenha() {
  const [sessionReady, setSessionReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [checkingPw, setCheckingPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data?.session) setSessionReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSessionReady(true)
    })

    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  async function handleConfirm(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return }

    setCheckingPw(true)
    const pwnedCount = await isPasswordPwned(password)
    setCheckingPw(false)
    if (pwnedCount > 0) {
      setError(`Essa senha já apareceu em ${pwnedCount.toLocaleString('pt-BR')} vazamentos conhecidos. Escolha outra senha.`)
      return
    }

    setSaving(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (updateErr) { setError(updateErr.message); return }

    setDone(true)
    setTimeout(() => window.location.href = '/superadmin', 2000)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-100 space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Senha definida!</h1>
          <p className="text-sm text-slate-500">Redirecionando para o painel...</p>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Validando convite...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">

        <div>
          <h1 className="text-2xl font-black text-slate-900">Definir senha</h1>
          <p className="text-sm text-slate-500 mt-1">Escolha uma senha para acessar sua conta.</p>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">

          <Field label="Nova senha" icon={Lock}>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={inputCls + ' pr-11'}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label="Confirmar senha" icon={Lock}>
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              className={inputCls}
            />
          </Field>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || checkingPw}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 font-bold text-white text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingPw ? 'Verificando...' : saving ? 'Salvando...' : 'Confirmar senha'}
          </button>

        </form>
      </div>
    </div>
  )
}
