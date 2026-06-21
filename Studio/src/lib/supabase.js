import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas.\n' +
    'Crie um arquivo .env baseado no .env.example e preencha com suas credenciais do Supabase.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Clientes ───────────────────────────────────────────

export async function dbLoadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  // Mapeia snake_case do banco para camelCase do app
  return data.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    notes: c.notes,
    alertDays: c.alert_days ?? undefined,
    createdAt: c.created_at,
  }))
}

export async function dbInsertClient(client) {
  const { error } = await supabase.from('clients').insert({
    id: client.id,
    name: client.name,
    phone: client.phone,
    notes: client.notes || null,
    alert_days: client.alertDays || null,
    created_at: client.createdAt,
  })
  if (error) throw error
}

export async function dbUpdateClient(id, fields) {
  const payload = {}
  if (fields.name !== undefined)      payload.name       = fields.name
  if (fields.phone !== undefined)     payload.phone      = fields.phone
  if (fields.notes !== undefined)     payload.notes      = fields.notes || null
  if (fields.alertDays !== undefined) payload.alert_days = fields.alertDays || null
  const { error } = await supabase.from('clients').update(payload).eq('id', id)
  if (error) throw error
}

export async function dbDeleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

// ─── Serviços ───────────────────────────────────────────

export async function dbLoadServices() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
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

export async function dbInsertService(service) {
  const { error } = await supabase.from('services').insert({
    id: service.id,
    client_id: service.clientId,
    description: service.description,
    value: service.value,
    date: service.date,
    created_at: service.createdAt,
  })
  if (error) throw error
}

export async function dbDeleteService(id) {
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw error
}

// ─── Configuração ────────────────────────────────────────

export async function dbLoadConfig() {
  const { data, error } = await supabase
    .from('config')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) return { defaultAlertDays: 30 }
  return { defaultAlertDays: data.default_alert_days }
}

export async function dbSaveConfig(defaultAlertDays) {
  const { error } = await supabase
    .from('config')
    .upsert({ id: 1, default_alert_days: defaultAlertDays })
  if (error) throw error
}
