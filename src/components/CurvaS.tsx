// Curva S completa (PV · EV · AC) + indicadores EVM — el gráfico clásico.
//
// Antes solo se graficaban EV y AC: dos curvas reales, ninguna línea base, así
// que no existía la dimensión de CRONOGRAMA (no se podía decir "voy atrasado").
// El PV sale de `prog_metrado_dia` (módulo de Programación) convertido a HH con
// la MISMA fórmula del EV, así que SPI y SV son comparables de verdad.
//
// OJO Recharts: `var()` NO resuelve en atributos SVG (stroke=/fill=/tick fill).
// Aquí van HEX concretos que se leen bien en tema claro y oscuro; solo el
// contentStyle del Tooltip (CSS real) puede usar variables.
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '@/lib/api'

export interface PuntoCurvaS {
  semana: number
  pv: number; ev: number; ac: number
  pv_sem: number; ev_sem: number; ac_sem: number
  sv: number; cv: number; spi: number | null; cpi: number | null
}
export interface IndicadoresEVM {
  pv: number; ev: number; ac: number; bac: number; eac: number
  sv: number; spi: number | null
  cv: number; cpi: number | null
  etc: number; vac: number; tcpi: number | null
}
export interface CoberturaPlan {
  partidas_con_plan: number; partidas_total: number
  bac_con_plan: number; pct_bac_planificado: number
}
interface Resp {
  serie: PuntoCurvaS[]
  indicadores: IndicadoresEVM | null
  cobertura: CoberturaPlan | null
}

const CARD = 'bg-k-surface border border-k-border rounded-xl p-4'
const fmt = (v: number, d = 0) =>
  v.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })

// Colores del diagrama clásico de curvas S de coste
const AZUL = '#3b82f6'      // PV — presupuesto/planificado
const VERDE = '#10b981'     // EV — valor ganado
const ROJO = '#ef4444'      // AC — coste incurrido
const GRIS = '#8b95ab'

/** Semáforo de índices: ≥1 bien, ≥0.9 alerta, <0.9 crítico. */
const idxColor = (v: number | null | undefined) =>
  v == null ? 'text-k-text3' : v >= 1 ? 'text-k-green' : v >= 0.9 ? 'text-k-amber' : 'text-k-red'
/** Semáforo de variaciones: positivo = a favor. */
const varColor = (v: number | undefined) =>
  v == null ? 'text-k-text3' : v > 0.5 ? 'text-k-green' : v < -0.5 ? 'text-k-red' : 'text-k-text2'

function Flecha({ v }: { v: number | null | undefined }) {
  if (v == null) return <Minus size={13} className="text-k-text3" />
  if (v >= 1) return <TrendingUp size={13} className="text-k-green" />
  return <TrendingDown size={13} className="text-k-red" />
}

function TooltipCurva({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgb(var(--k-surface))', border: '1px solid rgb(var(--k-border))',
      borderRadius: 8, padding: '8px 11px', fontSize: 12,
    }}>
      <div style={{ color: 'rgb(var(--k-text2))', marginBottom: 4 }}>Semana {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: 'var(--mono)' }}>
          {p.name}: {fmt(Number(p.value ?? 0))} HH
        </div>
      ))}
    </div>
  )
}

export default function CurvaS({ semana, otm }: { semana: number; otm?: string }) {
  const { data, isLoading, error } = useQuery<Resp>({
    queryKey: ['ev-curva-s', semana, otm],
    queryFn: () => api(`/ev/curva-s?hasta=${semana}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
  })

  if (isLoading) return (
    <div className={`${CARD} flex items-center gap-2 text-k-text3 text-sm h-80 justify-center`}>
      <Loader2 size={15} className="animate-spin" /> Calculando la curva S…
    </div>
  )
  if (error) return (
    <div className={CARD}><p className="text-k-red text-sm">No se pudo calcular: {(error as Error).message}</p></div>
  )

  const serie = data?.serie ?? []
  const ind = data?.indicadores
  const cob = data?.cobertura
  const sinPlan = !cob || cob.pct_bac_planificado <= 0

  // KPIs de cronograma y costo, en el orden en que se leen
  const KPIS: { label: string; valor: string; sub: string; color: string; idx?: number | null }[] = ind ? [
    { label: 'SPI · Cronograma', valor: ind.spi != null ? ind.spi.toFixed(2) : '—',
      sub: `SV ${ind.sv >= 0 ? '+' : ''}${fmt(ind.sv)} HH`, color: idxColor(ind.spi), idx: ind.spi },
    { label: 'CPI · Costo (PF)', valor: ind.cpi != null ? ind.cpi.toFixed(2) : '—',
      sub: `CV ${ind.cv >= 0 ? '+' : ''}${fmt(ind.cv)} HH`, color: idxColor(ind.cpi), idx: ind.cpi },
    { label: 'BAC · Presupuesto', valor: fmt(ind.bac),
      sub: `EV ${fmt(ind.ev)} HH ganadas`, color: 'text-k-text' },
    { label: 'EAC · Al término', valor: fmt(ind.eac),
      sub: `ETC ${fmt(ind.etc)} HH por gastar`, color: 'text-k-text' },
    { label: 'VAC · Desvío final', valor: `${ind.vac >= 0 ? '+' : ''}${fmt(ind.vac)}`,
      sub: ind.vac >= 0 ? 'ahorro previsto' : 'sobrecosto previsto', color: varColor(ind.vac) },
    { label: 'TCPI · Ritmo requerido', valor: ind.tcpi != null ? ind.tcpi.toFixed(2) : '—',
      sub: 'para todavía cumplir el BAC', color: idxColor(ind.tcpi != null ? 2 - ind.tcpi : null) },
  ] : []

  return (
    <div className="space-y-4">
      {/* Honestidad del dato: el PV solo cubre lo programado */}
      {sinPlan ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-k-amber">
          <b>Aún no hay plan cargado</b> para estas partidas, así que la curva azul (PV) sale en cero
          y el SPI no se puede calcular. Programa actividades con metrado en <b>Programación → Lookahead</b>
          y la línea base aparecerá sola.
        </div>
      ) : cob!.pct_bac_planificado < 0.95 && (
        <div className="rounded-xl border border-k-border bg-k-raised/50 px-4 py-2.5 text-[11px] text-k-text2">
          El <b>plan vigente</b> cubre {(cob!.pct_bac_planificado * 100).toFixed(0)}% del presupuesto
          ({cob!.partidas_con_plan} de {cob!.partidas_total} partidas). La curva azul es el
          <b> plan rodante</b>, no una línea base congelada: el SPI mide contra lo programado hoy.
        </div>
      )}

      {/* Indicadores EVM */}
      {ind && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {KPIS.map(k => (
            <div key={k.label} className={CARD}>
              <div className="flex items-center gap-1.5">
                <span className={`font-mono text-2xl font-medium ${k.color}`}>{k.valor}</span>
                {k.idx !== undefined && <Flecha v={k.idx} />}
              </div>
              <div className="text-[10px] uppercase text-k-text3 tracking-wide mt-1">{k.label}</div>
              <div className="text-[10px] text-k-text2 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* La curva */}
      <div className={CARD}>
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">
            Curva S — Planificado vs Ganado vs Gastado
          </h3>
          <span className="text-[10px] text-k-text3">
            Todo en HH · corte semana {semana}
          </span>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,140,160,0.2)" />
              <XAxis dataKey="semana" tick={{ fill: GRIS, fontSize: 11 }} tickFormatter={s => `S${s}`} />
              <YAxis tick={{ fill: GRIS, fontSize: 11 }} tickFormatter={v => fmt(Number(v))} />
              <Tooltip content={<TooltipCurva />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* BAC: el techo del presupuesto (línea horizontal del diagrama) */}
              {ind && ind.bac > 0 && (
                <ReferenceLine y={ind.bac} stroke="#64748b" strokeDasharray="6 4"
                  label={{ value: `BAC ${fmt(ind.bac)}`, position: 'insideTopRight',
                           fill: GRIS, fontSize: 10 }} />
              )}
              {/* EV como área (lo realmente ganado) */}
              <Area type="monotone" dataKey="ev" name="Valor Ganado (EV)"
                stroke={VERDE} fill={VERDE} fillOpacity={0.12} strokeWidth={2} />
              {/* PV: la línea base del plan */}
              <Line type="monotone" dataKey="pv" name="Planificado (PV)"
                stroke={AZUL} strokeWidth={2.5} dot={false} />
              {/* AC: lo gastado */}
              <Line type="monotone" dataKey="ac" name="Gastado (AC)"
                stroke={ROJO} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-k-text3 mt-3 leading-relaxed">
          <b style={{ color: AZUL }}>PV</b> = lo que el plan decía que debías llevar ·
          <b style={{ color: VERDE }}> EV</b> = lo que realmente ganaste (avance × presupuesto) ·
          <b style={{ color: ROJO }}> AC</b> = las HH que consumiste.
          Si <b>EV va por debajo del PV</b> hay atraso (SPI &lt; 1); si <b>AC va por encima del EV</b>
          hay sobrecosto (CPI &lt; 1).
        </p>
      </div>

      {/* Evolución de los índices */}
      <div className={CARD}>
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
          Evolución SPI y CPI <span className="normal-case font-normal text-k-text3">(meta = 1.00)</span>
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,140,160,0.2)" />
              <XAxis dataKey="semana" tick={{ fill: GRIS, fontSize: 11 }} tickFormatter={s => `S${s}`} />
              <YAxis tick={{ fill: GRIS, fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip content={<TooltipCurva />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="spi" name="SPI (cronograma)"
                stroke={AZUL} strokeWidth={2} connectNulls dot={false} />
              <Line type="monotone" dataKey="cpi" name="CPI (costo)"
                stroke={VERDE} strokeWidth={2} connectNulls dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
