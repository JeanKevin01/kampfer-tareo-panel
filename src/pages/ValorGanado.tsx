import TabISP from './TabISP'
import TabDiario from './TabDiario'
import TabRendimientos from './TabRendimientos'
import CargaHistorica from './CargaHistorica'
import WBSArbol from './WBSArbol'
// ============================================================
// src/pages/ValorGanado.tsx
// Módulo Valor Ganado — lógica ISP Fluor digitalizada
// Autocontenido (sin shadcn), design system k- del panel
// ============================================================
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import {
  Target, BarChart3, ClipboardList, PenLine, Settings2,
  Plus, Pencil, Trash2, X, Save, Loader2, TrendingUp, Clock, Gauge,
  Upload, CalendarDays, Users, History, AlertTriangle, Activity,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import { buildWbsTree, flattenVisible, nivelStyle, NIVEL_LABELS, faseColor } from '@/lib/wbs'
import ImportarPartidas from '@/pages/ImportarPartidas'

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
  id: number; codigo: string; otm_id: string | null; fase: string | null; sub_fase: string | null
  descripcion: string; unidad: string; sistema: string | null
  metrado_presup: number; metrado_proyec: number | null; hh_presup: number
  nivel: number; parent_codigo: string | null
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
  fase: string | null; sub_fase: string | null; nivel: number; parent_codigo: string | null
  es_hoja: boolean; hh_presup: number
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

// Leyenda de niveles WBS (compartida por Configuración y Avances)
function NivelLeyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg" style={{ background: '#141926', border: '0.5px solid #252f45' }}>
      <span className="text-[10px]" style={{ color: '#4e5a72' }}>NIVEL:</span>
      {NIVEL_LABELS.map(([n, c, lbl]) => (
        <span key={n} className="flex items-center gap-1 text-[10px]">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
          <span style={{ color: c }}>{n}. {lbl}</span>
        </span>
      ))}
      <span className="flex items-center gap-1 text-[10px]">
        <span style={{ width: 10, height: 10, borderRadius: 2, background: '#60A5FA', display: 'inline-block' }} />
        <span style={{ color: '#c8d0e0' }}>Hoja (actividad)</span>
      </span>
    </div>
  )
}

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
type Tab = 'resumen' | 'partidas' | 'isp' | 'diario' | 'rendimientos' | 'registro' | 'config' | 'importar' | 'historico'

export default function ValorGanado() {
  const [tab, setTab] = useState<Tab>('resumen')
  const [selectedOtm, setSelectedOtm] = useState<string>('')
  const [semana, setSemana] = useState<number>(1)

  // Datos para TabRendimientos
  const { data: supervisores = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores'],
    queryFn: () => req('/api/supervisores'),
    staleTime: 300_000,
  })
  const { data: trabajadores = [] } = useQuery<{ id: string; nombre: string; cargo: string }[]>({
    queryKey: ['trabajadores'],
    queryFn: () => req('/api/trabajadores'),
    staleTime: 300_000,
  })

  // OTMs que tienen partidas en el módulo EV
  const { data: otmsEV = [] } = useQuery<{otm_id: string; descripcion: string; estado: string; partidas: number}[]>({
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
    if (!semanasAuto.length) return
    // Auto-seleccionar última semana activa cuando cargan los datos
    const ultActiva = [...semanasAuto].reverse().find(s => s.activa)
    setSemana(ultActiva ? ultActiva.semana : semanasAuto[semanasAuto.length - 1].semana)
  }, [semanasAuto.length]) // solo cuando llegan datos por primera vez

  // Ya no bloqueamos el render — si no hay semanas, mostramos semana 1

  // Navegación consolidada: 7 módulos principales + Migración (secundaria).
  // 'tareo' (HH Tareo) y 'control-diario' (Asignar HH) se eliminaron: la Fase 1
  // hace que tareo_partida alimente HH gastadas automáticamente.
  const TABS: { id: Tab; label: string; icon: typeof Target; secondary?: boolean }[] = [
    { id: 'resumen',       label: 'Resumen',          icon: BarChart3 },
    { id: 'partidas',      label: 'Partidas',         icon: ClipboardList },
    { id: 'isp',           label: 'ISP',              icon: Activity },
    { id: 'diario',        label: 'Control Diario',   icon: CalendarDays },
    { id: 'registro',      label: 'Avances',          icon: PenLine },
    { id: 'rendimientos',  label: 'Rendimientos',     icon: Users },
    { id: 'config',        label: 'Configuración',    icon: Settings2 },
    { id: 'importar',      label: 'Importar',         icon: Upload },
    { id: 'historico',     label: 'Migración',        icon: History, secondary: true },
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
                <option key={o.otm_id} value={o.otm_id}>
                  {o.otm_id} — {o.descripcion?.slice(0, 28) || '—'} {o.partidas > 0 ? `(${o.partidas} partidas)` : '(sin partidas — importar)'}
                </option>
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
              t.secondary ? 'ml-auto' : ''
            } ${
              tab === t.id
                ? 'bg-k-amber text-black'
                : t.secondary
                  ? 'bg-transparent border border-dashed border-k-border text-k-text3 hover:text-k-text2 hover:border-k-border2'
                  : 'bg-k-surface border border-k-border text-k-text2 hover:text-k-text hover:border-k-border2'
            }`}
            title={t.secondary ? 'Herramienta de migración de datos históricos' : undefined}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {selectedOtm && otmsEV.find(o => o.otm_id === selectedOtm)?.partidas === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-k-amber">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span className="flex-1">
            <strong>{selectedOtm}</strong> aún no tiene partidas importadas — el Valor Ganado no puede calcular nada para esta OTM.
          </span>
          <button onClick={() => setTab('importar')}
            className="flex-shrink-0 bg-k-amber text-black font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-k-amber2 transition-colors">
            Importar partidas →
          </button>
        </div>
      )}

      {tab === 'resumen'  && <TabResumen semana={semana} otm={selectedOtm} />}
      {tab === 'partidas' && <WBSArbol otm={selectedOtm} semana={semana} />}
      {tab === 'isp'      && <TabISP semana={semana} otm={selectedOtm} />}
      {tab === 'registro' && <TabRegistro semana={semana} otm={selectedOtm} />}
      {tab === 'diario'        && (
        <TabDiario
          semana={semana}
          onSemana={setSemana}
          selectedOtm={selectedOtm}
        />
      )}
      {tab === 'rendimientos'  && (
        <TabRendimientos
          semana={semana}
          selectedOtm={selectedOtm}
          supervisores={supervisores}
          trabajadores={trabajadores}
        />
      )}
      {tab === 'historico'      && (
        <CargaHistorica
          semana={semana}
          selectedOtm={selectedOtm}
        />
      )}
      {tab === 'config'        && <TabConfig />}
      {tab === 'importar'      && <ImportarPartidas />}
    </div>
  )
}

// ============================================================
// TAB 1: Resumen
// ============================================================
function TabResumen({ semana, otm }: { semana: number; otm?: string }) {
  const { data: rep, isLoading } = useQuery<Reporte>({
    queryKey: ['ev-reporte', semana, otm],
    queryFn: () => req(`/ev/reporte?semana=${semana}${otm ? `&otm=${otm}` : ''}`),
  })
  const { data: curva = [] } = useQuery<PuntoCurva[]>({
    queryKey: ['ev-curva', semana, otm],
    queryFn: () => req(`/ev/curva?hasta=${semana}${otm ? `&otm=${otm}` : ''}`),
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
    queryKey: ['ev-reporte', semana, otm],
    queryFn: () => req(`/ev/reporte?semana=${semana}${otm ? `&otm=${otm}` : ''}`),
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [avances, setAvances] = useState<Record<number, string>>({})
  const [hh, setHh] = useState<Record<number, string>>({})
  const [msg, setMsg] = useState('')

  const { data: todasCaptura = [], isLoading } = useQuery<CapturaPartida[]>({
    queryKey: ['ev-captura', semana, otm],
    queryFn: () => req(`/ev/captura?semana=${semana}${otm ? `&otm=${otm}` : ''}`),
  })
  const captura = todasCaptura.filter(p => p.hitos && p.hitos.length > 0)

  useEffect(() => {
    const a: Record<number, string> = {}
    const h: Record<number, string> = {}
    captura.forEach(p => {
      h[p.partida_id] = String(p.hh_semana || 0)
      p.hitos.forEach(x => { a[x.hito_id] = String(x.cant_actual ?? '') })
    })
    setAvances(a); setHh(h); setMsg('')
  // eslint-disable-next-line
  }, [captura.map(p=>p.partida_id).join(',')])

  const guardar = useMutation({
    mutationFn: () => req('/ev/captura', {
      method: 'POST',
      body: JSON.stringify({
        semana,
        avances: Object.entries(avances).map(([id, v]) => ({ hito_id: Number(id), cantidad_acum: Number(v) || 0 })),
        hh_gastadas: Object.entries(hh).map(([id, v]) => ({ partida_id: Number(id), hh: Number(v) || 0 })),
      }),
    }),
    onSuccess: () => {
      setMsg(`✓ Semana ${semana} guardada`)
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
      qc.invalidateQueries({ queryKey: ['ev-arbol'] })
      qc.invalidateQueries({ queryKey: ['ev-curva'] })
    },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })

  // Árbol WBS (incluye nodos de agrupación) + rollup de HH auto por nodo
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildWbsTree(todasCaptura), [todasCaptura])
  const visibles = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  const padres = useMemo(() => new Set(todasCaptura.filter(p => todasCaptura.some(c => c.parent_codigo === p.codigo)).map(p => p.codigo)), [todasCaptura])
  const toggleNivel = (c: string) => setCollapsed(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  const hhRollup = useMemo(() => {
    const memo = new Map<string, number>()
    const byCode = new Map(todasCaptura.map(p => [p.codigo, p]))
    const calc = (code: string): number => {
      if (memo.has(code)) return memo.get(code)!
      const hijos = todasCaptura.filter(c => c.parent_codigo === code)
      const v = hijos.length ? hijos.reduce((s, c) => s + calc(c.codigo), 0) : (byCode.get(code)?.hh_tareo ?? 0)
      memo.set(code, v); return v
    }
    todasCaptura.forEach(p => calc(p.codigo))
    return memo
  }, [todasCaptura])

  const toggleExp = (id: number) => setExpanded(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })

  if (isLoading) return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin"/>Cargando…</p>

  if (!captura.length) return (
    <div className={`${CARD} text-center py-10`}>
      <p className="text-k-text3 text-sm">Sin actividades con avance para{otm ? ` ${otm}` : ' la selección'}.</p>
      <p className="text-k-text3 text-xs mt-1">Importa partidas en la pestaña <strong>Importar</strong>.</p>
    </div>
  )

  const totalHHTareo = captura.reduce((s,p) => s + (p.hh_tareo||0), 0)
  const totalHHExtra = Object.values(hh).reduce((s,v) => s + (Number(v)||0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-k-text3">
            Ingresa el <strong className="text-k-text2">acumulado a la fecha</strong> de cada actividad.
            HH del tareo se calculan automáticamente — solo agrega HH extra si corresponde.
          </p>
          {msg && <p className={`mt-1 text-xs font-bold ${msg.startsWith('✓')?'text-k-green':'text-k-red'}`}>{msg}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-k-text3 uppercase tracking-wider">HH Tareo auto</div>
            <div className="font-mono text-sm font-bold text-k-green">{fmt(totalHHTareo)} HH</div>
          </div>
          {totalHHExtra > 0 && (
            <div className="text-right">
              <div className="text-[10px] text-k-text3 uppercase tracking-wider">HH Extra</div>
              <div className="font-mono text-sm font-bold text-k-amber">{fmt(totalHHExtra)} HH</div>
            </div>
          )}
          <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className={BTN_AMBER}>
            {guardar.isPending ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            {guardar.isPending ? 'Guardando…' : `Guardar Sem ${semana}`}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(new Set())}
          className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg px-3 py-1.5 hover:text-k-text transition-colors">Expandir todo</button>
        <button onClick={() => setCollapsed(new Set(padres))}
          className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg px-3 py-1.5 hover:text-k-text transition-colors">Colapsar todo</button>
      </div>

      <NivelLeyenda />

      <div className="rounded-xl border border-k-border overflow-hidden bg-k-surface">
        <table className="w-full" style={{ fontSize:12 }}>
          <thead>
            <tr className="bg-k-raised border-b border-k-border">
              {['Fase','Código','Descripción','Und','Meta','Anterior','Actual ↵','Δ Per.','HH Auto','+ Extra'].map((h,i) => (
                <th key={h} className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-k-text3 ${ [6,9].includes(i)?'text-k-amber':[8].includes(i)?'text-k-green':i>=4?'text-right':''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(node => {
              const p = node.item
              const isLeaf = node.children.length === 0
              const st = nivelStyle(node.nivel, isLeaf, p.fase)
              const indent = (node.nivel - 1) * 14

              // Nodo de agrupación (padre)
              if (!isLeaf) {
                const hhN = hhRollup.get(p.codigo) ?? 0
                return (
                  <tr key={`n-${p.partida_id}`} style={{ background: st.bg, borderLeft: `3px solid ${st.border}`, borderBottom: '0.5px solid #1c2436' }}>
                    <td />
                    <td className="py-1.5 px-2" colSpan={2}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: indent }}>
                        <button onClick={() => toggleNivel(p.codigo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: st.text, display: 'flex', padding: 0 }}>
                          {collapsed.has(p.codigo) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: st.bold ? 700 : 600, color: st.text }}>{p.codigo}</span>
                        <span style={{ fontSize: 11, fontWeight: st.bold ? 600 : 400, fontStyle: 'italic', color: st.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descripcion}>{p.descripcion}</span>
                      </div>
                    </td>
                    <td colSpan={5} />
                    <td className="py-1.5 px-2 text-right font-mono text-k-green" style={{ fontSize: 11 }}>{hhN > 0 ? fmt(hhN) : '—'}</td>
                    <td />
                  </tr>
                )
              }

              // Hoja (actividad con hitos)
              const c = faseColor(p.fase)
              const principal = p.hitos.find(x => x.es_principal) ?? p.hitos[0]
              const tieneMulti = p.hitos.length > 1
              const isExp = expanded.has(p.partida_id)
              const actVal = principal ? Number(avances[principal.hito_id] ?? principal.cant_actual ?? 0) : 0
              const periodo = actVal - (principal?.cant_anterior ?? 0)
              return (
                <Fragment key={p.partida_id}>
                  <tr className="border-b border-k-border" style={{ background: 'transparent', borderLeft: `3px solid ${c}` }} onMouseEnter={e => (e.currentTarget.style.background = '#1c2436')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="py-1 px-2">
                      <span style={{ color: c, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}>{(p.fase ?? '—')}</span>
                    </td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                        {tieneMulti && (
                          <button onClick={() => toggleExp(p.partida_id)} className="text-k-text3 hover:text-k-amber" style={{ fontSize: 10, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>
                            {isExp ? '▾' : '▸'}
                          </button>
                        )}
                        <span className="font-mono text-k-amber" style={{ fontSize: 10 }}>{p.codigo}</span>
                      </div>
                    </td>
                    <td className="py-1 px-2" style={{ maxWidth: 260 }}>
                      <span className="text-k-text2 truncate block" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descripcion}>{p.descripcion}</span>
                    </td>
                    <td className="py-1 px-2 text-center text-k-text3 font-mono" style={{ fontSize: 11 }}>{p.unidad ?? '—'}</td>
                    <td className="py-1 px-2 text-right font-mono text-k-text3" style={{ fontSize: 11 }}>{fmt(p.metrado_proyec)}</td>
                    <td className="py-1 px-2 text-right font-mono text-k-text3" style={{ fontSize: 11 }}>{fmt(principal?.cant_anterior ?? 0)}</td>
                    <td className="py-1 px-1" style={{ minWidth: 90 }}>
                      {principal ? (
                        <input type="number" step="0.01" min="0"
                          value={avances[principal.hito_id] ?? ''}
                          onChange={e => setAvances({ ...avances, [principal.hito_id]: e.target.value })}
                          className="w-full bg-k-void border border-k-amber/40 focus:border-k-amber rounded px-2 py-1 text-k-text font-mono outline-none text-right transition-colors" style={{ fontSize: 12 }} />
                      ) : <span className="text-k-text3">—</span>}
                    </td>
                    <td className={`py-1 px-2 text-right font-mono font-bold ${periodo > 0 ? 'text-k-green' : periodo < 0 ? 'text-k-red' : 'text-k-text3'}`} style={{ fontSize: 11 }}>
                      {periodo > 0 ? '+' : ''}{fmt(periodo)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-k-green" style={{ fontSize: 11 }}>
                      {p.hh_tareo > 0 ? fmt(p.hh_tareo) : '—'}
                    </td>
                    <td className="py-1 px-1" style={{ minWidth: 70 }}>
                      <input type="number" step="0.5" min="0"
                        value={hh[p.partida_id] ?? ''} placeholder="0"
                        onChange={e => setHh({ ...hh, [p.partida_id]: e.target.value })}
                        className="w-full bg-k-void border border-k-border focus:border-k-amber rounded px-2 py-1 text-k-text font-mono outline-none text-right transition-colors" style={{ fontSize: 12 }} />
                    </td>
                  </tr>
                  {tieneMulti && isExp && p.hitos.map(x => {
                    const sub = Number(avances[x.hito_id] ?? x.cant_actual ?? 0)
                    const sp = sub - x.cant_anterior
                    return (
                      <tr key={x.hito_id} className="border-b border-k-border bg-k-raised/30">
                        <td /><td className="py-1 px-2 pl-6"><span className="text-k-text3 font-bold" style={{ fontSize: 10 }}>H{x.numero}</span></td>
                        <td className="py-1 px-2" colSpan={2}><span className="text-k-text3" style={{ fontSize: 11 }}>{x.descripcion} ({(x.peso * 100).toFixed(0)}%)</span></td>
                        <td className="py-1 px-2 text-right font-mono text-k-text3" style={{ fontSize: 11 }}>{fmt(p.metrado_proyec)}</td>
                        <td className="py-1 px-2 text-right font-mono text-k-text3" style={{ fontSize: 11 }}>{fmt(x.cant_anterior)}</td>
                        <td className="py-1 px-1">
                          <input type="number" step="0.01" min="0"
                            value={avances[x.hito_id] ?? ''} onChange={e => setAvances({ ...avances, [x.hito_id]: e.target.value })}
                            className="w-full bg-k-void border border-k-amber/30 focus:border-k-amber rounded px-2 py-1 font-mono outline-none text-right transition-colors" style={{ fontSize: 11 }} />
                        </td>
                        <td className={`py-1 px-2 text-right font-mono font-bold ${sp > 0 ? 'text-k-green' : sp < 0 ? 'text-k-red' : 'text-k-text3'}`} style={{ fontSize: 10 }}>{sp > 0 ? '+' : ''}{fmt(sp)}</td>
                        <td colSpan={2} />
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-k-border bg-k-raised">
              <td colSpan={8} className="py-2 px-3 text-[11px] text-k-text3 font-bold">{captura.length} actividades</td>
              <td className="py-2 px-2 text-right font-mono text-k-green font-bold" style={{fontSize:12}}>{totalHHTareo>0?fmt(totalHHTareo):'—'}</td>
              <td className="py-2 px-2 text-right font-mono text-k-amber font-bold" style={{fontSize:12}}>{totalHHExtra>0?fmt(totalHHExtra):'—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
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

// ── Jornada: HH por día configurable con vigencia ──────────
const DIAS_LBL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
interface JornadaResp {
  vigentes: { dia_semana: number; dia: string; hh: number }[]
  puntuales: { id: number; desde: string; hh: number; nota: string | null }[]
  semanal: { id: number; desde: string; dia_semana: number; hh: number; nota: string | null }[]
}
function JornadaConfig() {
  const qc = useQueryClient()
  const { data } = useQuery<JornadaResp>({ queryKey: ['jornada'], queryFn: () => req('/api/jornada') })
  const [abierto, setAbierto] = useState(false)
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10))
  const [hh, setHh] = useState<Record<number, string>>({})
  const [pFecha, setPFecha] = useState(''); const [pHh, setPHh] = useState(''); const [pNota, setPNota] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (data) { const m: Record<number, string> = {}; data.vigentes.forEach(v => m[v.dia_semana] = String(v.hh)); setHh(m) }
  }, [data])

  const guardarSemanal = useMutation({
    mutationFn: () => req('/api/jornada', { method: 'POST', body: JSON.stringify({ tipo: 'semanal', desde, dias: Object.fromEntries(Object.entries(hh).map(([k, v]) => [k, Number(v) || 0])) }) }),
    onSuccess: () => { setMsg(`✓ Jornada vigente desde ${desde}`); qc.invalidateQueries({ queryKey: ['jornada'] }) },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })
  const addPuntual = useMutation({
    mutationFn: () => req('/api/jornada', { method: 'POST', body: JSON.stringify({ tipo: 'puntual', fecha: pFecha, hh: Number(pHh) || 0, nota: pNota || null }) }),
    onSuccess: () => { setPFecha(''); setPHh(''); setPNota(''); setMsg('✓ Excepción agregada'); qc.invalidateQueries({ queryKey: ['jornada'] }) },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })
  const delRegla = useMutation({
    mutationFn: (id: number) => req(`/api/jornada/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jornada'] }),
  })

  const resumen = (data?.vigentes ?? []).map(v => `${DIAS_LBL[v.dia_semana]} ${v.hh}`).join(' · ')

  return (
    <div className={CARD}>
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-k-text">
          <Clock size={15} className="text-k-amber" /> Jornada — HH por día
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-k-text3 hidden md:inline">{resumen}</span>
          {abierto ? <ChevronDown size={16} className="text-k-text3" /> : <ChevronRight size={16} className="text-k-text3" />}
        </span>
      </button>

      {abierto && (
        <div className="mt-4 grid md:grid-cols-2 gap-5">
          {/* Regla semanal */}
          <div>
            <p className="text-[11px] text-k-text3 mb-2">
              HH por día de semana. Al guardar, rige <strong className="text-k-text2">desde la fecha indicada</strong> en adelante
              (el supervisor lo verá como referencial al registrar).
            </p>
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {DIAS_LBL.map((d, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-k-text3 mb-1">{d}</div>
                  <input value={hh[i] ?? ''} onChange={e => setHh({ ...hh, [i]: e.target.value })}
                    inputMode="decimal"
                    className="w-full bg-k-void border border-k-border focus:border-k-amber rounded px-1 py-1 text-center font-mono text-k-text outline-none transition-colors" style={{ fontSize: 12 }} />
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={LABEL}>Vigente desde</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={INPUT} />
              </div>
              <button onClick={() => guardarSemanal.mutate()} disabled={guardarSemanal.isPending} className={BTN_AMBER}>
                {guardarSemanal.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </div>
          </div>

          {/* Excepciones puntuales */}
          <div>
            <p className="text-[11px] text-k-text3 mb-2">
              Excepciones por fecha exacta (ej. turno extendido de 12 HH). Tienen prioridad sobre la regla semanal.
            </p>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <label className={LABEL}>Fecha</label>
                <input type="date" value={pFecha} onChange={e => setPFecha(e.target.value)} className={INPUT} />
              </div>
              <div style={{ width: 70 }}>
                <label className={LABEL}>HH</label>
                <input value={pHh} onChange={e => setPHh(e.target.value)} inputMode="decimal" placeholder="12" className={INPUT} />
              </div>
              <button onClick={() => addPuntual.mutate()} disabled={addPuntual.isPending || !pFecha || !pHh} className={BTN_GHOST}>
                <Plus size={14} /> Agregar
              </button>
            </div>
            <input value={pNota} onChange={e => setPNota(e.target.value)} placeholder="Nota (opcional)" className={`${INPUT} mb-3`} />
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(data?.puntuales ?? []).length === 0 && <p className="text-[11px] text-k-text3">Sin excepciones.</p>}
              {(data?.puntuales ?? []).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-[11px] bg-k-raised rounded px-2 py-1">
                  <span className="font-mono text-k-text2">{r.desde}</span>
                  <span className="font-mono font-bold text-k-amber">{r.hh} HH</span>
                  <span className="text-k-text3 flex-1 truncate">{r.nota ?? ''}</span>
                  <button onClick={() => delRegla.mutate(r.id)} className="text-k-red hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {msg && <p className={`mt-3 text-xs font-bold ${msg.startsWith('✓') ? 'text-k-green' : 'text-k-red'}`}>{msg}</p>}
    </div>
  )
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildWbsTree(partidas), [partidas])
  const visibles = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  const toggle = (c: string) => setCollapsed(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  const padres = useMemo(() => new Set(partidas.filter(p => partidas.some(c => c.parent_codigo === p.codigo)).map(p => p.codigo)), [partidas])

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
      codigo: p.codigo, otm_id: p.otm_id, fase: p.fase ?? '', sub_fase: p.sub_fase,
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
      <JornadaConfig />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-k-text3 max-w-2xl">
          Define el WBS y los hitos ponderados (rules of credit). Los pesos de cada partida deben sumar
          100% y debe existir un único hito principal — el que reporta la cantidad instalada oficial.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed(new Set())}
            className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg px-3 py-2 hover:text-k-text transition-colors">Expandir todo</button>
          <button onClick={() => setCollapsed(new Set(padres))}
            className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg px-3 py-2 hover:text-k-text transition-colors">Colapsar todo</button>
          <button onClick={() => { setEditando(null); setErrMsg(''); setForm({ ...PARTIDA_VACIA, hitos: [...PARTIDA_VACIA.hitos] }) }}
            className={BTN_AMBER}>
            <Plus size={14} /> Nueva partida
          </button>
        </div>
      </div>

      <NivelLeyenda />

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
              {visibles.map(node => {
                const p = node.item
                const isLeaf = node.children.length === 0
                const st = nivelStyle(node.nivel, isLeaf, p.fase)
                const indent = (node.nivel - 1) * 16
                return (
                  <tr key={p.id} className="border-b border-k-border last:border-0"
                      style={{ background: st.bg, borderLeft: `3px solid ${st.border}` }}>
                    <td className={`${TD} text-[11px]`} style={{ color: '#8a96ad' }}>{p.otm_id ?? '—'}</td>
                    <td className={`${TD} font-mono text-[11px]`} style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: indent }}>
                        {!isLeaf
                          ? <button onClick={() => toggle(p.codigo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: st.text, display: 'flex', padding: 0 }}>
                              {collapsed.has(p.codigo) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </button>
                          : <span style={{ display: 'inline-block', width: 17 }} />}
                        <span style={{ color: st.text, fontWeight: st.bold ? 700 : 600 }}>{p.codigo}</span>
                      </div>
                    </td>
                    <td className={`${TD} max-w-[280px] truncate`} title={p.descripcion}
                        style={{ color: isLeaf ? '#e8edf5' : st.text, fontWeight: st.bold ? 600 : 400, fontStyle: !isLeaf ? 'italic' : 'normal' }}>
                      {p.descripcion}
                    </td>
                    <td className={TD}>{p.unidad || '—'}</td>
                    <td className={TD}>{p.sistema ?? '—'}</td>
                    <td className={`${TD} text-right font-mono`}>{Number(p.metrado_presup) > 0 ? fmt(Number(p.metrado_presup)) : '—'}</td>
                    <td className={`${TD} text-right font-mono`}>
                      {p.metrado_proyec !== null ? fmt(Number(p.metrado_proyec)) : <span className="text-k-text3">= ppto</span>}
                    </td>
                    <td className={`${TD} text-right font-mono`}>{Number(p.hh_presup) > 0 ? fmt(Number(p.hh_presup), 0) : '—'}</td>
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
                )
              })}
              {partidas.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-k-text3 text-sm">
                  Sin partidas. Crea la primera con el botón "Nueva partida".
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-k-border bg-k-raised">
          <span className="text-[11px] text-k-text3">{partidas.length} partidas · {padres.size} nodos de agrupación</span>
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