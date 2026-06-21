import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Eye, EyeOff, Lock, MapPin, Palette, Phone } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'

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

export default function Register() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [step, setStep] = useState('loading') // loading | invalid | form | submitting | done
  const [invite, setInvite] = useState(null)
  const [inviteError, setInviteError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    cnpj: '',
    phone: '',
    address: '',
    themeColor: '#3b82f6',
  })

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  useEffect(() => {
    if (!token) {
      setInviteError('Link de convite inválido: token não encontrado na URL.')
      setStep('invalid')
      return
    }

    supabase
      .from('store_invites')
      .select('*')
      .eq('token', token)
      .eq('is_used', false)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setInviteError('Convite inválido ou já utilizado. Solicite um novo link ao administrador.')
          setStep('invalid')
          return
        }
        if (new Date(data.expires_at) < new Date()) {
          setInviteError('Este convite expirou. Solicite um novo link ao administrador.')
          setStep('invalid')
          return
        }
        setInvite(data)
        setForm({
          fullName: data.responsible_name || '',
          email: data.login_email || '',
          password: data.initial_password || '',
          cnpj: data.company_document || '',
          phone: data.whatsapp || '',
          address: data.address || '',
          themeColor: '#3b82f6',
        })
        setStep('form')
      })
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim()) { setSubmitError('E-mail de acesso é obrigatório.'); return }
    if (form.password.length < 6) { setSubmitError('A senha deve ter pelo menos 6 caracteres.'); return }

    setSubmitError('')
    setStep('submitting')

    try {
      // 1. Criar conta auth (ou recuperar se já existir)
      let userId
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.fullName.trim() } },
      })

      if (signUpError) {
        const alreadyExists = signUpError.message.toLowerCase().includes('already')
        if (!alreadyExists) throw signUpError
        // Conta já existe — tenta login com a mesma senha
        const { data: siData, error: siError } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })
        if (siError) throw new Error('E-mail já cadastrado com outra senha. Fale com o administrador.')
        userId = siData.user.id
      } else {
        userId = signUpData.user?.id
        // Se confirmação de e-mail está ativa, session vem null — tenta login imediato
        if (!signUpData.session) {
          const { data: siData, error: siError } = await supabase.auth.signInWithPassword({
            email: form.email.trim(),
            password: form.password,
          })
          if (siError) {
            throw new Error(
              'Conta criada, mas o Supabase exige confirmação por e-mail. ' +
              'Para o fluxo de convite funcionar, desative "Confirm email" em ' +
              'Authentication → Providers → Email no painel Supabase.'
            )
          }
          userId = siData.user.id
        }
      }

      if (!userId) throw new Error('Não foi possível identificar o usuário. Tente novamente.')

      // 2. Completar onboarding via RPC
      const { error: rpcError } = await supabase.rpc('complete_store_onboarding', {
        invite_token: token,
        user_id: userId,
        p_cnpj: form.cnpj.trim() || null,
        p_phone: form.phone.trim() || null,
        p_address: form.address.trim() || null,
        p_theme_color: form.themeColor,
      })

      if (rpcError) throw rpcError

      setStep('done')
      // Reload completo para o App buscar profile + tenant atualizados
      setTimeout(() => window.location.replace('/'), 2000)
    } catch (err) {
      setSubmitError(err.message || 'Erro ao finalizar cadastro. Tente novamente.')
      setStep('form')
    }
  }

  /* ── estados visuais ─────────────────────────────────────── */

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Validando convite...</p>
      </div>
    )
  }

  if (step === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-100 space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <Lock size={24} className="text-red-400" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Convite inválido</h1>
          <p className="text-sm text-slate-500">{inviteError}</p>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-100 space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <Building2 size={24} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Loja criada!</h1>
          <p className="text-sm text-slate-500">Cadastro concluído. Redirecionando para o painel...</p>
        </div>
      </div>
    )
  }

  /* ── formulário ──────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-5">

        <div>
          <h1 className="text-2xl font-black text-slate-900">Cadastro da loja</h1>
          <p className="text-sm text-slate-500 mt-1">
            Convite para: <strong className="text-slate-700">{invite?.store_name}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Nome do responsável">
            <input
              value={form.fullName}
              onChange={set('fullName')}
              placeholder="Seu nome completo"
              className={inputCls}
            />
          </Field>

          <Field label="E-mail de acesso">
            <input
              type="email"
              required
              value={form.email}
              onChange={set('email')}
              placeholder="email@exemplo.com"
              className={inputCls}
            />
          </Field>

          <Field label="Senha" icon={Lock}>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={form.password}
                onChange={set('password')}
                placeholder="Mínimo 6 caracteres"
                className={inputCls + ' pr-11'}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wide font-bold shrink-0">
              Dados da loja (opcional)
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CNPJ">
              <input
                value={form.cnpj}
                onChange={set('cnpj')}
                placeholder="00.000.000/0001-00"
                className={inputCls}
              />
            </Field>
            <Field label="Telefone / WhatsApp" icon={Phone}>
              <input
                value={form.phone}
                onChange={set('phone')}
                placeholder="(00) 00000-0000"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Endereço" icon={MapPin}>
            <input
              value={form.address}
              onChange={set('address')}
              placeholder="Rua, número, bairro, cidade"
              className={inputCls}
            />
          </Field>

          <Field label="Cor do tema" icon={Palette}>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={form.themeColor}
                onChange={set('themeColor')}
                className="w-12 h-12 rounded-2xl border border-slate-200 cursor-pointer p-1 bg-white shrink-0"
              />
              <div
                className="flex-1 h-12 rounded-2xl flex items-center justify-center text-white text-xs font-bold shadow-sm"
                style={{ backgroundColor: form.themeColor }}
              >
                Visualização
              </div>
            </div>
          </Field>

          {submitError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={step === 'submitting'}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 font-bold text-white text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step === 'submitting' ? 'Criando sua loja...' : 'Criar loja e acessar painel'}
          </button>

        </form>
      </div>
    </div>
  )
}
