import { useRegisterSW } from 'virtual:pwa-register/react'

export function useServiceWorker() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      r && setInterval(() => r.update(), 60 * 1000)
    },
  })
  return { needRefresh: needRefresh[0], updateServiceWorker }
}
