import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Database, Server, RefreshCw, CheckCircle, XCircle, Zap, Clock, Users, ClipboardList, FileText } from 'lucide-react'

import { api, API_BASE } from '@/lib/api'
import MonitorTareo from '@/pages/MonitorTareo'
const API = API_BASE

interface HealthData { version?: string; status?: string; [key: string]: unknown }
interface Trabajador { id: string; activo: boolean }
interface OTM { id: string; estado: string }
interface Registro { id: number; hh: number | null }

async function pingWithTime(url: string): Promise<{ ok: boolean; ms: number; data?: unknown }> {
  const t = performance.now()
  try {
    const r = await fetch(url)
    const ms = Math.round(performance.now() - t)
    const data = await r.json()
    return { ok: r.ok, ms, data }
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t) }
  }
}

function StatusBadge({ ok, ms }: { ok: boolean; ms: number }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold
      ${ok ? 'bg-green-500/10 border-green-500/20 text-k-green' : 'bg-red-500/10 border-red-500/20 text-k-red'}`}>
      {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {ok ? 'Operativo' : 'Sin respuesta'}
      {ok && <span className="font-mono text-k-text3 font-normal">{ms}ms</span>}
    </div>
  )
}

// ── Fase S·S5: monitor UNIFICADO — tab Tareo (control de HH del día) +
// tab Sistema (salud del API/BD). Antes eran dos páginas del menú.
export default function Monitor() {
  const [tab, setTab] = useState<'tareo' | 'sistema'>('tareo')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['tareo', 'Tareo del día'], ['sistema', 'Sistema']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              tab === id ? 'bg-amber-500/15 border-amber-500/30 text-k-amber'
                         : 'bg-k-surface border-k-border text-k-text2 hover:text-k-text'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'tareo' ? <MonitorTareo /> : <MonitorSistema />}
    </div>
  )
}

function MonitorSistema() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const health = useQuery({
    queryKey: ['health', refreshKey],
    queryFn: () => pingWithTime(API + '/health'),
    refetchInterval: 30_000,
  })

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores-monitor', refreshKey],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
  })

  const { data: otms = [] } = useQuery<OTM[]>({
    queryKey: ['otms-monitor', refreshKey],
    queryFn: () => api<OTM[]>('/api/otms'),
  })

  const { data: registrosHoy = [] } = useQuery<Registro[]>({
    queryKey: ['registros-monitor', refreshKey],
    queryFn: () => api<Registro[]>('/api/registros/hoy'),
  })

  const { data: supervisores = [] } = useQuery<{ id: string }[]>({
    queryKey: ['sup-monitor', refreshKey],
    queryFn: () => api<{ id: string }[]>('/api/supervisores'),
  })

  const apiOk  = health.data?.ok ?? false
  const apiMs  = health.data?.ms ?? 0
  const dbOk   = trabajadores.length > 0
  const activos = trabajadores.filter(t => t.activo).length
  const totalHH = registrosHoy.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1)
  const now = new Date().toLocaleTimeString('es-PE')

  const services = [
    {
      name: 'FastAPI Backend',
      desc: 'api.apps1.astraera.space',
      icon: Server,
      ok: apiOk,
      ms: apiMs,
      detail: health.data?.data ? `v${(health.data.data as HealthData).version ?? '—'}` : '—',
    },
    {
      name: 'PostgreSQL',
      desc: 'Base de datos principal',
      icon: Database,
      ok: dbOk,
      ms: 0,
      detail: dbOk ? `${trabajadores.length} trabajadores en BD` : 'Sin conexión',
    },
    {
      name: 'n8n Workflows',
      desc: 'n8n.apps1.astraera.space',
      icon: Zap,
      ok: null,
      ms: 0,
      detail: 'Verificar manualmente',
    },
  ]

  const stats = [
    { label: 'Trabajadores activos', value: activos,               icon: Users,        color: 'text-k-blue'  },
    { label: 'Proyectos activos',         value: otms.length,           icon: ClipboardList, color: 'text-k-amber' },
    { label: 'Registros hoy',        value: registrosHoy.length,   icon: FileText,     color: 'text-k-green' },
    { label: 'HH registradas hoy',   value: totalHH + ' HH',      icon: Clock,        color: 'text-purple-400' },
    { label: 'Supervisores',         value: supervisores.length,   icon: Users,        color: 'text-k-text2' },
    { label: 'Inactivos',            value: trabajadores.length - activos, icon: Users, color: 'text-k-text3' },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${apiOk ? 'bg-k-green animate-pulse' : 'bg-k-red'}`} />
          <span className="text-sm text-k-text2">
            {apiOk ? 'Todos los servicios operativos' : 'Revisar servicios'}
          </span>
          <span className="text-[11px] text-k-text3 font-mono">Última verificación: {now}</span>
        </div>
        <button onClick={refresh} disabled={health.isFetching}
          className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 hover:text-k-text font-bold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
          <RefreshCw size={13} className={health.isFetching ? 'animate-spin' : ''} />
          Verificar
        </button>
      </div>

      {/* Servicios */}
      <div className="grid grid-cols-3 gap-4">
        {services.map(s => (
          <div key={s.name} className="bg-k-surface border border-k-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-k-raised border border-k-border flex items-center justify-center">
                <s.icon size={18} className="text-k-text2" />
              </div>
              {s.ok === null
                ? <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-k-border bg-k-raised text-xs font-bold text-k-text3">
                    <span className="w-2 h-2 rounded-full bg-k-text3" /> Manual
                  </div>
                : <StatusBadge ok={s.ok} ms={s.ms} />
              }
            </div>
            <div className="font-bold text-sm text-k-text mb-0.5">{s.name}</div>
            <div className="text-[11px] text-k-text3 mb-1">{s.desc}</div>
            <div className="text-[10px] font-mono text-k-amber">{s.detail}</div>
          </div>
        ))}
      </div>

      {/* Stats de la BD */}
      <div>
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-3">
          Estado de la base de datos
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-k-raised flex items-center justify-center flex-shrink-0">
                <s.icon size={16} className={s.color} />
              </div>
              <div>
                <div className={`font-mono text-xl font-medium ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Links rápidos */}
      <div>
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-3">
          Accesos directos
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'API Docs',   url: API + '/docs',                         color: 'text-k-blue'  },
            { label: 'API Health', url: API + '/health',                       color: 'text-k-green' },
            { label: 'Adminer',    url: 'https://adminer.apps1.astraera.space', color: 'text-k-amber' },
            { label: 'n8n',        url: 'https://n8n.apps1.astraera.space',    color: 'text-purple-400' },
          ].map(l => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
              className="bg-k-surface border border-k-border hover:border-k-border2 rounded-xl p-4 flex items-center justify-between group transition-colors">
              <span className={`text-sm font-bold ${l.color}`}>{l.label}</span>
              <Activity size={14} className="text-k-text3 group-hover:text-k-text transition-colors" />
            </a>
          ))}
        </div>
      </div>

    </div>
  )
}