import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function useServiceWorker() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      r && setInterval(() => r.update(), 5 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (needRefresh[0]) {
      updateServiceWorker(true)
    }
  }, [needRefresh, updateServiceWorker])
}
