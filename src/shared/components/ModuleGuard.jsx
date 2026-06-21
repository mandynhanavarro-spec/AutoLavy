import { useModules } from '../../core/hooks/useModules'

export default function ModuleGuard({
  module,
  modules,
  requireAll = false,
  fallback = null,
  children,
}) {
  const { hasAnyModule, hasAllModules } = useModules()

  const keys = module ? [module] : (modules ?? [])

  if (keys.length === 0) return children

  const allowed = requireAll ? hasAllModules(keys) : hasAnyModule(keys)

  return allowed ? children : fallback
}
