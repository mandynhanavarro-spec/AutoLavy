import { useState, useEffect } from 'react'
import {
  dbLoadClients, dbInsertClient, dbUpdateClient, dbDeleteClient,
  dbLoadServices, dbInsertService, dbDeleteService,
  dbLoadConfig, dbSaveConfig,
} from './lib/supabase.js'

// ─── Helpers ─────────────────────────────────────────────
const genId     = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
const fmtDate   = d  => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const fmtCur    = v  => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const daysSince = d  => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
const initials  = n  => n.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

const openWA = (phone, name) => {
  const n   = phone.replace(/\D/g, '')
  const num = n.startsWith('55') ? n : '55' + n
  const msg = encodeURIComponent(`Olá ${name}! Tudo bem? 😊 Estou passando para avisar que já faz um tempinho desde sua última visita. Que tal agendarmos um horário?`)
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
}

const ESSENCIAL_LIMIT = 50

// ─── Estilos globais ─────────────────────────────────────
const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F5F1FA; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #C9B8E8; border-radius: 10px; }
  input, textarea, select { font-family: 'DM Sans', system-ui, sans-serif; transition: border 0.2s; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #9B72CF !important; }
  button { cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; transition: all 0.15s; }
  button:active { transform: scale(0.97); }
  .nav-item:hover { background: rgba(155,114,207,0.15) !important; color: #EDE5F5 !important; }
  .client-row:hover { background: #F0EAF8 !important; }
  .srv-row:hover { background: #F5F1FA !important; }
  .btn-primary:hover { background: #7A4FB5 !important; }
  .btn-outline:hover { background: #EDE5F5 !important; }
  .btn-wa:hover { background: #1ebe59 !important; }
  .btn-danger:hover { background: #c0392b !important; }
  .fade-in { animation: fadeIn 0.25s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .alert-pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.6;} }
  @keyframes spin { to { transform: rotate(360deg); } }
`

// ─── Paleta de cores ─────────────────────────────────────
const palette = {
  bg: '#F5F1FA', white: '#FFFFFF', sidebar: '#2D1B4E',
  rose: '#9B72CF', roseDark: '#7A4FB5', roseLight: '#EDE5F5',
  roseMid: '#DDD0EE', espresso: '#1E1235', warm: '#8B7BA8',
  border: '#DDD0EE',
  green: '#25D366',
  alertRed: '#A32D2D', alertRedBg: '#FCEBEB',
  alertAmber: '#854F0B', alertAmberBg: '#FAEEDA',
  alertGreen: '#3B6D11', alertGreenBg: '#EAF3DE',
}

// ─── Objeto de estilos ───────────────────────────────────
const S = {
  app:        { display: 'flex', height: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif", background: palette.bg, overflow: 'hidden' },
  sidebar:    { width: 220, minWidth: 220, background: palette.sidebar, display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  logo:       { padding: '28px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  logoTitle:  { color: '#EDE5F5', fontSize: 19, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, letterSpacing: 0.5 },
  logoSub:    { color: palette.rose, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 4 },
  nav:        { padding: '16px 0', flex: 1 },
  navSection: { fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, textTransform: 'uppercase', padding: '16px 24px 8px' },
  navItem:    a => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 24px', cursor: 'pointer', background: a ? 'rgba(155,114,207,0.2)' : 'transparent', borderLeft: a ? '3px solid #9B72CF' : '3px solid transparent', color: a ? '#EDE5F5' : '#9E8889', fontSize: 13.5, transition: 'all 0.15s', userSelect: 'none' }),
  navBadge:   { background: palette.rose, color: '#fff', fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, marginLeft: 'auto' },
  sidebarFooter: { padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)' },
  main:       { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:     { padding: '20px 32px', borderBottom: `1px solid ${palette.border}`, background: palette.white, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  headerLeft: { display: 'flex', flexDirection: 'column' },
  headerTitle:{ fontSize: 22, color: palette.espresso, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 },
  headerSub:  { fontSize: 12.5, color: palette.warm, marginTop: 2 },
  content:    { flex: 1, overflowY: 'auto', padding: '28px 32px' },
  statGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 28 },
  statCard:   { background: palette.white, border: `1px solid ${palette.border}`, borderRadius: 12, padding: '18px 20px' },
  statValue:  { fontSize: 26, color: palette.espresso, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, display: 'block' },
  statLabel:  { fontSize: 11, color: palette.warm, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 6, display: 'block' },
  card:       { background: palette.white, border: `1px solid ${palette.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  cardHeader: { padding: '16px 24px', borderBottom: `1px solid ${palette.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:  { fontSize: 14, color: palette.espresso, fontWeight: 500, letterSpacing: 0.3 },
  btnPrimary: { background: palette.rose, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 },
  btnOutline: { background: 'transparent', color: palette.rose, border: `1px solid ${palette.rose}`, borderRadius: 8, padding: '8px 16px', fontSize: 13 },
  btnWA:      { background: palette.green, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 },
  btnDanger:  { background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5 },
  input:      { width: '100%', padding: '10px 14px', border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 13.5, background: '#FAF8FD', color: palette.espresso },
  label:      { display: 'block', fontSize: 11.5, color: palette.warm, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7, fontWeight: 500 },
  formGroup:  { marginBottom: 18 },
  avatar:     s => ({ width: s, height: s, borderRadius: '50%', background: palette.roseLight, color: palette.roseDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s * 0.3, fontWeight: 600, flexShrink: 0 }),
  badge:      type => {
    const t = { red:[palette.alertRedBg,palette.alertRed], amber:[palette.alertAmberBg,palette.alertAmber], green:[palette.alertGreenBg,palette.alertGreen], rose:[palette.roseLight,palette.roseDark] }
    const [bg, c] = t[type] || t.rose
    return { background: bg, color: c, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }
  },
  emptyState: { padding: '48px 24px', textAlign: 'center', color: palette.warm },
  searchBar:  { width: '100%', padding: '10px 14px 10px 38px', border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 13.5, background: '#FAF8FD', color: palette.espresso },
}

// ─── Componentes utilitários ─────────────────────────────
function Avatar({ name, size = 40 }) {
  return <div style={S.avatar(size)}>{initials(name || '?')}</div>
}
function Badge({ type, children }) {
  return <span style={S.badge(type)}>{children}</span>
}
function StatCard({ label, value, icon }) {
  return (
    <div style={S.statCard}>
      <span style={S.statValue}>{value}</span>
      <span style={S.statLabel}><i className={`ti ${icon}`} style={{ marginRight: 5 }} aria-hidden />{label}</span>
    </div>
  )
}
function AlertBadge({ days, alertDays }) {
  if (days === null) return <Badge type="rose">Sem visita</Badge>
  if (days >= alertDays) return <Badge type="red">{days}d sem visita</Badge>
  if (days >= alertDays * 0.75) return <Badge type="amber">{days}d sem visita</Badge>
  return <Badge type="green">{days}d atrás</Badge>
}

// ─── Dashboard ───────────────────────────────────────────
function Dashboard({ clients, services, setView, setSelectedId, alertClients }) {
  const totalRevenue = services.reduce((sum, s) => sum + s.value, 0)
  const thisMonth    = services.filter(s => {
    const d = new Date(s.date), n = new Date()
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
  }).reduce((sum, s) => sum + s.value, 0)

  const topClients = [...clients].sort((a, b) => {
    const ta = services.filter(s => s.clientId === a.id).reduce((sum, s) => sum + s.value, 0)
    const tb = services.filter(s => s.clientId === b.id).reduce((sum, s) => sum + s.value, 0)
    return tb - ta
  }).slice(0, 5)

  return (
    <div className="fade-in">
      <div style={S.statGrid}>
        <StatCard label="Total faturado"  value={fmtCur(totalRevenue)} icon="ti-currency-dollar" />
        <StatCard label="Este mês"        value={fmtCur(thisMonth)}    icon="ti-calendar-month" />
        <StatCard label="Clientes"        value={clients.length}       icon="ti-users" />
        <StatCard label="Alertas ativos"  value={alertClients.length}  icon="ti-bell" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}><i className="ti ti-crown" style={{ color: palette.rose, marginRight: 7 }} aria-hidden />Top Clientes</span>
            <button className="btn-outline" style={S.btnOutline} onClick={() => setView('ranking')}>Ver todos</button>
          </div>
          {topClients.length === 0
            ? <div style={S.emptyState}><i className="ti ti-users" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} aria-hidden />Nenhuma cliente ainda</div>
            : topClients.map((c, i) => {
                const total = services.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.value, 0)
                return (
                  <div key={c.id} className="client-row" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 24px', borderBottom: i < topClients.length-1 ? `1px solid ${palette.border}` : 'none', cursor:'pointer' }}
                    onClick={() => { setSelectedId(c.id); setView('detail') }}>
                    <span style={{ fontSize:13, color:palette.warm, width:18, textAlign:'center' }}>#{i+1}</span>
                    <Avatar name={c.name} size={34} />
                    <span style={{ flex:1, fontSize:13.5, color:palette.espresso, fontWeight:500 }}>{c.name}</span>
                    <span style={{ fontSize:13.5, color:palette.roseDark, fontWeight:500 }}>{fmtCur(total)}</span>
                  </div>
                )
              })
          }
        </div>

        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}><i className="ti ti-bell-ringing" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Alertas de Retorno</span>
            <button className="btn-outline" style={S.btnOutline} onClick={() => setView('alerts')}>Ver todos</button>
          </div>
          {alertClients.length === 0
            ? <div style={S.emptyState}><i className="ti ti-check" style={{ fontSize:32, marginBottom:8, display:'block', color:palette.alertGreen }} aria-hidden />Nenhuma cliente sumida!</div>
            : alertClients.slice(0,5).map((c, i) => {
                const last = services.filter(s => s.clientId === c.id).sort((a,b) => new Date(b.date)-new Date(a.date))[0]
                const days = last ? daysSince(last.date) : null
                return (
                  <div key={c.id} className="client-row" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 24px', borderBottom: i < Math.min(alertClients.length,5)-1 ? `1px solid ${palette.border}` : 'none', cursor:'pointer' }}
                    onClick={() => { setSelectedId(c.id); setView('detail') }}>
                    <Avatar name={c.name} size={34} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13.5, color:palette.espresso, fontWeight:500 }}>{c.name}</div>
                      <div style={{ fontSize:11.5, color:palette.warm }}>{c.phone}</div>
                    </div>
                    <Badge type="red">{days}d</Badge>
                  </div>
                )
              })
          }
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}><i className="ti ti-clock" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Últimos Atendimentos</span>
        </div>
        {services.length === 0
          ? <div style={S.emptyState}>Nenhum atendimento registrado ainda</div>
          : [...services].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,8).map((s, i, arr) => {
              const c = clients.find(cl => cl.id === s.clientId)
              return (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 24px', borderBottom: i < arr.length-1 ? `1px solid ${palette.border}` : 'none' }}>
                  {c && <Avatar name={c.name} size={32} />}
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, color:palette.espresso }}>{s.description}</div>
                    <div style={{ fontSize:11.5, color:palette.warm }}>{c?.name} · {fmtDate(s.date)}</div>
                  </div>
                  <span style={{ fontSize:14, fontWeight:500, color:palette.roseDark }}>{fmtCur(s.value)}</span>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Lista de clientes ───────────────────────────────────
function ClientList({ clients, services, config, setView, setSelectedId, onAddClient }) {
  const [search, setSearch] = useState('')
  const filtered  = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
  const sorted    = [...filtered].sort((a,b) => a.name.localeCompare(b.name))
  const atLimit   = clients.length >= ESSENCIAL_LIMIT
  const nearLimit = clients.length >= 40 && !atLimit

  return (
    <div className="fade-in">
      {(nearLimit || atLimit) && (
        <div style={{ background: atLimit ? '#FCEBEB' : '#FAEEDA', border:`1px solid ${atLimit ? '#F7C1C1' : '#FAC775'}`, borderRadius:10, padding:'12px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <i className={`ti ${atLimit ? 'ti-alert-circle' : 'ti-info-circle'}`} style={{ fontSize:20, color: atLimit ? '#A32D2D' : '#854F0B', flexShrink:0 }} aria-hidden />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13.5, fontWeight:500, color: atLimit ? '#A32D2D' : '#854F0B' }}>
              {atLimit ? 'Limite de 50 clientes atingido!' : `Você usou ${clients.length} de 50 clientes do Plano Essencial`}
            </div>
            <div style={{ fontSize:12, color: atLimit ? '#A32D2D' : '#854F0B', opacity:0.8, marginTop:2 }}>
              {atLimit ? 'Faça upgrade para o Plano Profissional e tenha clientes ilimitados.' : `Faltam ${ESSENCIAL_LIMIT - clients.length} clientes para atingir o limite.`}
            </div>
          </div>
          <button className="btn-primary" style={{ ...S.btnPrimary, fontSize:12.5, padding:'7px 14px', flexShrink:0 }} onClick={() => setView('planos')}>
            <i className="ti ti-arrow-up-circle" aria-hidden />Fazer Upgrade
          </button>
        </div>
      )}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        <div style={{ flex:1, position:'relative' }}>
          <i className="ti ti-search" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:palette.warm, fontSize:15 }} aria-hidden />
          <input style={S.searchBar} placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {atLimit
          ? <button style={{ ...S.btnOutline, display:'flex', alignItems:'center', gap:7, opacity:0.7, cursor:'not-allowed' }} onClick={() => setView('planos')}>
              <i className="ti ti-lock" aria-hidden />Limite atingido
            </button>
          : <button className="btn-primary" style={S.btnPrimary} onClick={onAddClient}>
              <i className="ti ti-plus" aria-hidden />Nova Cliente
            </button>
        }
      </div>
      <div style={S.card}>
        {sorted.length === 0
          ? <div style={S.emptyState}>
              <i className="ti ti-users" style={{ fontSize:36, display:'block', marginBottom:10 }} aria-hidden />
              {search ? 'Nenhuma cliente encontrada' : 'Nenhuma cliente cadastrada ainda'}
            </div>
          : sorted.map((c, i) => {
              const last      = services.filter(s => s.clientId === c.id).sort((a,b) => new Date(b.date)-new Date(a.date))[0]
              const days      = last ? daysSince(last.date) : null
              const total     = services.filter(s => s.clientId === c.id).reduce((sum,s) => sum+s.value, 0)
              const alertDays = c.alertDays || config.defaultAlertDays
              return (
                <div key={c.id} className="client-row" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 24px', borderBottom: i < sorted.length-1 ? `1px solid ${palette.border}` : 'none', cursor:'pointer' }}
                  onClick={() => { setSelectedId(c.id); setView('detail') }}>
                  <Avatar name={c.name} size={40} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, color:palette.espresso, fontWeight:500 }}>{c.name}</div>
                    <div style={{ fontSize:12.5, color:palette.warm, marginTop:2 }}>{c.phone} · {services.filter(s => s.clientId === c.id).length} visitas</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13.5, fontWeight:500, color:palette.roseDark, marginBottom:4 }}>{fmtCur(total)}</div>
                    <AlertBadge days={days} alertDays={alertDays} />
                  </div>
                  <i className="ti ti-chevron-right" style={{ color:palette.warm, fontSize:16 }} aria-hidden />
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Detalhe do cliente ──────────────────────────────────
function ClientDetail({ client, services, config, onBack, onEdit, onAddService, onDeleteClient, onDeleteService, onUpdateClient }) {
  const clientServices = [...services.filter(s => s.clientId === client.id)].sort((a,b) => new Date(b.date)-new Date(a.date))
  const total          = clientServices.reduce((sum, s) => sum + s.value, 0)
  const last           = clientServices[0]
  const days           = last ? daysSince(last.date) : null
  const alertDays      = client.alertDays || config.defaultAlertDays
  const [editingAlert, setEditingAlert] = useState(false)
  const [alertVal,     setAlertVal]     = useState(client.alertDays || config.defaultAlertDays)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="fade-in">
      <button style={{ background:'none', border:'none', color:palette.warm, fontSize:13, display:'flex', alignItems:'center', gap:6, marginBottom:20, padding:0 }} onClick={onBack}>
        <i className="ti ti-arrow-left" aria-hidden />Voltar
      </button>

      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:14, marginBottom:20, alignItems:'start' }}>
        <div style={{ ...S.card, marginBottom:0, padding:'24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
            <Avatar name={client.name} size={56} />
            <div>
              <h2 style={{ fontSize:22, color:palette.espresso, fontFamily:"'Cormorant Garamond', Georgia, serif", fontWeight:500 }}>{client.name}</h2>
              <div style={{ fontSize:13.5, color:palette.warm, marginTop:4 }}>{client.phone}</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
            {[['Total faturado', fmtCur(total)], ['Visitas', clientServices.length], ['Última visita', last ? fmtDate(last.date) : '—'], ['Dias sem visita', days !== null ? `${days}d` : '—']].map(([label, value]) => (
              <div key={label} style={{ background:palette.bg, borderRadius:8, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:palette.warm, textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:18, color:palette.espresso, fontFamily:"'Cormorant Garamond', Georgia, serif" }}>{value}</div>
              </div>
            ))}
          </div>
          {client.notes && (
            <div style={{ background:palette.roseLight, borderRadius:8, padding:'12px 14px', fontSize:13, color:palette.roseDark, lineHeight:1.6 }}>
              <i className="ti ti-notes" style={{ marginRight:6 }} aria-hidden />{client.notes}
            </div>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10, minWidth:170 }}>
          <button className="btn-wa" style={S.btnWA} onClick={() => openWA(client.phone, client.name)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.1.546 4.07 1.5 5.784L0 24l6.37-1.471A11.935 11.935 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.85 0-3.585-.5-5.084-1.374L2.5 21.5l.898-4.345A9.958 9.958 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            WhatsApp
          </button>
          <button className="btn-primary" style={S.btnPrimary} onClick={onAddService}>
            <i className="ti ti-plus" aria-hidden />Atendimento
          </button>
          <button className="btn-outline" style={S.btnOutline} onClick={onEdit}>
            <i className="ti ti-edit" aria-hidden />Editar
          </button>
          <button className="btn-danger" style={{ ...S.btnDanger, marginTop:8 }} onClick={() => setConfirmDelete(true)}>
            <i className="ti ti-trash" aria-hidden /> Excluir
          </button>
        </div>
      </div>

      {/* Alerta de retorno */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}><i className="ti ti-bell" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Alerta de Retorno</span>
          {!editingAlert && <button className="btn-outline" style={S.btnOutline} onClick={() => setEditingAlert(true)}>Personalizar</button>}
        </div>
        <div style={{ padding:'16px 24px', display:'flex', alignItems:'center', gap:16 }}>
          {editingAlert ? (
            <>
              <span style={{ fontSize:13.5, color:palette.espresso }}>Alertar após</span>
              <input type="number" style={{ ...S.input, width:80 }} value={alertVal} onChange={e => setAlertVal(Number(e.target.value))} min={1} max={365} />
              <span style={{ fontSize:13.5, color:palette.espresso }}>dias sem visita</span>
              <button className="btn-primary" style={S.btnPrimary} onClick={() => { onUpdateClient(client.id, { alertDays: alertVal }); setEditingAlert(false) }}>Salvar</button>
              <button className="btn-outline" style={S.btnOutline} onClick={() => setEditingAlert(false)}>Cancelar</button>
            </>
          ) : (
            <>
              <div style={{ width:44, height:44, borderRadius:'50%', background: days >= alertDays ? palette.alertRedBg : palette.roseLight, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-bell" style={{ fontSize:20, color: days >= alertDays ? palette.alertRed : palette.roseDark }} aria-hidden />
              </div>
              <div>
                <div style={{ fontSize:14, color:palette.espresso, fontWeight:500 }}>
                  {days >= alertDays ? `⚠️ Alerta ativo — ${days} dias sem visita!` : days !== null ? `✅ ${days} dias desde a última visita` : 'Sem visitas registradas'}
                </div>
                <div style={{ fontSize:12.5, color:palette.warm, marginTop:3 }}>Alerta: {alertDays} dias · {client.alertDays ? 'personalizado' : 'padrão global'}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}><i className="ti ti-history" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Histórico de Atendimentos</span>
          <span style={{ fontSize:13, color:palette.warm }}>{clientServices.length} visitas · {fmtCur(total)}</span>
        </div>
        {clientServices.length === 0
          ? <div style={S.emptyState}><i className="ti ti-scissors" style={{ fontSize:32, display:'block', marginBottom:8 }} aria-hidden />Nenhum atendimento ainda</div>
          : clientServices.map((s, i) => (
              <div key={s.id} className="srv-row" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 24px', borderBottom: i < clientServices.length-1 ? `1px solid ${palette.border}` : 'none' }}>
                <div style={{ width:40, height:40, borderRadius:8, background:palette.roseLight, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className="ti ti-scissors" style={{ color:palette.roseDark, fontSize:18 }} aria-hidden />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, color:palette.espresso, fontWeight:500 }}>{s.description}</div>
                  <div style={{ fontSize:12, color:palette.warm, marginTop:2 }}><i className="ti ti-calendar" style={{ marginRight:4 }} aria-hidden />{fmtDate(s.date)}</div>
                </div>
                <span style={{ fontSize:15, fontWeight:500, color:palette.roseDark }}>{fmtCur(s.value)}</span>
                <button style={{ background:'none', border:'none', color:'#ccc', padding:6, cursor:'pointer' }} onClick={() => onDeleteService(s.id)}>
                  <i className="ti ti-trash" aria-hidden />
                </button>
              </div>
            ))
        }
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(44,26,29,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:palette.white, borderRadius:16, padding:32, maxWidth:360, width:'90%', textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>⚠️</div>
            <h3 style={{ fontSize:18, color:palette.espresso, marginBottom:8, fontFamily:"'Cormorant Garamond', Georgia, serif" }}>Excluir {client.name}?</h3>
            <p style={{ fontSize:13.5, color:palette.warm, marginBottom:24, lineHeight:1.6 }}>Todos os atendimentos serão excluídos permanentemente.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button className="btn-outline" style={S.btnOutline} onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn-danger" style={S.btnDanger} onClick={() => { onDeleteClient(client.id); onBack() }}>Sim, excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulário de cliente ───────────────────────────────
function ClientForm({ initial, onSave, onCancel, title }) {
  const [form, setForm] = useState(initial || { name:'', phone:'', notes:'', alertDays:'' })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.name.trim() && form.phone.trim()

  return (
    <div className="fade-in" style={{ maxWidth:520 }}>
      <button style={{ background:'none', border:'none', color:palette.warm, fontSize:13, display:'flex', alignItems:'center', gap:6, marginBottom:20, padding:0 }} onClick={onCancel}>
        <i className="ti ti-arrow-left" aria-hidden />Voltar
      </button>
      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>{title}</span></div>
        <div style={{ padding:'24px' }}>
          <div style={S.formGroup}>
            <label style={S.label}>Nome completo *</label>
            <input style={S.input} placeholder="Ex: Ana Paula Silva" value={form.name} onChange={set('name')} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Telefone / WhatsApp *</label>
            <input style={S.input} placeholder="Ex: 11 99999-9999" value={form.phone} onChange={set('phone')} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Observações</label>
            <textarea style={{ ...S.input, height:80, resize:'vertical' }} placeholder="Cor favorita, alergias, preferências..." value={form.notes} onChange={set('notes')} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Alerta personalizado (dias)</label>
            <input style={S.input} type="number" placeholder="Deixe em branco para usar o padrão global" value={form.alertDays} onChange={set('alertDays')} min={1} max={365} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button className="btn-outline" style={S.btnOutline} onClick={onCancel}>Cancelar</button>
            <button className="btn-primary" style={{ ...S.btnPrimary, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }} onClick={() => valid && onSave(form)} disabled={!valid}>
              Salvar cliente
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Formulário de atendimento ───────────────────────────
function ServiceForm({ clients, selectedClientId, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ clientId: selectedClientId || '', description:'', value:'', date: today })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.clientId && form.description.trim() && form.value && form.date

  return (
    <div className="fade-in" style={{ maxWidth:520 }}>
      <button style={{ background:'none', border:'none', color:palette.warm, fontSize:13, display:'flex', alignItems:'center', gap:6, marginBottom:20, padding:0 }} onClick={onCancel}>
        <i className="ti ti-arrow-left" aria-hidden />Voltar
      </button>
      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}><i className="ti ti-scissors" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Atendimento</span></div>
        <div style={{ padding:'24px' }}>
          <div style={S.formGroup}>
            <label style={S.label}>Cliente *</label>
            <select style={{ ...S.input, appearance:'none' }} value={form.clientId} onChange={set('clientId')}>
              <option value="">Selecione a cliente...</option>
              {[...clients].sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Serviço realizado *</label>
            <input style={S.input} placeholder="Ex: Corte + escova, Coloração, Hidratação..." value={form.description} onChange={set('description')} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={S.formGroup}>
              <label style={S.label}>Valor (R$) *</label>
              <input style={S.input} type="number" placeholder="0,00" value={form.value} onChange={set('value')} min={0} step={0.01} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Data *</label>
              <input style={S.input} type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button className="btn-outline" style={S.btnOutline} onClick={onCancel}>Cancelar</button>
            <button className="btn-primary" style={{ ...S.btnPrimary, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }} onClick={() => valid && onSave(form)} disabled={!valid}>
              Registrar atendimento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Alertas ─────────────────────────────────────────────
function AlertsView({ clients, services, config, setView, setSelectedId, alertClients, onSaveConfig }) {
  const [editGlobal, setEditGlobal] = useState(false)
  const [globalDays, setGlobalDays] = useState(config.defaultAlertDays)

  return (
    <div className="fade-in">
      <div style={{ ...S.card, marginBottom:20 }}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}><i className="ti ti-settings" style={{ color:palette.rose, marginRight:7 }} aria-hidden />Configuração Global de Alertas</span>
          {!editGlobal && <button className="btn-outline" style={S.btnOutline} onClick={() => setEditGlobal(true)}>Editar</button>}
        </div>
        <div style={{ padding:'16px 24px', display:'flex', alignItems:'center', gap:12 }}>
          {editGlobal ? (
            <>
              <span style={{ fontSize:14, color:palette.espresso }}>Alertar clientes após</span>
              <input type="number" style={{ ...S.input, width:80 }} value={globalDays} onChange={e => setGlobalDays(Number(e.target.value))} min={1} max={365} />
              <span style={{ fontSize:14, color:palette.espresso }}>dias sem visita</span>
              <button className="btn-primary" style={S.btnPrimary} onClick={() => { onSaveConfig({ defaultAlertDays: globalDays }); setEditGlobal(false) }}>Salvar</button>
              <button className="btn-outline" style={S.btnOutline} onClick={() => setEditGlobal(false)}>Cancelar</button>
            </>
          ) : (
            <div style={{ fontSize:14, color:palette.espresso }}>
              <i className="ti ti-bell" style={{ color:palette.rose, marginRight:8 }} aria-hidden />
              Alerta padrão: <strong>{config.defaultAlertDays} dias</strong> sem visita
            </div>
          )}
        </div>
      </div>
      <div style={S.card}>
        <div style={{ ...S.cardHeader, background: alertClients.length > 0 ? palette.alertRedBg : undefined }}>
          <span style={{ ...S.cardTitle, color: alertClients.length > 0 ? palette.alertRed : palette.espresso }}>
            <i className={`ti ${alertClients.length > 0 ? 'ti-bell-ringing alert-pulse' : 'ti-bell-check'}`} style={{ marginRight:7 }} aria-hidden />
            {alertClients.length > 0 ? `${alertClients.length} cliente(s) precisam de atenção` : 'Nenhum alerta ativo'}
          </span>
        </div>
        {alertClients.length === 0
          ? <div style={S.emptyState}><div style={{ fontSize:40, marginBottom:12 }}>✅</div>Nenhuma cliente sumida!</div>
          : [...alertClients].sort((a,b) => {
              const la = services.filter(s => s.clientId === a.id).sort((x,y) => new Date(y.date)-new Date(x.date))[0]
              const lb = services.filter(s => s.clientId === b.id).sort((x,y) => new Date(y.date)-new Date(x.date))[0]
              return daysSince(la?.date || a.createdAt) - daysSince(lb?.date || b.createdAt)
            }).reverse().map((c, i, arr) => {
              const last      = services.filter(s => s.clientId === c.id).sort((a,b) => new Date(b.date)-new Date(a.date))[0]
              const days      = last ? daysSince(last.date) : null
              const alertDays = c.alertDays || config.defaultAlertDays
              return (
                <div key={c.id} className="client-row" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 24px', borderBottom: i < arr.length-1 ? `1px solid ${palette.border}` : 'none' }}>
                  <Avatar name={c.name} size={42} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, color:palette.espresso, fontWeight:500 }}>{c.name}</div>
                    <div style={{ fontSize:12.5, color:palette.warm, marginTop:2 }}>
                      {last ? `Última visita: ${fmtDate(last.date)} · ${last.description}` : 'Nenhuma visita registrada'}
                    </div>
                    <div style={{ fontSize:11.5, color:palette.warm, marginTop:1 }}>Alerta: {alertDays} dias{c.alertDays ? ' (personalizado)' : ''}</div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <Badge type="red">{days}d</Badge>
                    <button className="btn-wa" style={{ ...S.btnWA, padding:'7px 14px', fontSize:12.5 }} onClick={() => openWA(c.phone, c.name)}>
                      <i className="ti ti-brand-whatsapp" aria-hidden />WA
                    </button>
                    <button className="btn-outline" style={{ ...S.btnOutline, fontSize:12 }} onClick={() => { setSelectedId(c.id); setView('detail') }}>
                      Ver perfil
                    </button>
                  </div>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Ranking ─────────────────────────────────────────────
function RankingView({ clients, services, setView, setSelectedId }) {
  const ranked = [...clients].map(c => ({
    ...c,
    total:  services.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.value, 0),
    visits: services.filter(s => s.clientId === c.id).length,
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="fade-in">
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}><i className="ti ti-crown" style={{ color:'#EF9F27', marginRight:7 }} aria-hidden />Ranking por Faturamento</span>
        </div>
        {ranked.length === 0
          ? <div style={S.emptyState}>Nenhuma cliente cadastrada ainda</div>
          : ranked.map((c, i) => (
              <div key={c.id} className="client-row" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 24px', borderBottom: i < ranked.length-1 ? `1px solid ${palette.border}` : 'none', cursor:'pointer' }}
                onClick={() => { setSelectedId(c.id); setView('detail') }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background: i === 0 ? '#FAEEDA' : i === 1 ? '#F1EFE8' : i === 2 ? '#FAECE7' : palette.roseLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:600, color: i === 0 ? '#854F0B' : i === 1 ? '#5F5E5A' : i === 2 ? '#993C1D' : palette.roseDark, flexShrink:0 }}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                </div>
                <Avatar name={c.name} size={38} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, color:palette.espresso, fontWeight:500 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:palette.warm }}>{c.visits} visita{c.visits !== 1 ? 's' : ''} · Ticket médio: {c.visits > 0 ? fmtCur(c.total / c.visits) : '—'}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:80, height:6, borderRadius:3, background:palette.border, overflow:'hidden' }}>
                    <div style={{ width:`${ranked[0].total > 0 ? (c.total/ranked[0].total)*100 : 0}%`, height:'100%', background:palette.rose, borderRadius:3 }} />
                  </div>
                  <span style={{ fontSize:15, fontWeight:500, color:palette.roseDark, minWidth:90, textAlign:'right' }}>{fmtCur(c.total)}</span>
                </div>
                <i className="ti ti-chevron-right" style={{ color:palette.warm, fontSize:16 }} aria-hidden />
              </div>
            ))
        }
      </div>
    </div>
  )
}

// ─── Tela de recurso bloqueado (Pro) ─────────────────────
function ProLockView({ title, icon, description, features, setView }) {
  return (
    <div className="fade-in" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{ maxWidth:480, width:'100%', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:20, background:palette.roseLight, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <i className={`ti ${icon}`} style={{ fontSize:32, color:palette.rose }} aria-hidden />
        </div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#FAEEDA', color:'#854F0B', fontSize:12, fontWeight:500, padding:'4px 14px', borderRadius:20, marginBottom:16 }}>
          <i className="ti ti-lock" aria-hidden /> Plano Profissional
        </div>
        <h2 style={{ fontSize:26, fontFamily:"'Cormorant Garamond', Georgia, serif", fontWeight:500, color:palette.espresso, marginBottom:12 }}>{title}</h2>
        <p style={{ fontSize:14, color:palette.warm, lineHeight:1.7, maxWidth:380, margin:'0 auto 28px' }}>{description}</p>
        <div style={{ background:palette.white, border:`1px solid ${palette.border}`, borderRadius:14, padding:'20px 24px', marginBottom:28, textAlign:'left' }}>
          {features.map((f, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i < features.length-1 ? `1px solid ${palette.border}` : 'none' }}>
              <i className="ti ti-circle-check" style={{ color:palette.rose, fontSize:17, flexShrink:0 }} aria-hidden />
              <span style={{ fontSize:13.5, color:palette.espresso }}>{f}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary" style={{ ...S.btnPrimary, justifyContent:'center', width:'100%', padding:'14px', fontSize:15 }} onClick={() => setView('planos')}>
          <i className="ti ti-arrow-up-circle" aria-hidden /> Ver Planos e Fazer Upgrade
        </button>
        <p style={{ fontSize:12, color:palette.warm, marginTop:12 }}>14 dias grátis · Cancele quando quiser</p>
      </div>
    </div>
  )
}

// ─── Tela de planos ──────────────────────────────────────
function PlansView({ setView, clientCount }) {
  const [annual, setAnnual] = useState(false)
  const essencialPrice = annual ? 39 : 47
  const proPrice       = annual ? 79 : 97

  const essencialFeatures = [
    { label:'Até 50 clientes cadastrados',     ok:true  },
    { label:'Registro de atendimentos',         ok:true  },
    { label:'Histórico e ranking de clientes',  ok:true  },
    { label:'Alertas de retorno configuráveis', ok:true  },
    { label:'Botão WhatsApp direto',            ok:true  },
    { label:'Clientes ilimitados',              ok:false },
    { label:'Agendamento de horários',          ok:false },
    { label:'Lembrete automático WhatsApp',     ok:false },
    { label:'Relatório semanal simples',        ok:false },
    { label:'Receita mensal detalhada',         ok:false },
  ]
  const proFeatures = [
    { label:'Tudo do Plano Essencial'                   },
    { label:'Clientes ilimitados'                       },
    { label:'Agendamento de horários'                   },
    { label:'Lembrete automático WhatsApp (1 dia antes)'},
    { label:'Relatório semanal simples'                 },
    { label:'Controle de receita mensal'                },
    { label:'Suporte prioritário via WhatsApp'          },
  ]

  return (
    <div className="fade-in">
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <p style={{ fontSize:13.5, color:palette.warm, marginBottom:16 }}>
          Você está no <strong style={{ color:palette.espresso }}>Plano Essencial</strong> · {clientCount}/{ESSENCIAL_LIMIT} clientes usados.
        </p>
        <div style={{ display:'inline-flex', background:palette.roseLight, borderRadius:30, padding:4 }}>
          {['Mensal','Anual (-17%)'].map((label, i) => (
            <button key={label} style={{ padding:'8px 20px', borderRadius:24, border:'none', fontSize:13, fontWeight:500, background: annual === !!i ? palette.rose : 'transparent', color: annual === !!i ? '#fff' : palette.warm, transition:'all 0.18s' }} onClick={() => setAnnual(!!i)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:760, margin:'0 auto' }}>
        {/* Essencial */}
        <div style={{ background:palette.bg, border:`2px solid ${palette.rose}`, borderRadius:16, padding:'28px 26px', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:palette.roseLight, color:palette.roseDark, fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:20, marginBottom:14, alignSelf:'flex-start' }}>✓ Plano atual</div>
          <div style={{ fontSize:22, fontFamily:"'Cormorant Garamond', Georgia, serif", color:palette.espresso, marginBottom:10 }}>Essencial</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:4 }}>
            <span style={{ fontSize:13, color:palette.warm }}>R$</span>
            <span style={{ fontSize:40, fontFamily:"'Cormorant Garamond', Georgia, serif", color:palette.espresso }}>{essencialPrice}</span>
            <span style={{ fontSize:13, color:palette.warm }}>/mês</span>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:palette.warm, marginBottom:4 }}>
              <span>Clientes cadastrados</span><span>{clientCount}/{ESSENCIAL_LIMIT}</span>
            </div>
            <div style={{ height:5, background:palette.border, borderRadius:3, overflow:'hidden' }}>
              <div style={{ width:`${Math.min((clientCount/ESSENCIAL_LIMIT)*100,100)}%`, height:'100%', background: clientCount >= ESSENCIAL_LIMIT ? '#A32D2D' : clientCount >= 40 ? '#854F0B' : palette.rose, borderRadius:3 }} />
            </div>
          </div>
          <div style={{ flex:1, marginBottom:20 }}>
            {essencialFeatures.map(({ label, ok }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`1px solid ${palette.border}`, opacity: ok ? 1 : 0.4 }}>
                <i className={`ti ${ok ? 'ti-circle-check' : 'ti-circle-x'}`} style={{ color: ok ? palette.rose : palette.border, fontSize:16, flexShrink:0 }} aria-hidden />
                <span style={{ fontSize:13, color: ok ? palette.espresso : palette.warm }}>{label}</span>
              </div>
            ))}
          </div>
          <button className="btn-outline" style={{ ...S.btnOutline, width:'100%', justifyContent:'center', padding:'12px' }} disabled>Plano atual</button>
        </div>

        {/* Profissional */}
        <div style={{ background:palette.sidebar, border:'1px solid rgba(155,114,207,0.3)', borderRadius:16, padding:'28px 26px', display:'flex', flexDirection:'column', position:'relative' }}>
          <div style={{ position:'absolute', top:16, right:16, background:palette.rose, color:'#fff', fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:20, letterSpacing:0.5 }}>MAIS POPULAR</div>
          <div style={{ fontSize:22, fontFamily:"'Cormorant Garamond', Georgia, serif", color:'#EDE5F5', marginBottom:10 }}>Profissional</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:20 }}>
            <span style={{ fontSize:13, color:'rgba(237,229,245,0.6)' }}>R$</span>
            <span style={{ fontSize:40, fontFamily:"'Cormorant Garamond', Georgia, serif", color:'#EDE5F5' }}>{proPrice}</span>
            <span style={{ fontSize:13, color:'rgba(237,229,245,0.6)' }}>/mês</span>
          </div>
          <div style={{ flex:1, marginBottom:20 }}>
            {proFeatures.map(({ label }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid rgba(155,114,207,0.2)' }}>
                <i className="ti ti-circle-check" style={{ color:'#C9A8F0', fontSize:16, flexShrink:0 }} aria-hidden />
                <span style={{ fontSize:13, color:'#EDE5F5' }}>{label}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ ...S.btnPrimary, width:'100%', justifyContent:'center', padding:'13px', background:palette.rose }}>
            <i className="ti ti-arrow-up-circle" aria-hidden /> Fazer Upgrade Agora
          </button>
          <p style={{ fontSize:11, color:'rgba(237,229,245,0.4)', textAlign:'center', marginTop:10 }}>14 dias grátis · Sem cartão de crédito</p>
        </div>
      </div>

      {/* Plano Negócio - Em breve */}
      <div style={{ maxWidth:760, margin:'20px auto 0', background:palette.white, border:`1px dashed ${palette.border}`, borderRadius:16, padding:'20px 26px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:44, height:44, borderRadius:10, background:palette.roseLight, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <i className="ti ti-building-store" style={{ fontSize:22, color:palette.rose }} aria-hidden />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:500, color:palette.espresso, marginBottom:3 }}>
            Plano Negócio <span style={{ fontSize:11, background:'#FAEEDA', color:'#854F0B', padding:'2px 8px', borderRadius:10, marginLeft:6 }}>Em breve</span>
          </div>
          <div style={{ fontSize:12.5, color:palette.warm }}>Múltiplos profissionais com login individual, até 3 colaboradoras, relatórios por equipe e muito mais.</div>
        </div>
        <button className="btn-outline" style={{ ...S.btnOutline, fontSize:12, whiteSpace:'nowrap' }}>Quero ser avisada</button>
      </div>
    </div>
  )
}

// ─── APP PRINCIPAL ───────────────────────────────────────
export default function App() {
  const [view,           setView]           = useState('dashboard')
  const [clients,        setClients]        = useState([])
  const [services,       setServices]       = useState([])
  const [selectedId,     setSelectedId]     = useState(null)
  const [config,         setConfig]         = useState({ defaultAlertDays: 30 })
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)

  // Carrega todos os dados do Supabase ao iniciar
  useEffect(() => {
    Promise.all([dbLoadClients(), dbLoadServices(), dbLoadConfig()])
      .then(([c, s, cfg]) => { setClients(c); setServices(s); setConfig(cfg) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // ── Operações de Cliente ──
  const addClient = async (data) => {
    if (clients.length >= ESSENCIAL_LIMIT) return
    const nc = {
      id: genId(),
      name: data.name.trim(),
      phone: data.phone.trim(),
      notes: data.notes?.trim() || '',
      alertDays: data.alertDays ? Number(data.alertDays) : undefined,
      createdAt: new Date().toISOString(),
    }
    if (!nc.alertDays) delete nc.alertDays
    await dbInsertClient(nc)
    setClients(prev => [...prev, nc])
    return nc
  }

  const updateClient = async (id, data) => {
    await dbUpdateClient(id, data)
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
  }

  const deleteClient = async (id) => {
    await dbDeleteClient(id)
    setClients(prev  => prev.filter(c => c.id !== id))
    setServices(prev => prev.filter(s => s.clientId !== id))
  }

  // ── Operações de Serviço ──
  const addService = async (data) => {
    const ns = {
      id: genId(),
      clientId: data.clientId,
      description: data.description.trim(),
      value: Number(data.value),
      date: data.date,
      createdAt: new Date().toISOString(),
    }
    await dbInsertService(ns)
    setServices(prev => [...prev, ns])
  }

  const deleteService = async (id) => {
    await dbDeleteService(id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  // ── Configuração ──
  const saveConfig = async (cfg) => {
    await dbSaveConfig(cfg.defaultAlertDays)
    setConfig(cfg)
  }

  // ── Dados derivados ──
  const alertClients = clients.filter(c => {
    const last = services.filter(s => s.clientId === c.id).sort((a,b) => new Date(b.date)-new Date(a.date))[0]
    if (!last) return false
    return daysSince(last.date) >= (c.alertDays || config.defaultAlertDays)
  })

  const selectedClient = clients.find(c => c.id === selectedId)

  // ── Navegação ──
  const navItems = [
    { id:'dashboard',   label:'Dashboard',          icon:'ti-layout-dashboard' },
    { id:'clients',     label:'Clientes',            icon:'ti-users' },
    { id:'add-service', label:'Atendimento',         icon:'ti-scissors' },
    { id:'alerts',      label:'Alertas',             icon:'ti-bell', badge: alertClients.length || null },
    { id:'ranking',     label:'Ranking',             icon:'ti-crown' },
    { section: 'Plano Profissional' },
    { id:'agenda',      label:'Agendamento',         icon:'ti-calendar',       pro:true },
    { id:'lembrete',    label:'Lembrete WhatsApp',   icon:'ti-brand-whatsapp', pro:true },
    { id:'relatorio',   label:'Relatório Semanal',   icon:'ti-chart-bar',      pro:true },
    { id:'receita',     label:'Receita Mensal',      icon:'ti-cash',           pro:true },
    { section: 'Conta' },
    { id:'planos',      label:'Ver Planos',          icon:'ti-arrow-up-circle' },
  ]

  const headerInfo = {
    dashboard:    { title:'Dashboard',                  sub: `Bem-vinda de volta! ${new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}` },
    clients:      { title:'Clientes',                   sub:`${clients.length}/${ESSENCIAL_LIMIT} clientes · Plano Essencial` },
    'add-client': { title:'Nova Cliente',               sub:'Preencha os dados abaixo' },
    'edit-client':{ title:'Editar Cliente',             sub: selectedClient?.name },
    'add-service':{ title:'Atendimento',                sub:'Registre uma visita' },
    detail:       { title: selectedClient?.name || '',  sub:`${services.filter(s => s.clientId === selectedId).length} visitas registradas` },
    alerts:       { title:'Alertas de Retorno',         sub:`${alertClients.length} cliente(s) precisam de atenção` },
    ranking:      { title:'Ranking de Clientes',        sub:'Quem mais faturou para você' },
    agenda:       { title:'Agendamento',                sub:'Disponível no Plano Profissional' },
    lembrete:     { title:'Lembrete Automático',        sub:'Disponível no Plano Profissional' },
    relatorio:    { title:'Relatório Semanal',          sub:'Disponível no Plano Profissional' },
    receita:      { title:'Receita Mensal',             sub:'Disponível no Plano Profissional' },
    planos:       { title:'Planos',                     sub:'Escolha o plano ideal para seu salão' },
  }

  const info = headerInfo[view] || headerInfo.dashboard

  // ── Tela de carregamento ──
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:palette.bg, flexDirection:'column', gap:16 }}>
      <style>{css}</style>
      <div style={{ width:48, height:48, border:`3px solid ${palette.roseLight}`, borderTopColor:palette.rose, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span style={{ color:palette.warm, fontSize:14 }}>Carregando seu salão...</span>
    </div>
  )

  // ── Tela de erro de conexão ──
  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:palette.bg, flexDirection:'column', gap:16, padding:32 }}>
      <style>{css}</style>
      <i className="ti ti-wifi-off" style={{ fontSize:48, color:palette.roseDark }} aria-hidden />
      <h2 style={{ fontSize:20, color:palette.espresso, fontFamily:"'Cormorant Garamond', Georgia, serif" }}>Erro ao conectar com o banco de dados</h2>
      <p style={{ fontSize:13.5, color:palette.warm, textAlign:'center', maxWidth:420, lineHeight:1.7 }}>
        Verifique se as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> estão configuradas corretamente no arquivo <code>.env</code>.
      </p>
      <p style={{ fontSize:12, color:palette.warm, background:palette.roseLight, padding:'8px 16px', borderRadius:8 }}>Detalhe: {error}</p>
      <button className="btn-primary" style={S.btnPrimary} onClick={() => window.location.reload()}>
        <i className="ti ti-refresh" aria-hidden /> Tentar novamente
      </button>
    </div>
  )

  return (
    <>
      <style>{css}</style>
      <div style={S.app}>
        {/* SIDEBAR */}
        <aside style={S.sidebar}>
          <div style={S.logo}>
            <div style={S.logoTitle}>✂ Salão Studio</div>
            <div style={S.logoSub}>Gestão Inteligente</div>
          </div>
          <nav style={S.nav}>
            <div style={S.navSection}>Menu</div>
            {navItems.map((item, i) => {
              if (item.section) return <div key={i} style={S.navSection}>{item.section}</div>
              const isActive = view === item.id || (item.id === 'clients' && ['detail','add-client','edit-client'].includes(view))
              return (
                <div key={item.id} className="nav-item" style={{ ...S.navItem(isActive), opacity: item.pro ? 0.75 : 1 }}
                  onClick={() => setView(item.id)}>
                  <i className={`ti ${item.icon}`} aria-hidden />
                  {item.label}
                  {item.badge > 0 && <span style={S.navBadge}>{item.badge}</span>}
                  {item.pro && <i className="ti ti-lock" style={{ fontSize:11, marginLeft:'auto', color:'#C9A8F0', opacity:0.7 }} aria-hidden />}
                </div>
              )
            })}
          </nav>
          <div style={S.sidebarFooter}>
            <div style={{ background:'rgba(155,114,207,0.15)', borderRadius:8, padding:'10px 12px', marginBottom:12, cursor:'pointer' }} onClick={() => setView('planos')}>
              <div style={{ fontSize:10, color:'rgba(237,229,245,0.5)', textTransform:'uppercase', letterSpacing:1.5, marginBottom:4 }}>Plano atual</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, color:'#EDE5F5', fontWeight:500 }}>Essencial</span>
                <span style={{ fontSize:10, background:palette.rose, color:'#fff', padding:'2px 8px', borderRadius:10 }}>Upgrade</span>
              </div>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', lineHeight:1.5 }}>
              Salão Studio v1.0<br />
              {clients.length} clientes · {services.length} atendimentos
            </div>
          </div>
        </aside>

        {/* CONTEÚDO PRINCIPAL */}
        <main style={S.main}>
          <header style={S.header}>
            <div style={S.headerLeft}>
              <h1 style={S.headerTitle}>{info.title}</h1>
              {info.sub && <span style={S.headerSub}>{info.sub}</span>}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {view === 'clients' && (
                clients.length >= ESSENCIAL_LIMIT
                  ? <button style={{ ...S.btnOutline, display:'flex', alignItems:'center', gap:7, opacity:0.7, cursor:'not-allowed' }} onClick={() => setView('planos')}>
                      <i className="ti ti-lock" aria-hidden />Limite atingido · Upgrade
                    </button>
                  : <button className="btn-primary" style={S.btnPrimary} onClick={() => setView('add-client')}>
                      <i className="ti ti-plus" aria-hidden />Nova Cliente
                    </button>
              )}
              {view === 'detail' && selectedClient && (
                <button className="btn-wa" style={S.btnWA} onClick={() => openWA(selectedClient.phone, selectedClient.name)}>
                  <i className="ti ti-brand-whatsapp" aria-hidden />WhatsApp
                </button>
              )}
            </div>
          </header>

          <div style={S.content}>
            {view === 'dashboard'   && <Dashboard    clients={clients} services={services} setView={setView} setSelectedId={setSelectedId} alertClients={alertClients} />}
            {view === 'clients'     && <ClientList   clients={clients} services={services} config={config} setView={setView} setSelectedId={setSelectedId} onAddClient={() => setView('add-client')} />}
            {view === 'add-client'  && <ClientForm   title="Nova Cliente" onSave={async data => { await addClient(data); setView('clients') }} onCancel={() => setView('clients')} />}
            {view === 'edit-client' && selectedClient && <ClientForm title={`Editar — ${selectedClient.name}`} initial={selectedClient} onSave={async data => { await updateClient(selectedId, { ...data, alertDays: data.alertDays ? Number(data.alertDays) : undefined }); setView('detail') }} onCancel={() => setView('detail')} />}
            {view === 'detail'      && selectedClient && <ClientDetail client={selectedClient} services={services} config={config} onBack={() => setView('clients')} onEdit={() => setView('edit-client')} onAddService={() => setView('add-service')} onDeleteClient={async id => { await deleteClient(id); setView('clients') }} onDeleteService={deleteService} onUpdateClient={updateClient} />}
            {view === 'add-service' && <ServiceForm  clients={clients} selectedClientId={selectedId} onSave={async data => { await addService(data); setSelectedId(data.clientId); setView('detail') }} onCancel={() => setView(selectedId ? 'detail' : 'clients')} />}
            {view === 'alerts'      && <AlertsView   clients={clients} services={services} config={config} setView={setView} setSelectedId={setSelectedId} alertClients={alertClients} onSaveConfig={saveConfig} />}
            {view === 'ranking'     && <RankingView  clients={clients} services={services} setView={setView} setSelectedId={setSelectedId} />}
            {view === 'agenda'      && <ProLockView  title="Agendamento de Horários"          icon="ti-calendar"       description="Visualize e organize sua agenda diária e semanal. Reduza faltas e evite conflitos de horário."                                            features={['Agenda diária e semanal','Confirmação via WhatsApp','Bloqueio de horários indisponíveis','Histórico de agendamentos']}        setView={setView} />}
            {view === 'lembrete'    && <ProLockView  title="Lembrete Automático WhatsApp"     icon="ti-brand-whatsapp" description="O sistema avisa automaticamente cada cliente 1 dia antes do horário agendado — sem você precisar fazer nada."                        features={['Mensagem automática 1 dia antes','Texto personalizável por salão','Confirmação de presença pela cliente','Zero esforço manual']} setView={setView} />}
            {view === 'relatorio'   && <ProLockView  title="Relatório Semanal Simples"        icon="ti-chart-bar"      description="Todo início de semana receba um resumo: atendimentos realizados, faturamento e clientes atendidas."                                   features={['Resumo semanal automático','Total de atendimentos e faturamento','Clientes mais frequentes da semana','Comparativo com semana anterior']} setView={setView} />}
            {view === 'receita'     && <ProLockView  title="Controle de Receita Mensal"       icon="ti-cash"           description="Visualize quanto entrou no caixa mês a mês, compare períodos e identifique seus melhores meses."                                       features={['Receita total por mês','Comparativo entre meses','Gráfico de evolução do faturamento','Filtro por tipo de serviço']}                  setView={setView} />}
            {view === 'planos'      && <PlansView    setView={setView} clientCount={clients.length} />}
          </div>
        </main>
      </div>
    </>
  )
}
