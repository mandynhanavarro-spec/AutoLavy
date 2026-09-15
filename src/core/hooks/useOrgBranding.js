import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

/*
 * Resolve o branding white label de uma organizacao pelo slug, via RPC
 * publica get_org_branding_by_slug (chamavel por usuario anonimo, roda
 * antes do login).
 *
 * Regra do "interruptor": logo_url e o unico campo que decide se a marca
 * customizada entra em vigor. theme_color/secondary_color sozinhos (sem
 * logo) NUNCA disparam a troca visual -- por isso branding so vem
 * preenchido quando logo_url existe; caso contrario (org sem direito ao
 * white label, org inexistente, ou erro de rede/RPC) o hook devolve
 * branding=null e quem consome cai no visual padrao AutoLavy.
 */
export function useOrgBranding(orgSlug) {
  const [branding, setBranding] = useState(null)
  const [loading, setLoading] = useState(Boolean(orgSlug))

  useEffect(() => {
    let mounted = true

    if (!orgSlug) {
      setBranding(null)
      setLoading(false)
      return
    }

    setLoading(true)

    supabase
      .rpc('get_org_branding_by_slug', { p_slug: orgSlug })
      .then(({ data, error }) => {
        if (!mounted) return
        const row = Array.isArray(data) ? data[0] : data

        if (!error && row?.logo_url) {
          setBranding({
            name: row.name || '',
            logoUrl: row.logo_url,
            themeColor: row.theme_color || null,
            secondaryColor: row.secondary_color || null,
            slogan: row.slogan || '',
          })
        } else {
          setBranding(null)
        }
      })
      .catch(() => {
        if (mounted) setBranding(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [orgSlug])

  return { branding, loading }
}
