import { useEffect, useRef, useState } from 'react'
import { Palette, Upload, Save, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTenantContext } from '../../core/contexts/TenantContext'
import { useModules } from '../../core/hooks/useModules'

const SLOGAN_MAX_LENGTH = 60
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
const DEFAULT_THEME_COLOR = '#3b82f6'
const DEFAULT_SECONDARY_COLOR = '#0f172a'
const MIN_CONTRAST_RATIO = 3 // WCAG: minimo razoavel pra texto pequeno

/* ── contraste WCAG (luminancia relativa) contra fundo branco ────── */
function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const int = parseInt(full, 16)
  if (full.length !== 6 || Number.isNaN(int)) return null
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function relativeLuminance({ r, g, b }) {
  const toLinear = c => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

// Fundo de referencia = branco (luminancia 1). Formula WCAG:
// (L_claro + 0.05) / (L_escuro + 0.05).
function contrastRatioWithWhite(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const luminance = relativeLuminance(rgb)
  return 1.05 / (luminance + 0.05)
}

/*
 * Secao "Marca / White Label", reaproveitavel entre as verticais e
 * tambem pelo wizard do SuperAdmin (ClientOnboarding.jsx).
 *
 * Por padrao le tenant/profile/hasModule do TenantContext (uso normal
 * dentro de Configuracoes, dentro da sessao da propria organizacao).
 * Aceita props opcionais pra funcionar tambem FORA desse contexto:
 *   - org: organizacao explicita (sobrepoe o tenant do contexto) --
 *     usado pelo ClientOnboarding, onde o SuperAdmin esta editando/criando
 *     a org de outra empresa, e o TenantContext dele reflete a PROPRIA
 *     sessao do SuperAdmin (tenant=null), nao a org do wizard.
 *   - forceEnabled: sobrepoe a checagem hasModule('white_label') --
 *     necessario no wizard porque ainda nao existe sessao/tenant da
 *     empresa sendo criada pra consultar modules do TenantContext; quem
 *     chama resolve isso direto pelo plan_id selecionado.
 *
 * Se a feature nao estiver habilitada (via hasModule ou forceEnabled),
 * a secao nao renderiza nada -- nem versao desabilitada.
 */
export default function WhiteLabelSection({ org, forceEnabled } = {}) {
  const { tenant, profile } = useTenantContext()
  const { hasModule } = useModules()

  const effectiveOrg = org || tenant
  const orgId = effectiveOrg?.id
  const enabled = forceEnabled ?? hasModule('white_label')
  const isAdmin = ['admin', 'gerente', 'superadmin'].includes(profile?.role)

  const [logoUrl, setLogoUrl]           = useState(effectiveOrg?.logo_url || '')
  const [themeColor, setThemeColor]     = useState(effectiveOrg?.theme_color || DEFAULT_THEME_COLOR)
  const [secondaryColor, setSecondaryColor] = useState(effectiveOrg?.secondary_color || DEFAULT_SECONDARY_COLOR)
  const [slogan, setSlogan]             = useState(effectiveOrg?.slogan || '')

  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [saved, setSaved]           = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setLogoUrl(effectiveOrg?.logo_url || '')
    setThemeColor(effectiveOrg?.theme_color || DEFAULT_THEME_COLOR)
    setSecondaryColor(effectiveOrg?.secondary_color || DEFAULT_SECONDARY_COLOR)
    setSlogan(effectiveOrg?.slogan || '')
  }, [effectiveOrg?.id, effectiveOrg?.logo_url, effectiveOrg?.theme_color, effectiveOrg?.secondary_color, effectiveOrg?.slogan])

  if (!enabled) return null

  const secondaryContrast = contrastRatioWithWhite(secondaryColor)
  const lowSecondaryContrast = secondaryContrast !== null && secondaryContrast < MIN_CONTRAST_RATIO

  // Plano ja tem a feature, mas a organizacao ainda nao existe (wizard de
  // criacao de loja nova, antes do insert em organizations). Sem id nao da
  // pra montar o caminho no bucket nem gravar em organizations -- em vez de
  // inventar um id temporario, so avisamos que precisa salvar a empresa
  // primeiro.
  if (!orgId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#7c3aed18' }}>
            <Palette size={15} style={{ color: '#7c3aed' }} />
          </div>
          <h2 className="text-sm font-black text-gray-900">Marca / White Label</h2>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs text-gray-500">
            Salve os dados da empresa primeiro — a configuração de marca fica disponível assim que a organização existir.
          </p>
        </div>
      </div>
    )
  }

  async function handleLogoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !orgId) return

    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError('Envie um arquivo de imagem (PNG, JPG, SVG...).')
      return
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setUploadError('Imagem muito grande. Limite de 2MB.')
      return
    }

    setUploading(true)
    // Caminho fixo (sem extensao) + upsert: mantem 1 unico arquivo por
    // organizacao, alinhado com a RLS do bucket (pasta = org_id).
    const path = `${orgId}/logo`
    const { error: uploadErr } = await supabase.storage
      .from('org-logos')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      setUploading(false)
      setUploadError(uploadErr.message || 'Erro ao enviar imagem.')
      return
    }

    const { data: publicUrlData } = supabase.storage.from('org-logos').getPublicUrl(path)
    // Cache-busting via query string: como o caminho e sempre o mesmo,
    // sem isso o CDN/navegador poderia continuar servindo a imagem antiga
    // em toda tela que ja exibe o logo (login, layouts internos).
    const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('organizations')
      .update({ logo_url: bustedUrl })
      .eq('id', orgId)

    setUploading(false)
    if (updateErr) {
      setUploadError(updateErr.message || 'Logo enviado, mas houve erro ao salvar.')
      return
    }
    setLogoUrl(bustedUrl)
  }

  async function handleSaveBrand() {
    if (!orgId) return
    setSaveError('')
    setSaving(true)
    const { error } = await supabase
      .from('organizations')
      .update({
        theme_color: themeColor,
        secondary_color: secondaryColor,
        slogan: slogan.trim() || null,
      })
      .eq('id', orgId)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#7c3aed18' }}>
          <Palette size={15} style={{ color: '#7c3aed' }} />
        </div>
        <h2 className="text-sm font-black text-gray-900">Marca / White Label</h2>
      </div>

      <div className="px-5 py-5 space-y-5">
        {!isAdmin && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
            Apenas administradores podem editar a marca da organização.
          </p>
        )}

        {/* Logo */}
        <div>
          <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl
                ? <img src={logoUrl} alt="Logo da organização" className="w-full h-full object-cover" />
                : <span className="text-[10px] text-gray-400 text-center px-1">Sem logo</span>}
            </div>
            {isAdmin && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 text-sm font-bold hover:border-gray-400 transition-colors disabled:opacity-60"
                >
                  <Upload size={14} />
                  {uploading ? 'Enviando...' : logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                <p className="text-[11px] text-gray-400 mt-1.5">PNG, JPG ou SVG, até 2MB.</p>
              </div>
            )}
          </div>
          {uploadError && (
            <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
              {uploadError}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            {logoUrl
              ? 'Com logo cadastrado, a tela de login personalizada (link exclusivo da sua empresa) já usa sua marca.'
              : 'Sem logo, a tela de login personalizada continua com o visual padrão do AutoLavy — o logo é o que ativa a marca própria.'}
          </p>
        </div>

        {/* Cores */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Cor primária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={themeColor}
                onChange={e => setThemeColor(e.target.value)}
                disabled={!isAdmin}
                className="w-10 h-10 rounded-lg border border-gray-200 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm font-mono text-gray-500">{themeColor}</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">Cor secundária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={e => setSecondaryColor(e.target.value)}
                disabled={!isAdmin}
                className="w-10 h-10 rounded-lg border border-gray-200 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm font-mono text-gray-500">{secondaryColor}</span>
            </div>
            {lowSecondaryContrast && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Essa cor pode ficar difícil de ler sobre fundo branco (contraste {secondaryContrast.toFixed(1)}:1, recomendado {MIN_CONTRAST_RATIO}:1+).
              </p>
            )}
          </div>
        </div>

        {/* Slogan */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-gray-400 block uppercase tracking-wide">Slogan</label>
            <span className={`text-[11px] font-bold ${slogan.length >= SLOGAN_MAX_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
              {slogan.length}/{SLOGAN_MAX_LENGTH}
            </span>
          </div>
          <input
            value={slogan}
            onChange={e => setSlogan(e.target.value.slice(0, SLOGAN_MAX_LENGTH))}
            disabled={!isAdmin}
            maxLength={SLOGAN_MAX_LENGTH}
            placeholder="Uma frase curta para a tela de login da sua empresa"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-violet-400 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>

        {saveError && (
          <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {saveError}
          </p>
        )}

        {isAdmin && (
          <button
            onClick={handleSaveBrand}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm disabled:opacity-60 transition-colors"
            style={{ backgroundColor: saved ? '#10b981' : '#7c3aed' }}
          >
            <Save size={14} />
            {saved ? 'Marca salva!' : saving ? 'Salvando...' : 'Salvar marca'}
          </button>
        )}
      </div>
    </div>
  )
}
