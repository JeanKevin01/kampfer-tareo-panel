import WBSArbol from './WBSArbol'
import ImportarOTM from './ImportarOTM'
// ============================================================
// src/pages/ValorGanado.tsx
// Módulo Valor Ganado — lógica ISP Fluor digitalizada
// Autocontenido (sin shadcn), design system k- del panel
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import {
  Target, BarChart3, ClipboardList, PenLine, Settings2,
  Plus, Pencil, Trash2, X, Save, Loader2, TrendingUp, Clock, Gauge,
  Upload, Link2,
} from 'lucide-react'
import ImportarPartidas from '@/pages/ImportarPartidas'
import AsignarHH from '@/pages/AsignarHH'

const API = 'https://api.apps1.astraera.space'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.detail ?? `Error ${r.status}`)
  return j as T
}

// ---------------- Tipos ----------------
interface Hito {
  id?: number; numero: number; descripcion: string
  peso: number; es_principal: boolean
}
interface Partida {
  id: number; codigo: string; otm_id: string | null; fase: string; sub_fase: string | null
  descripcion: string; unidad: string; sistema: string | null
  metrado_presup: number; metrado_proyec: number | null; hh_presup: number
  hitos: Hito[]
}
interface PartidaInput {
  codigo: string; otm_id: string | null; fase: string; sub_fase: string | null
  descripcion: string; unidad: string; sistema: string | null
  metrado_presup: number; metrado_proyec: number | null; hh_presup: number
  hitos: Omit<Hito, 'id'>[]
}
interface CapturaHito {
  hito_id: number; numero: number; descripcion: string; peso: number
  es_principal: boolean; cant_anterior: number; cant_actual: number
}
interface CapturaPartida {
  partida_id: number; codigo: string; otm_id: string | null; descripcion: string; unidad: string
  metrado_proyec: number; hh_tareo: number; hh_semana: number; hitos: CapturaHito[]
}
interface ReporteFila {
  partida_id: number; codigo: string; otm_id: string | null; fase: string; sistema: string | null
  descripcion: string; unidad: string
  metrado_proyec: number; cantidad_instalada: number; pct_avance: number
  hh_presup: number; hh_proyec: number
  hh_ganadas_sem: number; hh_ganadas_acum: number
  hh_gastadas_sem: number; hh_gastadas_acum: number
  pf_sem: number; pf_acum: number
  prod_presup: number; prod_real: number
  eac_hh: number; desvio_hh: number
}
interface ReporteGrupo {
  grupo: string; hh_proyec: number; hh_ganadas: number; hh_gastadas: number
  pct_avance: number; pf: number; eac_hh: number
}
interface Reporte {
  semana: number
  totales: {
    hh_proyec: number; hh_ganadas_acum: number; hh_gastadas_acum: number
    hh_ganadas_sem: number; hh_gastadas_sem: number
    pct_avance: number; pf_acum: number; pf_sem: number
    eac_hh: number; desvio_hh: number
  }
  por_fase: ReporteGrupo[]; por_sistema: ReporteGrupo[]; partidas: ReporteFila[]
}
interface PuntoCurvaFase { semana: number; [key: string]: number | null }

interface PuntoCurva {
  semana: number; hh_ganadas_acum: number; hh_gastadas_acum: number
  pf_acum: number | null; pf_sem: number | null
}

// ---------------- Helpers ----------------
const fmt = (n: number, d = 1) =>
  n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

const INPUT =
  'w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors'
const LABEL = 'text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5'
const BTN_AMBER =
  'bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2'
const BTN_GHOST =
  'bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors flex items-center justify-center gap-2'
const CARD = 'bg-k-surface border border-k-border rounded-xl p-5'
const TH = 'py-2 px-3 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left'
const TD = 'py-2 px-3 text-sm text-k-text2'

function PFChip({ value }: { value: number }) {
  if (!value) return <span className="text-k-text3 text-xs">—</span>
  const cls = value >= 1
    ? 'text-k-green bg-green-500/10 border-green-500/20'
    : value >= 0.85
      ? 'text-k-amber bg-amber-500/10 border-amber-500/20'
      : 'text-k-red bg-red-500/10 border-red-500/20'
  return (
    <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${cls}`}>
      {value.toFixed(2)}
    </span>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-k-raised border border-k-border2 rounded-lg px-3 py-2 text-xs">
      <p className="text-k-text2 mb-1">Semana {label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono font-bold">
          {typeof p.value === 'number' ? fmt(p.value, p.value < 10 ? 2 : 0) : p.value} {p.name}
        </p>
      ))}
    </div>
  )
}

// ============================================================
// Componente principal
// ============================================================
type Tab = 'resumen' | 'partidas' | 'registro' | 'tareo' | 'config' | 'importar'

export default function ValorGanado() {
  const [tab, setTab] = useState<Tab>('resumen')
  const [selectedOtm, setSelectedOtm] = useState<string>('')
  const [semana, setSemana] = useState<number | null>(null)

  // OTMs que tienen partidas en el módulo EV
  const { data: otmsEV = [] } = useQuery<{otm_id: string; partidas: number}[]>({
    queryKey: ['ev-otms'],
    queryFn: () => req('/ev/otms'),
    staleTime: 30_000,
  })

  interface SemanaAuto { semana: number; inicio: string; fin: string; hh: number; activa: boolean; label: string }
  const { data: semanasAuto = [] } = useQuery<SemanaAuto[]>({
    queryKey: ['ev-semanas-auto'],
    queryFn: () => req('/ev/semanas-auto'),
    refetchInterval: 5 * 60 * 1000,
  })
  const semanas = semanasAuto.map(s => s.semana)

  useEffect(() => {
    if (semana === null && semanasAuto.length) {
      // Seleccionar la última semana ACTIVA (con registros)
      const ultActiva = [...semanasAuto].reverse().find(s => s.activa)
      setSemana(ultActiva ? ultActiva.semana : semanasAuto[semanasAuto.length - 1].semana)
    }
  }, [semanasAuto, semana])

  if (semana === null) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando módulo…</p>
  }

  const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: 'resumen',  label: 'Resumen',          icon: BarChart3 },
    { id: 'partidas', label: 'Partidas',         icon: ClipboardList },
    { id: 'registro', label: 'Registro semanal', icon: PenLine },
    { id: 'tareo',    label: 'HH Tareo',         icon: Link2 },
    { id: 'config',   label: 'Configuración',    icon: Settings2 },
    { id: 'importar', label: 'Importar',         icon: Upload },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-condensed font-extrabold text-2xl text-k-text tracking-wide flex items-center gap-2">
            <Target size={22} className="text-k-amber" /> VALOR GANADO
          </h1>
          <p className="text-xs text-k-text3 mt-0.5">
            Avance por hitos ponderados · HH Ganadas vs Gastadas · PF · Proyección EAC
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Semana de corte</span>
          <div className="flex items-center gap-3">
            <select
              value={selectedOtm}
              onChange={e => setSelectedOtm(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors"
            >
              <option value="">Todas las OTMs</option>
              {otmsEV.map(o => (
                <option key={o.otm_id} value={o.otm_id}>{o.otm_id} ({o.partidas})</option>
              ))}
            </select>
            <select
              value={semana}
              onChange={e => setSemana(Number(e.target.value))}
              className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors min-w-[240px]"
            >
              {semanasAuto.map(s => (
                <option key={s.semana} value={s.semana} style={{ color: s.activa ? undefined : '#4e5a72' }}>
                  {s.label}
                </option>
              ))}
              {!semanas.includes(semana) && <option value={semana}>Sem {semana}</option>}
            </select>
          </div>
          <button onClick={() => { setSemana(semana + 1); setTab('registro') }} className={BTN_AMBER}
            title="Avanzar al registro de la siguiente semana">
            <Plus size={14} /> Nueva semana ({semana + 1})
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t.id
                ? 'bg-k-amber text-black'
                : 'bg-k-surface border border-k-border text-k-text2 hover:text-k-text hover:border-k-border2'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen'  && <TabResumen semana={semana} />}
      {tab === 'partidas' && <WBSArbol otm={selectedOtm} semana={semana} />}
      {tab === 'registro' && <TabRegistro semana={semana} />}
      {tab === 'tareo'    && <AsignarHH />}
      {tab === 'config'   && <TabConfig />}
      {tab === 'importar' && <div className="space-y-5"><ImportarOTM /><ImportarPartidas /></div>}
    </div>
  )
}

// ============================================================
// TAB 1: Resumen
// ============================================================
function TabResumen({ semana, otm }: { semana: number; otm?: string }) {
  const { data: rep, isLoading } = useQuery<Reporte>({
    queryKey: ['ev-reporte', semana],
    queryFn: () => req(`/ev/reporte?semana=${semana}`),
  })
  const { data: curva = [] } = useQuery<PuntoCurva[]>({
    queryKey: ['ev-curva', semana],
    queryFn: () => req(`/ev/curva?hasta=${semana}`),
  })

  if (isLoading || !rep) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando…</p>
  }
  const t = rep.totales

  const kpis = [
    { label: '% Avance del proyecto', value: pct(t.pct_avance), icon: Gauge,
      color: 'text-k-amber', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { label: 'PF Acumulado (CPI)', value: t.pf_acum.toFixed(2), icon: Target,
      color: t.pf_acum >= 1 ? 'text-k-green' : 'text-k-red',
      bg: t.pf_acum >= 1 ? 'bg-green-500/10' : 'bg-red-500/10',
      border: t.pf_acum >= 1 ? 'border-green-500/20' : 'border-red-500/20' },
    { label: `HH Ganadas (sem ${fmt(t.hh_ganadas_sem, 0)})`, value: fmt(t.hh_ganadas_acum, 0), icon: TrendingUp,
      color: 'text-k-green', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { label: `HH Gastadas (sem ${fmt(t.hh_gastadas_sem, 0)})`, value: fmt(t.hh_gastadas_acum, 0), icon: Clock,
      color: 'text-k-red', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    { label: `EAC · desvío ${t.desvio_hh >= 0 ? '+' : ''}${fmt(t.desvio_hh, 0)} HH`, value: fmt(t.eac_hh, 0), icon: BarChart3,
      color: 'text-k-blue', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  ]

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`bg-k-surface border ${k.border} rounded-xl p-5`}>
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center mb-4`}>
              <k.icon size={20} className={k.color} />
            </div>
            <div className={`font-mono text-3xl font-medium ${k.color} mb-1`}>{k.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={CARD}>
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Curva S — HH Ganadas vs Gastadas
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curva}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252f45" />
                <XAxis dataKey="semana" tick={{ fill: '#8a96ad', fontSize: 11 }} tickFormatter={s => `S${s}`} />
                <YAxis tick={{ fill: '#8a96ad', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="hh_ganadas_acum" name="HH Ganadas (EV)"
                      stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={2} />
                <Line type="monotone" dataKey="hh_gastadas_acum" name="HH Gastadas (AC)"
                      stroke="#ef4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={CARD}>
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Tendencia del PF (meta = 1.00)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curva}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252f45" />
                <XAxis dataKey="semana" tick={{ fill: '#8a96ad', fontSize: 11 }} tickFormatter={s => `S${s}`} />
                <YAxis tick={{ fill: '#8a96ad', fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="pf_acum" name="PF Acumulado"
                      stroke="#3b82f6" strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="pf_sem" name="PF Semanal"
                      stroke="#4e5a72" strokeDasharray="4 4" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TablaGrupos titulo="Avance por fase / disciplina" grupos={rep.por_fase} />
        <TablaGrupos titulo="Avance por sistema" grupos={rep.por_sistema} />
      </div>

      <CurvasFase semana={semana} />
    </div>
  )
}

function TablaGrupos({ titulo, grupos }: { titulo: string; grupos: ReporteGrupo[] }) {
  return (
    <div className={CARD}>
      <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-3">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-k-border">
              <th className={TH}>Grupo</th>
              <th className={`${TH} text-right`}>HH Proyec</th>
              <th className={`${TH} text-right`}>Ganadas</th>
              <th className={`${TH} text-right`}>Gastadas</th>
              <th className={`${TH} text-right`}>% Avance</th>
              <th className={`${TH} text-right`}>PF</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.grupo} className="border-b border-k-border last:border-0">
                <td className={`${TD} font-bold text-k-text`}>{g.grupo}</td>
                <td className={`${TD} text-right font-mono`}>{fmt(g.hh_proyec, 0)}</td>
                <td className={`${TD} text-right font-mono text-k-green`}>{fmt(g.hh_ganadas, 0)}</td>
                <td className={`${TD} text-right font-mono text-k-red`}>{fmt(g.hh_gastadas, 0)}</td>
                <td className={`${TD} text-right font-mono`}>{pct(g.pct_avance)}</td>
                <td className={`${TD} text-right`}><PFChip value={g.pf} /></td>
              </tr>
            ))}
            {grupos.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-k-text3 text-sm">Sin datos aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ============================================================
// CURVAS POR FASE
// ============================================================
const FASE_COLORS: Record<string, string> = {
  'SX-EW': '#3b82f6', 'Mina': '#10b981', 'C2 Area Seca': '#f59e0b',
  'C2 Área Seca': '#f59e0b', 'Lixviacion': '#a78bfa', 'Lixviación': '#a78bfa',
  'Aguas': '#22d3ee', 'GSC': '#94a3b8',
}
const COLOR_LIST = ['#3b82f6','#10b981','#f59e0b','#a78bfa','#22d3ee','#94a3b8','#ef4444','#ec4899']

function CurvasFase({ semana }: { semana: number }) {
  const { data, isLoading } = useQuery<{ fases: string[]; serie: PuntoCurvaFase[] }>({
    queryKey: ['ev-curva-fase', semana],
    queryFn: () => req(`/ev/curva-fase?hasta=${semana}`),
    enabled: semana > 0,
  })

  if (isLoading) return (
    <p className="text-k-text3 text-sm flex items-center gap-2">
      <Loader2 size={14} className="animate-spin" /> Cargando curvas...
    </p>
  )
  if (!data?.serie?.length) return (
    <div className="bg-k-raised border border-k-border rounded-xl p-8 text-center text-k-text3 text-sm">
      Sin datos de avance por fase aún — registra avances semanales primero
    </div>
  )

  const { fases, serie } = data
  return (
    <div className={CARD}>
      <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-1">
        PF acumulado por fase / disciplina
      </h3>
      <p className="text-[11px] text-k-text3 mb-4">
        Línea punteada = meta PF 1.00. Cada fase muestra su propio Factor de Productividad acumulado semana a semana.
      </p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252f45" />
            <XAxis dataKey="semana" tick={{ fill: '#8a96ad', fontSize: 11 }} tickFormatter={s => `S${s}`} />
            <YAxis tick={{ fill: '#8a96ad', fontSize: 11 }} domain={[0, 'auto']}
                   tickFormatter={v => v.toFixed(2)} />
            <Tooltip
              contentStyle={{ background: '#1c2436', border: '1px solid #252f45', borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, name: string) => [Number(v).toFixed(3), name.replace('pf_', '')]}
              labelFormatter={l => `Semana ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }}
                    formatter={(val: string) => val.replace('pf_', '')} />
            <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} />
            {fases.map((f, i) => (
              <Line key={f} type="monotone" dataKey={`pf_${f}`}
                    name={`pf_${f}`}
                    stroke={FASE_COLORS[f] ?? COLOR_LIST[i % COLOR_LIST.length]}
                    strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {fases.map((f, i) => {
          const ultimo = [...serie].reverse().find(p => p[`pf_${f}`] != null)
          const pf = ultimo ? (ultimo[`pf_${f}`] as number) : null
          const color = FASE_COLORS[f] ?? COLOR_LIST[i % COLOR_LIST.length]
          return (
            <div key={f} className="flex items-center gap-2 bg-k-raised border border-k-border rounded-lg px-3 py-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-[11px] font-bold text-k-text">{f}</span>
              {pf != null && (
                <span className={`font-mono text-[11px] font-bold ml-1 ${
                  pf >= 1 ? 'text-k-green' : pf >= 0.85 ? 'text-k-amber' : 'text-k-red'
                }`}>PF {pf.toFixed(2)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// TAB 2: Partidas
// ============================================================
function TabPartidas({ semana }: { semana: number }) {
  const { data: rep, isLoading } = useQuery<Reporte>({
    queryKey: ['ev-reporte', semana],
    queryFn: () => req(`/ev/reporte?semana=${semana}`),
  })
  const [search, setSearch] = useState('')

  const filas = useMemo(() => {
    if (!rep) return []
    const q = search.toLowerCase()
    return rep.partidas.filter(f =>
      f.codigo.toLowerCase().includes(q) ||
      f.descripcion.toLowerCase().includes(q) ||
      (f.sistema ?? '').toLowerCase().includes(q))
  }, [rep, search])

  if (isLoading || !rep) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando…</p>
  }

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-k-border flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">
          Detalle por partida — Semana {semana}
        </h3>
        <input type="text" placeholder="Buscar código, descripción o sistema…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="max-w-xs bg-k-raised border border-k-border rounded-lg px-4 py-2 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr className="border-b border-k-border bg-k-raised/50">
              <th className={TH}>Código</th>
              <th className={TH}>Descripción</th>
              <th className={`${TH} text-right`}>Metrado</th>
              <th className={`${TH} text-right`}>Instalado</th>
              <th className={`${TH} text-right`}>% Avance</th>
              <th className={`${TH} text-right`}>HH Proyec</th>
              <th className={`${TH} text-right`}>Ganadas</th>
              <th className={`${TH} text-right`}>Gastadas</th>
              <th className={`${TH} text-right`}>PF Sem</th>
              <th className={`${TH} text-right`}>PF Acum</th>
              <th className={`${TH} text-right`}>Prod. Ppto</th>
              <th className={`${TH} text-right`}>Prod. Real</th>
              <th className={`${TH} text-right`}>EAC HH</th>
              <th className={`${TH} text-right`}>Desvío</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.partida_id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                <td className={`${TD} font-mono text-[11px] text-k-amber`}>{f.codigo}</td>
                <td className={`${TD} max-w-[260px] truncate`} title={f.descripcion}>
                  {f.descripcion}
                  {f.sistema && <span className="ml-2 text-[10px] text-k-text3">[{f.sistema}]</span>}
                </td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.metrado_proyec)} <span className="text-k-text3 text-[10px]">{f.unidad}</span></td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.cantidad_instalada)}</td>
                <td className={`${TD} text-right font-mono font-bold text-k-text`}>{pct(f.pct_avance)}</td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.hh_proyec, 0)}</td>
                <td className={`${TD} text-right font-mono text-k-green`}>{fmt(f.hh_ganadas_acum, 0)}</td>
                <td className={`${TD} text-right font-mono text-k-red`}>{fmt(f.hh_gastadas_acum, 0)}</td>
                <td className={`${TD} text-right`}><PFChip value={f.pf_sem} /></td>
                <td className={`${TD} text-right`}><PFChip value={f.pf_acum} /></td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.prod_presup, 3)}</td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.prod_real, 3)}</td>
                <td className={`${TD} text-right font-mono`}>{fmt(f.eac_hh, 0)}</td>
                <td className={`${TD} text-right font-mono ${f.desvio_hh > 0 ? 'text-k-red' : 'text-k-green'}`}>
                  {f.desvio_hh >= 0 ? '+' : ''}{fmt(f.desvio_hh, 0)}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={14} className="py-8 text-center text-k-text3 text-sm">
                Sin partidas. Créalas en la pestaña Configuración.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-k-border bg-k-raised">
        <span className="text-[11px] text-k-text3">{filas.length} partidas</span>
      </div>
    </div>
  )
}

// ============================================================
// TAB 3: Registro semanal (reemplaza los 11 pasos del ISP)
// ============================================================
function TabRegistro({ semana, otm }: { semana: number; otm?: string }) {
  const qc = useQueryClient()
  const { data: todasCaptura = [], isLoading } = useQuery<CapturaPartida[]>({
    queryKey: ['ev-captura', semana, otm],
    queryFn: () => req(`/ev/captura?semana=${semana}${otm ? `&otm=${otm}` : ''}`),
  })
  // Solo nodos hoja (los que tienen hitos) — los padres no tienen entrada de avance
  const captura = todasCaptura.filter(p => p.hitos && p.hitos.length > 0)

  const [avances, setAvances] = useState<Record<number, string>>({})
  const [hh, setHh] = useState<Record<number, string>>({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const a: Record<number, string> = {}
    const h: Record<number, string> = {}
    captura.forEach(p => {
      h[p.partida_id] = String(p.hh_semana)
      p.hitos.forEach(x => { a[x.hito_id] = String(x.cant_actual) })
    })
    setAvances(a); setHh(h); setMsg('')
  }, [captura])

  const guardar = useMutation({
    mutationFn: () =>
      req('/ev/captura', {
        method: 'POST',
        body: JSON.stringify({
          semana,
          avances: Object.entries(avances).map(([id, v]) => ({
            hito_id: Number(id), cantidad_acum: Number(v) || 0,
          })),
          hh_gastadas: Object.entries(hh).map(([id, v]) => ({
            partida_id: Number(id), hh: Number(v) || 0,
          })),
        }),
      }),
    onSuccess: () => {
      setMsg(`✓ Semana ${semana} guardada correctamente`)
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
      qc.invalidateQueries({ queryKey: ['ev-curva'] })
      qc.invalidateQueries({ queryKey: ['ev-semanas'] })
    },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })

  if (isLoading) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando captura…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-k-text3 max-w-2xl">
          Ingresa el <span className="text-k-text2 font-bold">acumulado a la fecha</span> de cada hito
          (el avance del periodo se calcula solo contra la semana anterior) y las HH gastadas de la semana.
          Las HH podrán alimentarse automáticamente desde el tareo vía n8n.
        </p>
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className={BTN_AMBER}>
          {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {guardar.isPending ? 'Guardando…' : `Guardar Semana ${semana}`}
        </button>
      </div>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${
          msg.startsWith('✓')
            ? 'text-k-green bg-green-500/10 border-green-500/20'
            : 'text-k-red bg-red-500/10 border-red-500/20'
        }`}>{msg}</p>
      )}

      {captura.map(p => (
        <div key={p.partida_id} className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <span className="font-mono text-[11px] text-k-amber mr-2">{p.codigo}</span>
              <span className="text-sm font-bold text-k-text">{p.descripcion}</span>
              <span className="ml-2 text-[11px] text-k-text3">
                Metrado: {fmt(p.metrado_proyec)} {p.unidad}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {p.hh_tareo > 0 && (
                <span className="font-mono text-[11px] font-bold px-2 py-1 rounded border text-k-green bg-green-500/10 border-green-500/20">
                  Tareo: {fmt(p.hh_tareo)} HH (auto)
                </span>
              )}
              <span className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">
                HH {p.hh_tareo > 0 ? 'adicionales' : 'gastadas'} sem {semana}
              </span>
              <input type="number" step="0.5" min="0"
                value={hh[p.partida_id] ?? ''}
                onChange={e => setHh({ ...hh, [p.partida_id]: e.target.value })}
                className="w-28 bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text font-mono outline-none focus:border-k-amber transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {p.hitos.map(x => {
              const actual = Number(avances[x.hito_id] ?? 0)
              const periodo = actual - x.cant_anterior
              return (
                <div key={x.hito_id} className="bg-k-raised border border-k-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-k-text2 font-bold truncate">
                      Hito {x.numero} · {x.descripcion || '—'}
                      {x.es_principal && (
                        <span className="ml-1.5 text-[9px] text-k-blue bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                          Principal
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-k-text3 flex-shrink-0">Peso {(x.peso * 100).toFixed(0)}%</span>
                  </div>
                  <input type="number" step="0.01" min="0"
                    value={avances[x.hito_id] ?? ''}
                    onChange={e => setAvances({ ...avances, [x.hito_id]: e.target.value })}
                    className="w-full bg-k-void border border-k-border2 rounded-lg px-3 py-2 text-sm text-k-text font-mono outline-none focus:border-k-amber transition-colors" />
                  <div className="flex justify-between text-[10px] text-k-text3">
                    <span>Ant: {fmt(x.cant_anterior)}</span>
                    <span className={periodo < 0 ? 'text-k-red font-bold' : periodo > 0 ? 'text-k-green' : ''}>
                      Periodo: {periodo >= 0 ? '+' : ''}{fmt(periodo)} {p.unidad}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {captura.length === 0 && (
        <div className={`${CARD} text-center py-10`}>
          <p className="text-k-text3 text-sm">No hay partidas configuradas. Créalas primero en la pestaña Configuración.</p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB 4: Configuración (hoja Fases: WBS + hitos ponderados)
// ============================================================
const PARTIDA_VACIA: PartidaInput = {
  codigo: '', otm_id: null, fase: '', sub_fase: null, descripcion: '', unidad: '',
  sistema: null, metrado_presup: 0, metrado_proyec: null, hh_presup: 0,
  hitos: [{ numero: 1, descripcion: '', peso: 1, es_principal: true }],
}

function TabConfig() {
  const qc = useQueryClient()
  const { data: partidas = [], isLoading } = useQuery<Partida[]>({
    queryKey: ['ev-partidas'],
    queryFn: () => req('/ev/partidas'),
  })

  const [editando, setEditando] = useState<number | null>(null)
  const [form, setForm] = useState<PartidaInput | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['ev-partidas'] })
    qc.invalidateQueries({ queryKey: ['ev-reporte'] })
    qc.invalidateQueries({ queryKey: ['ev-captura'] })
    qc.invalidateQueries({ queryKey: ['ev-curva'] })
  }

  const guardar = useMutation({
    mutationFn: (f: PartidaInput) =>
      editando !== null
        ? req(`/ev/partidas/${editando}`, { method: 'PUT', body: JSON.stringify(f) })
        : req('/ev/partidas', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => { invalidar(); setForm(null); setErrMsg('') },
    onError: (e: Error) => setErrMsg(e.message),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => req(`/ev/partidas/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar,
  })

  const abrirEdicion = (p: Partida) => {
    setEditando(p.id)
    setErrMsg('')
    setForm({
      codigo: p.codigo, otm_id: p.otm_id, fase: p.fase, sub_fase: p.sub_fase,
      descripcion: p.descripcion, unidad: p.unidad, sistema: p.sistema,
      metrado_presup: Number(p.metrado_presup),
      metrado_proyec: p.metrado_proyec !== null ? Number(p.metrado_proyec) : null,
      hh_presup: Number(p.hh_presup),
      hitos: p.hitos.map(h => ({
        numero: h.numero, descripcion: h.descripcion,
        peso: Number(h.peso), es_principal: h.es_principal,
      })),
    })
  }

  if (isLoading) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando partidas…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-k-text3 max-w-2xl">
          Define el WBS y los hitos ponderados (rules of credit). Los pesos de cada partida deben sumar
          100% y debe existir un único hito principal — el que reporta la cantidad instalada oficial.
        </p>
        <button onClick={() => { setEditando(null); setErrMsg(''); setForm({ ...PARTIDA_VACIA, hitos: [...PARTIDA_VACIA.hitos] }) }}
          className={BTN_AMBER}>
          <Plus size={14} /> Nueva partida
        </button>
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="border-b border-k-border bg-k-raised/50">
                <th className={TH}>OTM</th>
                <th className={TH}>Código</th>
                <th className={TH}>Descripción</th>
                <th className={TH}>Und</th>
                <th className={TH}>Sistema</th>
                <th className={`${TH} text-right`}>Metrado Ppto</th>
                <th className={`${TH} text-right`}>Metrado Proyec</th>
                <th className={`${TH} text-right`}>HH Ppto</th>
                <th className={TH}>Hitos</th>
                <th className={`${TH} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {partidas.map(p => (
                <tr key={p.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                  <td className={`${TD} text-[11px]`}>{p.otm_id ?? '—'}</td>
                  <td className={`${TD} font-mono text-[11px] text-k-amber`}>{p.codigo}</td>
                  <td className={`${TD} max-w-[280px] truncate`} title={p.descripcion}>{p.descripcion}</td>
                  <td className={TD}>{p.unidad}</td>
                  <td className={TD}>{p.sistema ?? '—'}</td>
                  <td className={`${TD} text-right font-mono`}>{fmt(Number(p.metrado_presup))}</td>
                  <td className={`${TD} text-right font-mono`}>
                    {p.metrado_proyec !== null ? fmt(Number(p.metrado_proyec)) : <span className="text-k-text3">= ppto</span>}
                  </td>
                  <td className={`${TD} text-right font-mono`}>{fmt(Number(p.hh_presup), 0)}</td>
                  <td className={`${TD} text-[10px] text-k-text3 font-mono`}>
                    {p.hitos.map(h => `${(Number(h.peso) * 100).toFixed(0)}%`).join(' / ')}
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => abrirEdicion(p)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-blue bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                        <Pencil size={11} /> Editar
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Desactivar la partida ${p.codigo}? Sus avances históricos se conservan.`)) {
                            eliminar.mutate(p.id)
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-red bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors">
                        <Trash2 size={11} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {partidas.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-k-text3 text-sm">
                  Sin partidas. Crea la primera con el botón "Nueva partida".
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-k-border bg-k-raised">
          <span className="text-[11px] text-k-text3">{partidas.length} partidas activas</span>
        </div>
      </div>

      {form && (
        <ModalPartida
          form={form}
          setForm={setForm}
          editando={editando}
          errMsg={errMsg}
          guardando={guardar.isPending}
          onGuardar={() => guardar.mutate(form)}
          onCerrar={() => { setForm(null); setErrMsg('') }}
        />
      )}
    </div>
  )
}

function ModalPartida({ form, setForm, editando, errMsg, guardando, onGuardar, onCerrar }: {
  form: PartidaInput
  setForm: (f: PartidaInput) => void
  editando: number | null
  errMsg: string
  guardando: boolean
  onGuardar: () => void
  onCerrar: () => void
}) {
  const sumaPesos = form.hitos.reduce((s, h) => s + (Number(h.peso) || 0), 0)
  const pesosOk = Math.abs(sumaPesos - 1) < 0.0001
  const principalOk = form.hitos.filter(h => h.es_principal).length === 1
  const camposOk = !!(form.codigo && form.fase && form.descripcion && form.unidad)

  const setHito = (i: number, campo: keyof Omit<Hito, 'id'>, valor: unknown) => {
    const hitos = form.hitos.map((h, idx) => {
      if (campo === 'es_principal' && valor === true) return { ...h, es_principal: idx === i }
      return idx === i ? { ...h, [campo]: valor } : h
    })
    setForm({ ...form, hitos })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-condensed font-bold text-xl text-k-text">
              {editando !== null ? 'Editar partida' : 'Nueva partida'}
            </h2>
            {editando !== null && (
              <p className="text-xs text-k-amber font-mono mt-0.5">{form.codigo}</p>
            )}
          </div>
          <button onClick={onCerrar} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>OTM</label>
            <input type="text" placeholder="OTM-014" value={form.otm_id ?? ''}
              onChange={e => setForm({ ...form, otm_id: e.target.value || null })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Código *</label>
            <input type="text" placeholder="40,01,01" value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Fase *</label>
            <input type="text" placeholder="40" value={form.fase}
              onChange={e => setForm({ ...form, fase: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Sub fase</label>
            <input type="text" placeholder="40,01" value={form.sub_fase ?? ''}
              onChange={e => setForm({ ...form, sub_fase: e.target.value || null })} className={INPUT} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Descripción *</label>
            <input type="text" value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Unidad *</label>
            <input type="text" placeholder="m3 / kg / glb" value={form.unidad}
              onChange={e => setForm({ ...form, unidad: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Sistema (ej. MOV01)</label>
            <input type="text" value={form.sistema ?? ''}
              onChange={e => setForm({ ...form, sistema: e.target.value || null })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Metrado presupuestado</label>
            <input type="number" step="0.01" value={form.metrado_presup}
              onChange={e => setForm({ ...form, metrado_presup: Number(e.target.value) })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Metrado proyectado (vacío = ppto)</label>
            <input type="number" step="0.01" value={form.metrado_proyec ?? ''}
              onChange={e => setForm({
                ...form,
                metrado_proyec: e.target.value === '' ? null : Number(e.target.value),
              })} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>HH presupuestadas</label>
            <input type="number" step="0.01" value={form.hh_presup}
              onChange={e => setForm({ ...form, hh_presup: Number(e.target.value) })} className={INPUT} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className={LABEL.replace('block mb-1.5', '')}>Hitos ponderados (rules of credit)</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                pesosOk
                  ? 'text-k-green bg-green-500/10 border-green-500/20'
                  : 'text-k-red bg-red-500/10 border-red-500/20'
              }`}>
                Σ pesos: {(sumaPesos * 100).toFixed(1)}%
              </span>
              <button
                disabled={form.hitos.length >= 10}
                onClick={() => setForm({
                  ...form,
                  hitos: [...form.hitos, {
                    numero: Math.max(...form.hitos.map(h => h.numero)) + 1,
                    descripcion: '', peso: 0, es_principal: false,
                  }],
                })}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={11} /> Hito
              </button>
            </div>
          </div>

          {form.hitos.map((h, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input type="number" min={1} max={10} value={h.numero}
                onChange={e => setHito(i, 'numero', Number(e.target.value))}
                className={`${INPUT} col-span-2 md:col-span-1 font-mono text-center`} />
              <input type="text" placeholder="Descripción del hito" value={h.descripcion}
                onChange={e => setHito(i, 'descripcion', e.target.value)}
                className={`${INPUT} col-span-10 md:col-span-6`} />
              <input type="number" step="0.01" min={0} max={1} placeholder="Peso 0-1" value={h.peso}
                onChange={e => setHito(i, 'peso', Number(e.target.value))}
                className={`${INPUT} col-span-4 md:col-span-2 font-mono`} />
              <label className="col-span-6 md:col-span-2 flex items-center gap-1.5 text-[11px] text-k-text2 cursor-pointer">
                <input type="radio" name="hito-principal" checked={h.es_principal}
                  onChange={() => setHito(i, 'es_principal', true)}
                  className="accent-amber-500" />
                Principal
              </label>
              <button disabled={form.hitos.length <= 1}
                onClick={() => setForm({ ...form, hitos: form.hitos.filter((_, idx) => idx !== i) })}
                className="col-span-2 md:col-span-1 text-k-red hover:bg-red-500/10 disabled:opacity-30 rounded-lg py-2 flex items-center justify-center transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}

          {!principalOk && (
            <p className="text-[11px] text-k-red">Debe haber exactamente un hito principal.</p>
          )}
        </div>

        {errMsg && (
          <p className="mt-4 text-xs px-3 py-2 rounded-lg border text-k-red bg-red-500/10 border-red-500/20">
            ✗ {errMsg}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onCerrar} className={`flex-1 ${BTN_GHOST}`}>Cancelar</button>
          <button onClick={onGuardar}
            disabled={guardando || !pesosOk || !principalOk || !camposOk}
            className={`flex-1 ${BTN_AMBER}`}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {guardando ? 'Guardando…' : 'Guardar partida'}
          </button>
        </div>
      </div>
    </div>
  )
}