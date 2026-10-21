import { useTenantContext } from '../contexts/TenantContext'

export const PERM_LABELS = {
  can_open_cash:      'Abrir caixa (PDV)',
  can_do_sangria:     'Fazer sangria',
  can_void_sale:      'Cancelar / Estornar venda',
  can_edit_stock:     'Editar estoque',
  can_manage_products:'Gerenciar produtos',
  can_view_reports:   'Ver relatórios',
  can_close_cash:     'Fechar caixa',
  can_edit_prices:    'Alterar preços',
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
  can_edit_prices:    false,
}

// Chaves em que o valor salvo no perfil VENCE o padrão do cargo (dá para
// negar a um gerente específico). Sem a chave salva, vale o padrão do cargo.
// Admin/superadmin sempre têm. Mesma regra de public.perm_effective no banco.
export const STORED_WINS_KEYS = ['can_edit_prices']

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
    can_edit_prices:    true,
  },
  admin: {
    can_void_sale:      true,
    can_edit_stock:     true,
    can_open_cash:      true,
    can_do_sangria:     true,
    can_view_reports:   true,
    can_close_cash:     true,
    can_manage_products: true,
    can_edit_prices:    true,
  },
  superadmin: {
    can_void_sale:      true,
    can_edit_stock:     true,
    can_open_cash:      true,
    can_do_sangria:     true,
    can_view_reports:   true,
    can_close_cash:     true,
    can_manage_products: true,
    can_edit_prices:    true,
  },
}

/** Permissão efetiva de um perfil (cargo + permissões salvas). */
export function effectivePermission(role, stored, permKey) {
  const roleDefaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operador
  if (role === 'admin' || role === 'superadmin') return true
  if (STORED_WINS_KEYS.includes(permKey) && stored && permKey in stored) {
    return Boolean(stored[permKey])
  }
  if (roleDefaults[permKey]) return true
  return Boolean(stored?.[permKey])
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
   * Exceção: STORED_WINS_KEYS (ver effectivePermission).
   */
  function can(permKey) {
    return effectivePermission(role, stored, permKey)
  }

  const effective = Object.fromEntries(
    Object.keys(roleDefaults).map(k => [k, can(k)])
  )

  return { can, permissions: effective, role }
}
