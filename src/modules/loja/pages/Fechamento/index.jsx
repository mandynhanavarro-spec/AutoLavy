import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, Banknote, QrCode, CreditCard,
  CheckCircle, Clock, AlertTriangle, Lock,
  ArrowDownCircle, ArrowUpCircle,
  History, LayoutDashboard, Users,
} from 'lucide-react'
import { supabase } from '../../../../shared/lib/supabase'
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { usePermissions } from '../../../../core/hooks/usePermissions'

/* ── helpers ─────────────────────────────────────────────── */

function brl(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

/* ── component ───────────────────────────────────────────── */

export default function Fechamento() {
  const { tenant, profile } = useTenantContext()
  const { can }   = usePermissions()
  const canClose  = can('can_close_cash')
  const orgId     = tenant?.id
  const color     = '#0891b2'
  const navigate  = useNavigate()
  const historyRef = useRef(null)

  const [todaySales, setTodaySales]       = useState([])
  const [closings, setClosings]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [closing, setClosing]             = useState(null)   // null | reg_id | 'single' | 'all'
  const [tableReady, setTableReady]       = useState(true)
  const [alreadyClosed, setAlreadyClosed] = useState(false)
  const [registers, setRegisters]         = useState([])
  const [regSalesMap, setRegSalesMap]     = useState({})
  const [closedToday, setClosedToday]     = useState({})
  const [regMovsMap, setRegMovsMap]       = useState({})   // { [register_id]: { sangria: N, reforco: N } }

  async function load() {
    if (!orgId) return
    setLoading(true)

    /* registers */
    const { data: regsData } = await supabase
      .from('cash_registers')
      .select('id, name')
      .eq('is_active', true)
    setRegisters(regsData ?? [])

    /* today's sales */
    const { data: salesData } = await supabase
      .from('sales')
      .select('id, total_amount, payment_method, register_id')
      .eq('org_id', orgId)
      .gte('created_at', todayStart().toISOString())
    setTodaySales(salesData || [])

    /* build per-register sales map */
    const regMap = {}
    for (const s of (salesData || [])) {
      const rid = s.register_id || '__unknown__'
      if (!regMap[rid]) regMap[rid] = { total: 0, dinheiro: 0, pix: 0, cartao: 0, count: 0 }
      regMap[rid].total += Number(s.total_amount)
      regMap[rid].count++
      if (s.payment_method === 'dinheiro') regMap[rid].dinheiro += Number(s.total_amount)
      if (s.payment_method === 'pix')      regMap[rid].pix      += Number(s.total_amount)
      if (s.payment_method === 'cartao')   regMap[rid].cartao   += Number(s.total_amount)
    }
    setRegSalesMap(regMap)

    /* today's cash movements (sangria / reforço) */
    const { data: movsData } = await supabase
      .from('cash_movements')
      .select('id, register_id, type, amount')
      .gte('created_at', todayStart().toISOString())
    const movsMap = {}
    for (const m of (movsData || [])) {
      const rid = m.register_id || '__unknown__'
      if (!movsMap[rid]) movsMap[rid] = { sangria: 0, reforco: 0 }
      if (m.type === 'sangria') movsMap[rid].sangria += Number(m.amount)
      if (m.type === 'reforco') movsMap[rid].reforco += Number(m.amount)
    }
    setRegMovsMap(movsMap)

    /* closings — may fail if table / column doesn't exist yet */
    const { data: closingsData, error } = await supabase
      .from('cash_closings')
      .select('id, date, register_id, total_sales, total_transactions, total_dinheiro, total_pix, total_cartao, closed_at')
      .eq('org_id', orgId)
      .order('closed_at', { ascending: false })
      .limit(30)

    if (error) {
      setTableReady(false)
    } else {
      setClosings(closingsData || [])
      const today  = todayISO()
      const closed = {}
      for (const c of (closingsData || [])) {
        if (c.date === today) {
          if (c.register_id) closed[c.register_id] = true
          else closed['__legacy__'] = true
        }
      }
      setClosedToday(closed)
      setAlreadyClosed(
        !!closed['__legacy__'] ||
        ((regsData || []).length <= 1 && !!(regsData || [])[0] && !!closed[(regsData || [])[0].id])
      )
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  /* ── totals (used for single-register path) */
  const totalToday    = todaySales.reduce((s, r) => s + Number(r.total_amount), 0)
  const totalDinheiro = todaySales.filter(s => s.payment_method === 'dinheiro').reduce((s, r) => s + Number(r.total_amount), 0)
  const totalPix      = todaySales.filter(s => s.payment_method === 'pix').reduce((s, r) => s + Number(r.total_amount), 0)
  const totalCartao   = todaySales.filter(s => s.payment_method === 'cartao').reduce((s, r) => s + Number(r.total_amount), 0)

  /* ── single-register close */
  async function fecharCaixa() {
    if (!tableReady) return
    if (alreadyClosed) { alert('O caixa deste dia já foi fechado.'); return }
    if (!window.confirm(`Fechar o caixa do dia?\nTotal: ${brl(totalToday)}`)) return

    setClosing('single')
    const { error } = await supabase.from('cash_closings').insert({
      org_id:             orgId,
      closed_by:          profile?.id ?? null,
      register_id:        registers[0]?.id ?? null,
      date:               todayISO(),
      total_sales:        totalToday,
      total_transactions: todaySales.length,
      total_dinheiro:     totalDinheiro,
      total_pix:          totalPix,
      total_cartao:       totalCartao,
    })
    setClosing(null)
    if (error) { alert('Erro ao fechar caixa: ' + error.message); return }
    setAlreadyClosed(true)
    load()
  }

  /* ── per-register close */
  async function fecharCaixaById(registerId) {
    const reg  = registers.find(r => r.id === registerId)
    const data = regSalesMap[registerId] || { total: 0, dinheiro: 0, pix: 0, cartao: 0, count: 0 }
    if (!window.confirm(`Fechar ${reg?.name}?\nTotal: ${brl(data.total)}`)) return

    setClosing(registerId)
    const { error } = await supabase.from('cash_closings').insert({
      org_id:             orgId,
      closed_by:          profile?.id ?? null,
      register_id:        registerId,
      date:               todayISO(),
      total_sales:        data.total,
      total_transactions: data.count,
      total_dinheiro:     data.dinheiro,
      total_pix:          data.pix,
      total_cartao:       data.cartao,
    })
    setClosing(null)
    if (error) { alert('Erro: ' + error.message); return }
    load()
  }

  /* ── close all */
  async function fecharTodos() {
    if (!window.confirm(`Fechar todos os caixas?\nTotal Geral: ${brl(totalToday)}`)) return
    setClosing('all')
    for (const reg of registers) {
      if (closedToday[reg.id]) continue
      const data = regSalesMap[reg.id] || { total: 0, dinheiro: 0, pix: 0, cartao: 0, count: 0 }
      const { error } = await supabase.from('cash_closings').insert({
        org_id:             orgId,
        closed_by:          profile?.id ?? null,
        register_id:        reg.id,
        date:               todayISO(),
        total_sales:        data.total,
        total_transactions: data.count,
        total_dinheiro:     data.dinheiro,
        total_pix:          data.pix,
        total_cartao:       data.cartao,
      })
      if (error) { alert(`Erro ao fechar ${reg.name}: ${error.message}`); break }
    }
    setClosing(null)
    load()
  }

  /* ── loading skeleton */
  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  /* ── derived */
  const dayLabel  = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const isMulti   = registers.length >= 2
  const noneClosedYet  = isMulti && registers.every(r => !closedToday[r.id])
  const allClosedToday = isMulti && registers.every(r => !!closedToday[r.id])

  const quickCloseDisabled =
    !canClose || closing !== null || !tableReady || todaySales.length === 0 ||
    (!isMulti && alreadyClosed) || (isMulti && allClosedToday)

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Mobile quick actions ── */}
      <div className="md:hidden grid grid-cols-2 gap-2.5">
        <button
          onClick={() => isMulti ? fecharTodos() : fecharCaixa()}
          disabled={quickCloseDisabled}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3"
          style={{ backgroundColor: quickCloseDisabled ? '#e5e7eb' : '#0891b2' }}
        >
          <Lock size={22} style={{ color: quickCloseDisabled ? '#9ca3af' : 'white' }} />
          <span
            className="text-[10px] font-bold"
            style={{ color: quickCloseDisabled ? '#9ca3af' : 'white' }}
          >
            Fechar caixa
          </span>
        </button>

        <button
          onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <History size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Histórico</span>
        </button>

        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <LayoutDashboard size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Ir ao Dashboard</span>
        </button>

        <button
          onClick={() => navigate('/equipe')}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] p-3 bg-white border"
          style={{ borderColor: '#e5e7eb' }}
        >
          <Users size={22} style={{ color: '#0891b2' }} />
          <span className="text-[10px] font-bold text-gray-700">Equipe</span>
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900">Fechamento de caixa</h1>
        <p className="text-xs text-gray-400 capitalize mt-0.5">{dayLabel}</p>
      </div>

      {/* Migration notice */}
      {!tableReady && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Migração necessária</p>
            <p className="text-xs text-amber-700 mt-1">
              Execute o script abaixo no Supabase SQL Editor para habilitar o fechamento multi-caixa:
            </p>
            <pre className="mt-2 text-[10px] bg-amber-100 rounded-xl p-3 overflow-x-auto text-amber-900 leading-relaxed whitespace-pre-wrap">
{`-- Cria tabela se ainda não existir
CREATE TABLE IF NOT EXISTS public.cash_closings (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id             UUID REFERENCES public.organizations(id),
  register_id        UUID REFERENCES public.cash_registers(id),
  closed_by          UUID REFERENCES public.profiles(id),
  closed_at          TIMESTAMPTZ DEFAULT NOW(),
  date               DATE NOT NULL,
  total_sales        DECIMAL(10,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_dinheiro     DECIMAL(10,2) DEFAULT 0,
  total_pix          DECIMAL(10,2) DEFAULT 0,
  total_cartao       DECIMAL(10,2) DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
-- Adiciona colunas se a tabela já existia sem elas
ALTER TABLE public.cash_closings
  ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES public.cash_registers(id);
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES public.cash_registers(id);
-- RLS
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_closings_rls ON public.cash_closings;
CREATE POLICY cash_closings_rls ON public.cash_closings
  FOR ALL USING (org_id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_superadmin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closings TO authenticated, service_role;
SELECT pg_notify('pgrst', 'reload schema');`}
            </pre>
          </div>
        </div>
      )}

      {/* ── MULTI-REGISTER layout ── */}
      {isMulti ? (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-gray-700">Resumo por caixa</h2>

          {registers.map(reg => {
            const data      = regSalesMap[reg.id] || { total: 0, dinheiro: 0, pix: 0, cartao: 0, count: 0 }
            const movs      = regMovsMap[reg.id]  || { sangria: 0, reforco: 0 }
            const isClosed  = !!closedToday[reg.id]
            const isClosing = closing === reg.id || closing === 'all'
            const saldoEsperado = data.dinheiro + movs.reforco - movs.sangria

            return (
              <div key={reg.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Card header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{reg.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {data.count} transaç{data.count !== 1 ? 'ões' : 'ão'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">{brl(data.total)}</p>
                    {isClosed && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                        Fechado
                      </span>
                    )}
                  </div>
                </div>

                {/* Payment breakdown */}
                <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                  <div className="bg-green-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold text-green-600 uppercase tracking-wide">Dinheiro</p>
                    <p className="text-xs font-black text-gray-900 mt-0.5">{brl(data.dinheiro)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">PIX</p>
                    <p className="text-xs font-black text-gray-900 mt-0.5">{brl(data.pix)}</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wide">Cartão</p>
                    <p className="text-xs font-black text-gray-900 mt-0.5">{brl(data.cartao)}</p>
                  </div>
                </div>

                {/* Sangrias / Reforços — só quando há movimentação */}
                {(movs.sangria > 0 || movs.reforco > 0) && (
                  <div className="mx-4 mb-3 rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100">
                    {movs.sangria > 0 && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle size={13} className="text-red-500 shrink-0" />
                          <span className="text-[11px] font-semibold text-gray-600">Sangrias</span>
                        </div>
                        <span className="text-[11px] font-black text-red-600">−{brl(movs.sangria)}</span>
                      </div>
                    )}
                    {movs.reforco > 0 && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle size={13} className="text-emerald-500 shrink-0" />
                          <span className="text-[11px] font-semibold text-gray-600">Reforços</span>
                        </div>
                        <span className="text-[11px] font-black text-emerald-600">+{brl(movs.reforco)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-[11px] font-bold text-gray-700">Saldo esperado (dinheiro)</span>
                      <span className="text-[11px] font-black text-gray-900">{brl(saldoEsperado)}</span>
                    </div>
                  </div>
                )}

                {/* Close button */}
                {!isClosed && canClose && tableReady && (
                  <div className="px-4 pb-4">
                    <button
                      onClick={() => fecharCaixaById(reg.id)}
                      disabled={isClosing || data.count === 0}
                      className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                      style={{ backgroundColor: color }}
                    >
                      {isClosing
                        ? 'Fechando...'
                        : data.count === 0
                        ? 'Sem vendas hoje'
                        : `Fechar ${reg.name}`}
                    </button>
                  </div>
                )}

                {!isClosed && !canClose && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <Lock size={13} className="text-gray-400" />
                    <p className="text-xs text-gray-400">Sem permissão para fechar</p>
                  </div>
                )}
              </div>
            )
          })}

          {/* Total Geral */}
          <div className="bg-gray-900 rounded-2xl px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Total Geral</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {todaySales.length} transaç{todaySales.length !== 1 ? 'ões' : 'ão'} no total
              </p>
            </div>
            <p className="text-xl font-black text-white">{brl(totalToday)}</p>
          </div>

          {/* Fechar Todos — só quando nenhum foi fechado ainda */}
          {canClose && tableReady && noneClosedYet && todaySales.length > 0 && (
            <button
              onClick={fecharTodos}
              disabled={closing !== null}
              className="w-full py-3.5 rounded-2xl font-black text-base disabled:opacity-50 active:scale-[0.98] transition-transform border-2"
              style={{ borderColor: color, color }}
            >
              {closing === 'all'
                ? 'Fechando todos os caixas...'
                : `Fechar Todos · ${brl(totalToday)}`}
            </button>
          )}

          {allClosedToday && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <CheckCircle size={22} className="text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Todos os caixas fechados</p>
                <p className="text-xs text-emerald-600 mt-0.5">O fechamento do dia foi registrado para todos os caixas.</p>
              </div>
            </div>
          )}
        </div>
      ) : (

        /* ── SINGLE-REGISTER layout (comportamento original) ── */
        <div>
          <h2 className="text-sm font-black text-gray-700 mb-3">Resumo do dia</h2>

          {/* Big total */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Total de vendas</p>
              <p className="text-3xl font-black text-gray-900 mt-0.5">{brl(totalToday)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {todaySales.length} transaç{todaySales.length !== 1 ? 'ões' : 'ão'} hoje
              </p>
            </div>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: color + '18' }}
            >
              <DollarSign size={26} style={{ color }} />
            </div>
          </div>

          {/* By payment method */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Dinheiro', value: totalDinheiro, Icon: Banknote,   bg: 'bg-green-50',  text: 'text-green-600'  },
              { label: 'PIX',      value: totalPix,      Icon: QrCode,     bg: 'bg-blue-50',   text: 'text-blue-600'   },
              { label: 'Cartão',   value: totalCartao,   Icon: CreditCard, bg: 'bg-violet-50', text: 'text-violet-600' },
            ].map(({ label, value, Icon, bg, text }) => (
              <div key={label} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                  <Icon size={15} className={text} />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-sm font-black text-gray-900 mt-1">{brl(value)}</p>
              </div>
            ))}
          </div>

          {/* Single-register movements */}
          {(() => {
            const rid  = registers[0]?.id
            const movs = (rid && regMovsMap[rid]) || regMovsMap['__unknown__'] || { sangria: 0, reforco: 0 }
            if (movs.sangria === 0 && movs.reforco === 0) return null
            const saldoEsperado = totalDinheiro + movs.reforco - movs.sangria
            return (
              <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100">
                {movs.sangria > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle size={13} className="text-red-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-gray-600">Sangrias</span>
                    </div>
                    <span className="text-[11px] font-black text-red-600">−{brl(movs.sangria)}</span>
                  </div>
                )}
                {movs.reforco > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle size={13} className="text-emerald-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-gray-600">Reforços</span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-600">+{brl(movs.reforco)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[11px] font-bold text-gray-700">Saldo esperado (dinheiro)</span>
                  <span className="text-[11px] font-black text-gray-900">{brl(saldoEsperado)}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* CTA — single register only */}
      {!isMulti && (
        alreadyClosed ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle size={22} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Caixa fechado hoje</p>
              <p className="text-xs text-emerald-600 mt-0.5">O fechamento já foi registrado para este dia.</p>
            </div>
          </div>
        ) : !canClose ? (
          <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
            <Lock size={22} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-600">Sem permissão</p>
              <p className="text-xs text-gray-400 mt-0.5">Você não tem permissão para fechar o caixa.</p>
            </div>
          </div>
        ) : (
          <button
            onClick={fecharCaixa}
            disabled={closing !== null || !tableReady || todaySales.length === 0}
            className="w-full py-4 rounded-2xl text-white font-black text-base shadow-lg disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: color }}
          >
            {closing !== null
              ? 'Registrando fechamento...'
              : todaySales.length === 0
              ? 'Sem vendas para fechar hoje'
              : `Fechar caixa · ${brl(totalToday)}`}
          </button>
        )
      )}

      {/* Previous closings */}
      {tableReady && closings.length > 0 && (
        <div ref={historyRef}>
          <h2 className="text-sm font-black text-gray-700 mb-3">Fechamentos anteriores</h2>
          <div className="space-y-2">
            {closings.map(c => {
              const registerName = registers.find(r => r.id === c.register_id)?.name
              return (
              <div
                key={c.id}
                className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Clock size={15} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(c.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'long', year: 'numeric',
                      })}
                    </p>
                    {isMulti && registerName && (
                      <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                        {registerName}
                      </span>
                    )}
                    <p className="text-[11px] text-gray-400">
                      {c.total_transactions} venda{c.total_transactions !== 1 ? 's' : ''} · fechado às{' '}
                      {new Date(c.closed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-gray-900">{brl(c.total_sales)}</p>
                  <div className="flex gap-1 justify-end mt-0.5">
                    {c.total_dinheiro > 0 && (
                      <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-bold">
                        {brl(c.total_dinheiro)}
                      </span>
                    )}
                    {c.total_pix > 0 && (
                      <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">
                        {brl(c.total_pix)}
                      </span>
                    )}
                    {c.total_cartao > 0 && (
                      <span className="text-[9px] px-1 py-0.5 bg-violet-100 text-violet-700 rounded font-bold">
                        {brl(c.total_cartao)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>
      )}
    </div>
  )
}
