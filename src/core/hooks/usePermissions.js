import { useTenantContext } from '../contexts/TenantContext'

export const PERM_LABELS = {
  can_open_cash:      'Abrir caixa (PDV)',
  can_do_sangria:     'Fazer sangria',
  can_void_sale:      'Cancelar / Estornar venda',
  can_edit_stock:     'Editar estoque',
  can_manage_products:'Gerenciar produtos',
  can_view_reports:   'Ver relatórios',
  can_close_cash:     'Fechar caixa',
}

export const ALL_PERM_KEYS = Object.keys(PERM_LABELS)

export const DEFAULT_PERMISSIONS = {
  can_void_sale:      false,
  can_edit_stock:     false,
  can_open_cash:      true,
  can_do_sangria:     true,
  can_view_reports:   false,
  can_close_cash:     false,
  can_manage_products: false,
}

const ROLE_DEFAULTS = {
  operador: { ...DEFAULT_PERMISSIONS },
  gerente: {
    can_void_sale:      false,
    can_edit_stock:     true,
    can_open_cash:      true,
    can_do_sangria:     true,
    can_view_reports:   true,
    can_close_cash:     true,
    can_manage_products: false,
  },
  admin: {
    can_void_sale:      true,
    can_edit_stock:     true,
    can_open_cash:      true,
    can_do_sangria:     true,
    can_view_reports:   true,
    can_close_cash:     true,
    can_manage_products: true,
  },
  superadmin: {
    can_void_sale:      true,
    can_edit_stock:     true,
    can_open_cash:      true,
    can_do_sangria:     true,
    can_view_reports:   true,
    can_close_cash:     true,
    can_manage_products: true,
  },
}

export function usePermissions() {
  const { profile } = useTenantContext()
  const role = profile?.role || 'operador'
  const roleDefaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operador
  const stored = profile?.permissions || null

  /*
   * Role grants are minimum guarantees.
   * Stored permissions can ADD access but never remove what the role already grants.
   * This prevents old DB values (false) from silently blocking role-level access.
   */
  function can(permKey) {
    if (roleDefaults[permKey]) return true
    return Boolean(stored?.[permKey])
  }

  const effective = Object.fromEntries(
    Object.keys(roleDefaults).map(k => [k, can(k)])
  )

  return { can, permissions: effective, role }
}
