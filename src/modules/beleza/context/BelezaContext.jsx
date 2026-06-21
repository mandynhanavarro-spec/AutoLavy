import { createContext, useContext, useEffect, useState } from 'react'
import { useTenantContext } from '../../../core/contexts/TenantContext'
import * as svc from '../lib/belezaService'
import { genId, daysSince } from '../lib/helpers'

const BelezaContext = createContext(null)

export function BelezaProvider({ children }) {
  const { tenant } = useTenantContext()
  const tenantId = tenant?.id

  const [clients,  setClients]  = useState([])
  const [services, setServices] = useState([])
  const [config,   setConfig]   = useState({ defaultAlertDays: 30 })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    Promise.all([
      svc.loadClients(tenantId),
      svc.loadServices(tenantId),
      svc.loadConfig(tenantId),
    ])
      .then(([c, s, cfg]) => {
        setClients(c)
        setServices(s)
        setConfig(cfg)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [tenantId])

  const alertClients = clients.filter(c => {
    const last = services
      .filter(s => s.clientId === c.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    if (!last) return false
    return daysSince(last.date) >= (c.alertDays || config.defaultAlertDays)
  })

  async function addClient(data) {
    const atLimit = tenant?.plan_limit_clients
      ? clients.length >= tenant.plan_limit_clients
      : false
    if (atLimit) return
    const nc = {
      id: genId(),
      name: data.name.trim(),
      phone: data.phone.trim(),
      notes: data.notes?.trim() || '',
      alertDays: data.alertDays ? Number(data.alertDays) : undefined,
      createdAt: new Date().toISOString(),
    }
    if (!nc.alertDays) delete nc.alertDays
    await svc.insertClient(tenantId, nc)
    setClients(prev => [...prev, nc])
    return nc
  }

  async function updateClient(id, data) {
    await svc.updateClient(tenantId, id, data)
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
  }

  async function deleteClient(id) {
    await svc.deleteClient(tenantId, id)
    setClients(prev  => prev.filter(c => c.id !== id))
    setServices(prev => prev.filter(s => s.clientId !== id))
  }

  async function addService(data) {
    const ns = {
      id: genId(),
      clientId: data.clientId,
      description: data.description.trim(),
      value: Number(data.value),
      date: data.date,
      createdAt: new Date().toISOString(),
    }
    await svc.insertService(tenantId, ns)
    setServices(prev => [...prev, ns])
  }

  async function deleteService(id) {
    await svc.deleteService(tenantId, id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  async function saveConfig(defaultAlertDays) {
    await svc.saveConfig(tenantId, defaultAlertDays)
    setConfig({ defaultAlertDays })
  }

  return (
    <BelezaContext.Provider value={{
      clients, services, config, alertClients, loading, error,
      addClient, updateClient, deleteClient,
      addService, deleteService,
      saveConfig,
    }}>
      {children}
    </BelezaContext.Provider>
  )
}

export function useBeleza() {
  const ctx = useContext(BelezaContext)
  if (!ctx) throw new Error('useBeleza deve ser usado dentro de BelezaProvider')
  return ctx
}
