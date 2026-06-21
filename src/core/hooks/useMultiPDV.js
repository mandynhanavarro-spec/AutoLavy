import { useState, useEffect } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { useTenantContext } from '../contexts/TenantContext'

export function useMultiPDV() {
  const { tenant } = useTenantContext()
  const orgId = tenant?.id
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    supabase.rpc('get_my_registers').then(({ data, error }) => {
      setRegisters(error ? [] : (data || []).filter(r => r.is_active))
      setLoading(false)
    })
  }, [orgId])

  return { registers, hasMultiplePDV: registers.length >= 2, loading }
}
