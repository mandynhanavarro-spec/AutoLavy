import { useEffect, useState } from 'react'
import { CreditCard, FileText, KeyRound, Lock, Plus, Settings2, Shield, X } from 'lucide-react'
import { supabase } from '../../../shared/lib/supabase'
import { isPasswordPwned } from '../../../shared/lib/checkPwnedPassword'

const BILLING_SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

/* ── constants ─────────────────────────────────────────────── */

const PROVIDER_OPTIONS = ['stripe', 'mercado_pago', 'asaas', 'pagarme']

const initialAdminForm = { name: '', email: '', profile: 'administrador' }

const STATUS_CLASSES = {
  ativo:     'bg-emerald-100 text-emerald-700',
  ativa:     'bg-emerald-100 text-emerald-700',
  pago:      'bg-emerald-100 text-emerald-700',
  pendente:  'bg-amber-100 text-amber-700',
  atrasado:  'bg-rose-100 text-rose-700',
  suspenso:  'bg-orange-100 text-orange-700',
  suspensa:  'bg-orange-100 text-orange-700',
  cancelado: 'bg-slate-100 text-slate-500',
  cancelada: 'bg-slate-100 text-slate-500',
  bloqueado: 'bg-rose-100 text-rose-700',
  inativo:   'bg-slate-100 text-slate-500',
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-rose-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
]

const inp = 'w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm'

const getErrorMessage = (err, fb) => err?.message || fb

/* ── sub-components ─────────────────────────────────────────── */

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_CLASSES[value] || 'bg-slate-100 text-slate-500'}`}>
      {String(value || 'n/a').replace(/_/g, ' ')}
    </span>
  )
}

function Avatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase()
  const cls = AVATAR_COLORS[name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0]
  return (
    <div className={`w-9 h-9 rounded-xl ${cls} flex items-center justify-center text-white font-black text-sm shrink-0`}>
      {letter}
    </div>
  )
}

/* ── component ─────────────────────────────────────────────── */

export default function ConfiguracoesTab({
  admins, logs, gatewayConfigs, gatewayDraft, setGatewayDraft,
  loading, loadAdminData, showSuccess, showError, startAction, finishAction, isActionRunning,
}) {
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminForm, setAdminForm]           = useState(initialAdminForm)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving]     = useState(false)
  const [pwChecking, setPwChecking] = useState(false)
  const [pwError, setPwError]       = useState('')
  const [pwSuccess, setPwSuccess]   = useState(false)

  const [billing, setBilling] = useState({
    pix_key: '', pix_recipient_name: '', qr_code_url: '', support_whatsapp: '',
    trial_days: '15', annual_months_charged: '10',
  })
  const [billingLoading, setBillingLoading] = useState(true)
  const [qrUploading, setQrUploading] = useState(false)

  useEffect(() => {
    supabase.from('saas_billing_settings').select('*').eq('id', BILLING_SETTINGS_ID).single()
      .then(({ data }) => {
        if (data) setBilling({
          pix_key: data.pix_key || '', pix_recipient_name: data.pix_recipient_name || '',
          qr_code_url: data.qr_code_url || '', support_whatsapp: data.support_whatsapp || '',
          trial_days: String(data.trial_days ?? 15), annual_months_charged: String(data.annual_months_charged ?? 10),
        })
        setBillingLoading(false)
      })
  }, [])

  const handleSaveBilling = async () => {
    const key = 'save-billing'; startAction(key)
    try {
      const { error } = await supabase.from('saas_billing_settings').update({
        pix_key: billing.pix_key.trim() || null,
        pix_recipient_name: billing.pix_recipient_name.trim() || null,
        qr_code_url: billing.qr_code_url || null,
        support_whatsapp: billing.support_whatsapp.replace(/\D/g, '') || null,
        trial_days: Number(billing.trial_days) || 0,
        annual_months_charged: Number(billing.annual_months_charged) || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', BILLING_SETTINGS_ID)
      if (error) throw new Error(getErrorMessage(error, 'Erro ao salvar configuração de cobrança.'))
      showSuccess('Configuração de cobrança salva.')
    } catch (err) { showError(err, 'Erro ao salvar configuração de cobrança.') }
    finally { finishAction() }
  }

  const handleQrUpload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrUploading(true)
    try {
      const path = `qr-code-${Date.now()}.${file.name.split('.').pop()}`
      const { error: upErr } = await supabase.storage.from('billing-assets').upload(path, file, { upsert: true })
      if (upErr) throw new Error(getErrorMessage(upErr, 'Erro ao enviar imagem.'))
      const { data: pub } = supabase.storage.from('billing-assets').getPublicUrl(path)
      setBilling(prev => ({ ...prev, qr_code_url: pub.publicUrl }))
      showSuccess('QR Code enviado. Clique em Salvar para confirmar.')
    } catch (err) { showError(err, 'Erro ao enviar imagem.') }
    finally { setQrUploading(false); e.target.value = '' }
  }

  const handleSaveAdmin = async e => {
    e.preventDefault(); startAction('submit-admin')
    try {
      const { data, error } = await supabase.functions.invoke('create-administrator', {
        body: {
          name: adminForm.name.trim(),
          email: adminForm.email.trim().toLowerCase(),
          profile: adminForm.profile,
          redirectTo: `${window.location.origin}/definir-senha`,
        },
      })
      if (error || data?.error) throw new Error(data?.error || getErrorMessage(error, 'Erro ao criar administrador.'))
      await loadAdminData(); setAdminForm(initialAdminForm); setShowAdminModal(false)
      showSuccess('Administrador criado. Um e-mail de convite foi enviado para definir a senha.')
    } catch (err) { showError(err, 'Erro ao criar administrador.') }
    finally { finishAction() }
  }

  const handleGatewayChange = async (provider, secretKey) => {
    const key = `gateway-${provider}`; startAction(key)
    try {
      const { error } = await supabase.from('saas_gateway_configs').upsert(
        { provider, secret_key: secretKey, is_enabled: Boolean(secretKey) }, { onConflict: 'provider' }
      )
      if (error) throw new Error(getErrorMessage(error, `Erro ao salvar ${provider}.`))
      await loadAdminData(); showSuccess(`Gateway ${provider} salvo.`)
    } catch (err) { showError(err, `Erro ao salvar ${provider}.`) }
    finally { finishAction() }
  }

  const handleChangeMyPassword = async e => {
    e.preventDefault()
    setPwError(''); setPwSuccess(false)

    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser?.email) { setPwError('Não foi possível identificar o usuário.'); return }

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: currentUser.email, password: currentPassword,
    })
    if (authErr) { setPwError('Senha atual incorreta.'); return }

    if (newPassword.length < 6) { setPwError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (newPassword !== confirmPassword) { setPwError('As senhas não coincidem.'); return }

    setPwChecking(true)
    const pwnedCount = await isPasswordPwned(newPassword)
    setPwChecking(false)
    if (pwnedCount > 0) {
      setPwError(`Essa senha já apareceu em ${pwnedCount.toLocaleString('pt-BR')} vazamentos conhecidos. Escolha outra.`)
      return
    }

    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)

    if (error) { setPwError(getErrorMessage(error, 'Não foi possível trocar a senha.')); return }

    setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPwSuccess(true)
    showSuccess('Senha alterada com sucesso.')
    setTimeout(() => setPwSuccess(false), 3000)
  }

  /* ── render ──────────────────────────────────────────────── */

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {/* ── Administradores ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-900 text-sm">Administradores</h3>
              <button onClick={() => setShowAdminModal(true)} className="rounded-xl bg-[#7c3aed] text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 hover:bg-[#6d28d9] transition-colors">
                <Plus size={13} />Novo
              </button>
            </div>
            <div className="space-y-2">
              {admins.map(a => (
                <div key={a.id} className="rounded-xl bg-gray-50 p-4 flex items-center gap-3">
                  <Avatar name={a.name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{a.name}</p>
                    <p className="text-xs text-gray-400 truncate">{a.email}</p>
                  </div>
                  <StatusBadge value={a.is_active ? 'ativo' : 'inativo'} />
                </div>
              ))}
              {!loading && admins.length === 0 && (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">Nenhum administrador.</div>
              )}
            </div>
          </div>

          {/* ── Segurança (bloco estático) ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-900 text-sm mb-4">Segurança</h3>
            <div className="space-y-2">
              {[
                { Icon: Shield, label: 'Tempo de sessão', value: '8 horas', sub: 'Controle centralizado' },
                { Icon: KeyRound, label: 'Política de senha', value: 'Ativa', sub: 'Mín. 8 caracteres + recuperação' },
                { Icon: Lock, label: 'Autenticação 2FA', value: 'Preparado', sub: 'Ativação futura' },
              ].map(({ Icon, label, value, sub }) => (
                <div key={label} className="rounded-xl bg-gray-50 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center">
                      <Icon size={15} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500 shrink-0">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Trocar minha senha ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-900 text-sm mb-4">Trocar minha senha</h3>
            <form onSubmit={handleChangeMyPassword} className="space-y-3">
              <input type="password" placeholder="Senha atual" className={inp} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <input type="password" placeholder="Nova senha" className={inp} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <input type="password" placeholder="Confirmar nova senha" className={inp} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              {pwError && (
                <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{pwError}</p>
              )}
              <button
                type="submit"
                disabled={pwChecking || pwSaving || !currentPassword || !newPassword}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors"
                style={{ backgroundColor: pwSuccess ? '#10b981' : '#1e1b4b' }}
              >
                {pwSuccess ? 'Senha alterada!' : pwChecking ? 'Verificando...' : pwSaving ? 'Salvando...' : 'Alterar senha'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          {/* ── Cobrança (PIX/QR/WhatsApp) ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={16} className="text-gray-400" />
              <h3 className="font-black text-gray-900 text-sm">Cobrança</h3>
            </div>
            {billingLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-3">
                <input type="text" placeholder="Chave PIX" className={inp}
                  value={billing.pix_key} onChange={e => setBilling({ ...billing, pix_key: e.target.value })} />
                <input type="text" placeholder="Nome do recebedor" className={inp}
                  value={billing.pix_recipient_name} onChange={e => setBilling({ ...billing, pix_recipient_name: e.target.value })} />
                <input type="text" placeholder="WhatsApp de suporte (só números, com DDI)" className={inp}
                  value={billing.support_whatsapp} onChange={e => setBilling({ ...billing, support_whatsapp: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Dias de teste</label>
                    <input type="number" min="0" className={inp}
                      value={billing.trial_days} onChange={e => setBilling({ ...billing, trial_days: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Meses cobrados no anual</label>
                    <input type="number" min="1" max="12" className={inp}
                      value={billing.annual_months_charged} onChange={e => setBilling({ ...billing, annual_months_charged: e.target.value })} />
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">QR Code PIX</label>
                  {billing.qr_code_url && (
                    <img src={billing.qr_code_url} alt="QR Code atual" className="w-28 h-28 rounded-lg border border-gray-200" />
                  )}
                  <input type="file" accept="image/*" onChange={handleQrUpload} disabled={qrUploading}
                    className="text-xs text-gray-500" />
                  {qrUploading && <p className="text-xs text-gray-400">Enviando...</p>}
                </div>
                <button type="button" disabled={isActionRunning('save-billing')} onClick={handleSaveBilling}
                  className="w-full rounded-xl bg-[#1e1b4b] hover:bg-[#2d2878] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors">
                  {isActionRunning('save-billing') ? 'Salvando...' : 'Salvar configuração de cobrança'}
                </button>
              </div>
            )}
          </div>

          {/* ── Gateways e Tokens ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Settings2 size={16} className="text-gray-400" />
              <h3 className="font-black text-gray-900 text-sm">Gateways e Tokens</h3>
            </div>
            <div className="space-y-3">
              {PROVIDER_OPTIONS.map(provider => (
                <div key={provider} className="rounded-xl bg-gray-50 p-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    {provider.replace('_', ' ')}
                  </label>
                  <div className="flex gap-2">
                    <input type="text" className="flex-1 rounded-xl bg-white border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                      value={gatewayDraft[provider] || ''} onChange={e => setGatewayDraft(prev => ({ ...prev, [provider]: e.target.value }))} placeholder="Token / API Key" />
                    <button type="button" disabled={isActionRunning(`gateway-${provider}`)} onClick={() => handleGatewayChange(provider, gatewayDraft[provider] || '')}
                      className="rounded-xl bg-[#1e1b4b] hover:bg-[#2d2878] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors">
                      {isActionRunning(`gateway-${provider}`) ? '...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Logs do Sistema ── */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-gray-400" />
              <h3 className="font-black text-gray-900 text-sm">Logs do Sistema</h3>
            </div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {logs.map(log => (
                <div key={log.id} className="rounded-xl bg-gray-50 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-gray-900 text-sm">{log.action}</p>
                    <span className="text-[10px] text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{log.description || 'Sem descrição.'}</p>
                </div>
              ))}
              {!loading && logs.length === 0 && (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">Nenhum log.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* admin modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900">Novo Administrador</h3>
              <button onClick={() => setShowAdminModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveAdmin} className="space-y-4">
              <input required placeholder="Nome" className={inp} value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} />
              <input required type="email" placeholder="E-mail" className={inp} value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} />
              <select className={inp} value={adminForm.profile} onChange={e => setAdminForm({ ...adminForm, profile: e.target.value })}>
                <option value="super_admin">Super Admin</option>
                <option value="administrador">Administrador</option>
              </select>
              <button type="submit" disabled={isActionRunning('submit-admin')} className="w-full py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-2xl shadow-lg disabled:opacity-60 transition-colors">
                {isActionRunning('submit-admin') ? 'Salvando...' : 'Salvar Administrador'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
