import { useState, useEffect } from 'react'
import {
  Users, UserPlus, UserX, UserCheck,
  Shield, ChevronDown, Copy, Check,
  KeyRound, RefreshCw, X, ChevronRight,
  Sliders, RotateCcw,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { PERM_LABELS, ALL_PERM_KEYS, DEFAULT_PERMISSIONS } from '../../../../core/hooks/usePermissions'

/* ── constants ───────────────────────────────────────────── */

const ROLES = [
  { key: 'operador', label: 'Operador' },
  { key: 'gerente',  label: 'Gerente'  },
  { key: 'admin',    label: 'Admin'    },
]

const ROLE_STYLE = {
  operador:   'bg-gray-100   text-gray-600',
  gerente:    'bg-blue-100   text-blue-700',
  admin:      'bg-purple-100 text-purple-700',
  superadmin: 'bg-red-100    text-red-600',
}

const ROLE_LABEL = {
  operador: 'Operador', gerente: 'Gerente', admin: 'Admin', superadmin: 'Super Admin',
}

/* ── helpers ─────────────────────────────────────────────── */

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

function parseInvokeError(data, error) {
  const raw = data?.error || error?.message || 'Erro desconhecido.'
  if (raw.includes('404') || raw.includes('not found') || raw.toLowerCase().includes('edge function')) {
    return 'Edge Function não encontrada. Faça o deploy no Supabase antes de usar esta função.'
  }
  return raw
}

/* ── CopyBtn ─────────────────────────────────────────────── */

function CopyBtn({ text, color }) {
  const [done, setDone] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
      style={{ color, backgroundColor: color + '18' }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

/* ── PermissionToggles ───────────────────────────────────── */

function PermissionToggles({ perms, onChange, color }) {
  return (
    <div className="space-y-2">
      {ALL_PERM_KEYS.map(key => (
        <label key={key} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 cursor-pointer">
          <span className="text-sm text-gray-700">{PERM_LABELS[key]}</span>
          <button
            type="button"
            onClick={() => onChange({ ...perms, [key]: !perms[key] })}
            className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${perms[key] ? '' : 'bg-gray-200'}`}
            style={perms[key] ? { backgroundColor: color } : {}}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${perms[key] ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </button>
        </label>
      ))}
    </div>
  )
}

/* ── component ───────────────────────────────────────────── */

export default function Equipe() {
  const { tenant, profile } = useTenantContext()
  const orgId   = tenant?.id
  const orgSlug = tenant?.slug || ''
  const color   = '#f97316'
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'

  /* member list */
  const [members, setMembers]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [updatingRole, setUpdatingRole] = useState(null)
  const [toggling, setToggling]         = useState(null)

  /* templates */
  const [templates, setTemplates] = useState([])

  /* new employee modal */
  const [empOpen, setEmpOpen]     = useState(false)
  const [empName, setEmpName]     = useState('')
  const [empHandle, setEmpHandle] = useState('')
  const [empRole, setEmpRole]     = useState('operador')
  const [empPass, setEmpPass]     = useState(() => genPassword())
  const [empLoading, setEmpLoading] = useState(false)
  const [empError, setEmpError]   = useState('')
  const [empDone, setEmpDone]     = useState(null)
  const [empTemplate, setEmpTemplate] = useState('')
  const [empPerms, setEmpPerms]   = useState({ ...DEFAULT_PERMISSIONS })
  const [showPerms, setShowPerms] = useState(false)

  /* edit employee drawer */
  const [editTarget, setEditTarget]   = useState(null) /* member object */
  const [editPerms, setEditPerms]     = useState({ ...DEFAULT_PERMISSIONS })
  const [editRole, setEditRole]       = useState('operador')
  const [editTemplate, setEditTemplate] = useState('')
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')

  /* reset password modal */
  const [rstTarget, setRstTarget] = useState(null)
  const [rstPass, setRstPass]     = useState('')
  const [rstLoading, setRstLoading] = useState(false)
  const [rstError, setRstError]   = useState('')
  const [rstDone, setRstDone]     = useState(false)

  /* load members */
  async function load() {
    if (!orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, access_status, permissions')
      .eq('org_id', orgId)
      .order('role')
    setMembers(data || [])
    setLoading(false)
  }

  /* load templates */
  async function loadTemplates() {
    const { data } = await supabase
      .from('role_templates')
      .select('id, name, description, base_role, permissions, is_default')
      .or('org_id.is.null,org_id.eq.' + (orgId || '00000000-0000-0000-0000-000000000000'))
      .order('is_default', { ascending: false })
    setTemplates(data || [])
  }

  useEffect(() => { load() }, [orgId])
  useEffect(() => { if (orgId) loadTemplates() }, [orgId])

  /* update role */
  async function updateRole(memberId, newRole) {
    setUpdatingRole(memberId)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('org_id', orgId)
    setUpdatingRole(null)
    if (!error) setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
  }

  /* toggle active/blocked */
  async function toggleStatus(member) {
    const next = member.access_status === 'bloqueado' ? 'ativo' : 'bloqueado'
    const verb = next === 'bloqueado' ? 'Desativar' : 'Reativar'
    if (!window.confirm(`${verb} "${member.full_name || 'este membro'}"?`)) return
    setToggling(member.id)
    const { error } = await supabase
      .from('profiles')
      .update({ access_status: next })
      .eq('id', member.id)
      .eq('org_id', orgId)
    setToggling(null)
    if (!error) setMembers(prev => prev.map(m => m.id === member.id ? { ...m, access_status: next } : m))
  }

  /* apply template to perm state */
  function applyTemplate(templateId, setPerms) {
    const tpl = templates.find(t => t.id === templateId)
    if (tpl?.permissions) setPerms({ ...DEFAULT_PERMISSIONS, ...tpl.permissions })
  }

  /* create employee via Edge Function */
  async function createEmployee() {
    const handle = empHandle.trim().toLowerCase()
    if (!empName.trim() || !handle) { setEmpError('Nome e login são obrigatórios.'); return }
    if (!/^[a-z0-9_-]+$/.test(handle)) { setEmpError('Login: use apenas letras minúsculas, números, _ ou -'); return }

    setEmpError('')
    setEmpLoading(true)
    const { data, error } = await supabase.functions.invoke('create-employee', {
      body: { name: empName.trim(), handle, role: empRole, password: empPass, orgId, permissions: empPerms },
    })
    setEmpLoading(false)

    if (error || data?.error) { setEmpError(parseInvokeError(data, error)); return }

    setEmpDone({ email: data.email, password: empPass })
    load()
  }

  /* open edit drawer */
  function openEdit(member) {
    setEditTarget(member)
    setEditRole(member.role)
    setEditPerms({ ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) })
    setEditTemplate('')
    setEditError('')
  }

  /* save edit */
  async function saveEdit() {
    if (!editTarget) return
    setEditSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role: editRole, permissions: editPerms })
      .eq('id', editTarget.id)
      .eq('org_id', orgId)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setMembers(prev => prev.map(m => m.id === editTarget.id ? { ...m, role: editRole, permissions: editPerms } : m))
    setEditTarget(null)
  }

  /* reset to template in edit */
  function resetToTemplate() {
    if (!editTemplate) return
    applyTemplate(editTemplate, setEditPerms)
  }

  /* open reset password modal */
  function openReset(member) {
    setRstTarget(member)
    setRstPass(genPassword())
    setRstError('')
    setRstDone(false)
  }

  /* reset password via Edge Function */
  async function doReset() {
    if (!rstTarget) return
    setRstLoading(true)
    const { data, error } = await supabase.functions.invoke('reset-employee-password', {
      body: { memberId: rstTarget.id, password: rstPass },
    })
    setRstLoading(false)
    if (error || data?.error) { setRstError(parseInvokeError(data, error)); return }
    setRstDone(true)
  }

  /* close helpers */
  function closeEmp() {
    setEmpOpen(false)
    setTimeout(() => {
      setEmpName(''); setEmpHandle(''); setEmpRole('operador')
      setEmpPass(genPassword()); setEmpError(''); setEmpDone(null)
      setEmpTemplate(''); setEmpPerms({ ...DEFAULT_PERMISSIONS }); setShowPerms(false)
    }, 200)
  }
  function closeRst() { setRstTarget(null); setRstDone(false); setRstError('') }

  /* ── access guard ─────────────────────────────────────── */
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Shield size={28} className="text-gray-300" />
        </div>
        <p className="font-bold text-gray-700">Acesso restrito</p>
        <p className="text-sm text-gray-400">Apenas administradores podem gerenciar a equipe.</p>
      </div>
    )
  }

  const emailPreview = empHandle
    ? `${empHandle.toLowerCase()}@${orgSlug}.local`
    : `login@${orgSlug}.local`

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Equipe</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? '...' : `${members.length} membro${members.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setEmpOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
          style={{ backgroundColor: color }}
        >
          <UserPlus size={15} />
          Novo funcionário
        </button>
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-[68px] bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Users size={36} className="text-gray-300" />
          <p className="text-sm text-gray-400 font-medium">Nenhum funcionário ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => {
            const isSelf   = m.id === profile?.id
            const isActive = m.access_status !== 'bloqueado'
            const isSA     = m.role === 'superadmin'

            return (
              <div
                key={m.id}
                className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 transition-opacity ${!isActive ? 'opacity-55' : ''}`}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0"
                  style={{ backgroundColor: isActive ? color : '#9ca3af' }}
                >
                  {(m.full_name || '?').charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {m.full_name || 'Sem nome'}
                    </span>
                    {isSelf && <span className="text-[10px] text-gray-400">(você)</span>}
                    {!isActive && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-100 text-red-500 rounded-md">
                        bloqueado
                      </span>
                    )}
                  </div>

                  {/* Role */}
                  <div className="mt-1.5">
                    {isSelf || isSA ? (
                      <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-lg ${ROLE_STYLE[m.role] || ROLE_STYLE.operador}`}>
                        {ROLE_LABEL[m.role] || m.role}
                      </span>
                    ) : (
                      <div className="relative inline-flex">
                        <select
                          value={m.role}
                          disabled={updatingRole === m.id}
                          onChange={e => updateRole(m.id, e.target.value)}
                          className={`appearance-none text-[10px] font-bold pl-2 pr-6 py-0.5 rounded-lg cursor-pointer outline-none disabled:cursor-wait ${ROLE_STYLE[m.role] || ROLE_STYLE.operador}`}
                          style={{ backgroundImage: 'none' }}
                        >
                          {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {!isSelf && !isSA && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEdit(m)}
                      title="Editar permissões"
                      className="w-9 h-9 rounded-xl bg-violet-50 hover:bg-violet-100 flex items-center justify-center transition-colors"
                    >
                      <Sliders size={14} className="text-violet-600" />
                    </button>
                    <button
                      onClick={() => openReset(m)}
                      title="Resetar senha"
                      className="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-100 flex items-center justify-center transition-colors"
                    >
                      <KeyRound size={14} className="text-amber-600" />
                    </button>
                    <button
                      onClick={() => toggleStatus(m)}
                      disabled={toggling === m.id}
                      title={isActive ? 'Desativar' : 'Reativar'}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 ${
                        isActive ? 'bg-red-50 hover:bg-red-100' : 'bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {isActive
                        ? <UserX size={15} className="text-red-500" />
                        : <UserCheck size={15} className="text-emerald-600" />
                      }
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════ New Employee Modal ════ */}
      {empOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">Novo funcionário</h2>
              <button onClick={closeEmp}><X size={20} className="text-gray-400" /></button>
            </div>

            {/* Form */}
            {!empDone ? (
              <div className="space-y-4">

                <div>
                  <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Nome completo</label>
                  <input
                    value={empName}
                    onChange={e => setEmpName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Login</label>
                  <input
                    value={empHandle}
                    onChange={e => setEmpHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="Ex: joao.silva"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Email:{' '}
                    <span className="font-mono text-gray-700">{emailPreview}</span>
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Função / Template</label>
                  <select
                    value={empTemplate}
                    onChange={e => {
                      setEmpTemplate(e.target.value)
                      if (e.target.value) {
                        const tpl = templates.find(t => t.id === e.target.value)
                        if (tpl) {
                          setEmpRole(tpl.base_role || 'operador')
                          setEmpPerms({ ...DEFAULT_PERMISSIONS, ...tpl.permissions })
                        }
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  >
                    <option value="">Selecionar template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' ★' : ''}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    {ROLES.map(r => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setEmpRole(r.key)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          empRole === r.key
                            ? 'text-white border-transparent'
                            : 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                        style={empRole === r.key ? { backgroundColor: color } : {}}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Senha temporária</label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-mono tracking-widest text-gray-800">
                      {empPass}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmpPass(genPassword())}
                      title="Gerar nova senha"
                      className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center hover:bg-gray-100 shrink-0 transition-colors"
                    >
                      <RefreshCw size={14} className="text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Personalizar permissões */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPerms(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders size={14} />
                      Personalizar permissões
                    </span>
                    {showPerms ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {showPerms && (
                    <div className="px-4 py-3">
                      <PermissionToggles perms={empPerms} onChange={setEmpPerms} color={color} />
                    </div>
                  )}
                </div>

                {empError && (
                  <p className="text-xs text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {empError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={closeEmp} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={createEmployee}
                    disabled={empLoading}
                    className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60"
                    style={{ backgroundColor: color }}
                  >
                    {empLoading ? 'Criando...' : 'Criar funcionário'}
                  </button>
                </div>
              </div>

            /* Credentials screen after success */
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <UserCheck size={18} className="text-emerald-600 shrink-0" />
                  <p className="text-sm font-bold text-emerald-800">Funcionário criado com sucesso!</p>
                </div>

                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Anote agora — a senha temporária não será exibida novamente.
                </p>

                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1.5">Login (email de acesso)</p>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      <span className="flex-1 text-sm font-mono text-gray-800 truncate">{empDone.email}</span>
                      <CopyBtn text={empDone.email} color={color} />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1.5">Senha temporária</p>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      <span className="flex-1 text-sm font-mono tracking-widest text-gray-800">{empDone.password}</span>
                      <CopyBtn text={empDone.password} color={color} />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1.5">Copiar tudo</p>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      <span className="flex-1 text-xs font-mono text-gray-600 truncate">
                        {empDone.email} · {empDone.password}
                      </span>
                      <CopyBtn text={`Login: ${empDone.email}\nSenha: ${empDone.password}`} color={color} />
                    </div>
                  </div>
                </div>

                <button
                  onClick={closeEmp}
                  className="w-full py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ backgroundColor: color }}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ Edit Employee Drawer ════ */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-gray-900">{editTarget.full_name || 'Funcionário'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Editar função e permissões</p>
              </div>
              <button onClick={() => setEditTarget(null)}><X size={20} className="text-gray-400" /></button>
            </div>

            {/* Role selector */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Cargo / Role</label>
              <div className="flex gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setEditRole(r.key)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      editRole === r.key
                        ? 'text-white border-transparent'
                        : 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                    style={editRole === r.key ? { backgroundColor: color } : {}}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Template reset */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Resetar para template</label>
              <div className="flex gap-2">
                <select
                  value={editTemplate}
                  onChange={e => setEditTemplate(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecionar template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' ★' : ''}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={resetToTemplate}
                  disabled={!editTemplate}
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
                  title="Resetar para template"
                >
                  <RotateCcw size={15} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Permission toggles */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 mb-2 block uppercase tracking-wide">Permissões individuais</label>
              <PermissionToggles perms={editPerms} onChange={setEditPerms} color={color} />
            </div>

            {editError && (
              <p className="text-xs text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {editError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditTarget(null)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60"
                style={{ backgroundColor: color }}
              >
                {editSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Reset Password Modal ════ */}
      {rstTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-gray-900">Resetar senha</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rstTarget.full_name || 'Funcionário'}</p>
              </div>
              <button onClick={closeRst}><X size={20} className="text-gray-400" /></button>
            </div>

            {!rstDone ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">
                    Nova senha temporária
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-mono tracking-widest text-gray-800">
                      {rstPass}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRstPass(genPassword())}
                      title="Gerar nova"
                      className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center hover:bg-gray-100 shrink-0 transition-colors"
                    >
                      <RefreshCw size={14} className="text-gray-500" />
                    </button>
                  </div>
                </div>

                {rstError && (
                  <p className="text-xs text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {rstError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={closeRst} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={doReset}
                    disabled={rstLoading}
                    className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60"
                    style={{ backgroundColor: color }}
                  >
                    {rstLoading ? 'Salvando...' : 'Confirmar reset'}
                  </button>
                </div>
              </div>

            /* Success — show new password */
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Anote agora — esta senha não será exibida novamente.
                </p>

                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1.5">Nova senha</p>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    <span className="flex-1 text-sm font-mono tracking-widest text-gray-800">{rstPass}</span>
                    <CopyBtn text={rstPass} color={color} />
                  </div>
                </div>

                <button
                  onClick={closeRst}
                  className="w-full py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ backgroundColor: color }}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
