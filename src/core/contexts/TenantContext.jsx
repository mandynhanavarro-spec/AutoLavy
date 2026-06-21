import { createContext, useContext } from 'react'

const TenantContext = createContext({ tenant: null, modules: [], profile: null, loading: true })

export function TenantProvider({ value, children }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenantContext() {
  return useContext(TenantContext)
}
