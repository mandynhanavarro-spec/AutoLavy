import { useTenantContext } from '../contexts/TenantContext'

export function useModules() {
  const { modules } = useTenantContext()
  const safeModules = Array.isArray(modules) ? modules : []

  function hasModule(key) {
    return safeModules.includes(key)
  }

  function hasAnyModule(keys) {
    return keys.some(k => safeModules.includes(k))
  }

  function hasAllModules(keys) {
    return keys.every(k => safeModules.includes(k))
  }

  return { modules: safeModules, hasModule, hasAnyModule, hasAllModules }
}
