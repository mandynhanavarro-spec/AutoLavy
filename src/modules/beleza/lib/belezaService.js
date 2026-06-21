import { supabase } from '../../../shared/lib/supabase'

// ─── Clientes ────────────────────────────────────────────────

export async function loadClients(tenantId) {
  const { data, error } = await supabase
    .from('beleza_clients')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    notes: c.notes,
    alertDays: c.alert_days ?? undefined,
    createdAt: c.created_at,
  }))
}

export async function insertClient(tenantId, client) {
  const { error } = await supabase.from('beleza_clients').insert({
    id: client.id,
    tenant_id: tenantId,
    name: client.name,
    phone: client.phone,
    notes: client.notes || null,
    alert_days: client.alertDays || null,
    created_at: client.createdAt,
  })
  if (error) throw error
}

export async function updateClient(tenantId, id, fields) {
  const payload = {}
  if (fields.name !== undefined)      payload.name       = fields.name
  if (fields.phone !== undefined)     payload.phone      = fields.phone
  if (fields.notes !== undefined)     payload.notes      = fields.notes || null
  if (fields.alertDays !== undefined) payload.alert_days = fields.alertDays || null
  const { error } = await supabase
    .from('beleza_clients')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

export async function deleteClient(tenantId, id) {
  const { error } = await supabase
    .from('beleza_clients')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

// ─── Serviços / Atendimentos ─────────────────────────────────

export async function loadServices(tenantId) {
  const { data, error } = await supabase
    .from('beleza_services')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false })
  if (error) throw error
  return data.map(s => ({
    id: s.id,
    clientId: s.client_id,
    description: s.description,
    value: Number(s.value),
    date: s.date,
    createdAt: s.created_at,
  }))
}

export async function insertService(tenantId, service) {
  const { error } = await supabase.from('beleza_services').insert({
    id: service.id,
    tenant_id: tenantId,
    client_id: service.clientId,
    description: service.description,
    value: service.value,
    date: service.date,
    created_at: service.createdAt,
  })
  if (error) throw error
}

export async function deleteService(tenantId, id) {
  const { error } = await supabase
    .from('beleza_services')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

// ─── Configuração ─────────────────────────────────────────────

export async function loadConfig(tenantId) {
  const { data, error } = await supabase
    .from('beleza_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .single()
  if (error) return { defaultAlertDays: 30 }
  return { defaultAlertDays: data.default_alert_days }
}

export async function saveConfig(tenantId, defaultAlertDays) {
  const { error } = await supabase
    .from('beleza_config')
    .upsert(
      { tenant_id: tenantId, default_alert_days: defaultAlertDays },
      { onConflict: 'tenant_id' }
    )
  if (error) throw error
}
