import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, ClipboardList, TrendingUp, CheckCircle, XCircle, Loader2 } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

interface Supervisor { id: string; nombre: string }
interface OTM        { id: string; descripcion: string; estado: string; area?: string }
interface Trabajador { id: string; activo: boolean }
interface Registro   { trab_id: string; otm_id: string; supervisor_id: string; hh: number | null }

export default function Dashboard() {
  const { data: supervisores = [], isLoading: lS } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(`${API}/api/supervisores`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const { data: otms = [], isLoading: lO } = useQuery<OTM[]>({
    queryKey: ['otms'],
    queryFn: () => fetch(`${API}/api/otms`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const { data: trabajadores = [], isLoading: lT } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores-admin'],
    queryFn: () => fetch(`${API}/admin/trabajadores`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const { data: registros = [], isLoading: lR } = useQuery<Registro[]>({
    queryKey: ['registros-hoy'],
    queryFn: () => fetch(`${API}/api/registros/${hoy()}`).then(r => r.json()),
    refetchInterval: 60_000,
  })

  const isLoading = lS || lO || lT || lR

  const trabActivos   = useMemo(() => trabajadores.filter(t => t.activo).length, [trabajadores])
  const otmsEjecucion = useMemo(() => otms.filter(o => o.estado === 'EJECUCION').length, [otms])
  const hhHoy         = useMemo(() => registros.reduce((s, r) => s + (r.hh ?? 0), 0), [registros])
  const supReportaron = useMemo(() => new Set(registros.map(r => r.supervisor_id)).size, [registros])

  // Stats por supervisor
  const supStats = useMemo(() => supervisores.map(s => {
    const regs  = registros.filter(r => r.supervisor_id === s.id)
    const hh    = regs.reduce((sum, r) => sum + (r.hh ?? 0), 0)
    const trabs = new Set(regs.map(r => r.trab_id)).size
    const otmsS = [...new Set(regs.map(r => r.otm_id))]
    return { ...s, regs: regs.length, hh, trabs, otms: otmsS, reporto: regs.length > 0 }
  }).sort((a, b) => (b.reporto ? 1 : 0) - (a.reporto ? 1 : 0)), [supervisores, registros])

  // Actividad por proyecto
  const otmActivity = useMemo(() => {
    const map: Record<string, { hh: number; trabs: Set<string>; sup: Set<string> }> = {}
    registros.forEach(r => {
      if (!map[r.otm_id]) map[r.otm_id] = { hh: 0, trabs: new Set(), sup: new Set() }
      map[r.otm_id].hh    += r.hh ?? 0
      map[r.otm_id].trabs.add(r.trab_id)
      map[r.otm_id].sup.add(r.supervisor_id)
    })
    return Object.entries(map)
      .map(([id, d]) => ({
        id, hh: d.hh, trabs: d.trabs.size, sups: d.sup.size,
        desc: otms.find(o => o.id === id)?.descripcion ?? '—',
      }))
      .sort((a, b) => b.hh - a.hh)
  }, [registros, otms])

  const kpis = [
    { label: 'Trabajadores activos', value: isLoading ? '…' : String(trabActivos), color: 'text-k-blue', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Users },
    { label: 'Proyectos en ejecución',    value: isLoading ? '…' : String(otmsEjecucion), color: 'text-k-amber', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: ClipboardList },
    { label: 'HH registradas hoy',   value: isLoading ? '…' : hhHoy.toFixed(1),    color: 'text-k-green', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: TrendingUp },
    { label: 'Supervisores reportaron', value: isLoading ? '…' : `${supReportaron}/${supervisores.length}`,
      color: supReportaron === supervisores.length ? 'text-k-green' : 'text-k-red',
      bg: supReportaron === supervisores.length ? 'bg-green-500/10' : 'bg-red-500/10',
      border: supReportaron === supervisores.length ? 'border-green-500/20' : 'border-red-500/20',
      icon: CheckCircle },
  ]

  return (
    <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-k-text3 text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando datos de hoy…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* Semáforo supervisores */}
          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-k-border bg-k-raised flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">
                Estado por supervisor — {new Date().toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long' })}
              </h2>
              <span className="text-[11px] font-mono text-k-text3">
                {supReportaron}/{supervisores.length} reportaron
              </span>
            </div>
            <div className="divide-y divide-k-border">
              {supStats.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    s.reporto ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}>
                    {s.reporto
                      ? <CheckCircle size={18} className="text-k-green" />
                      : <XCircle    size={18} className="text-k-red" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-k-text truncate">{s.nombre}</div>
                    {s.reporto ? (
                      <div className="text-[11px] text-k-text3 mt-0.5">
                        {s.otms.join(' · ')}
                      </div>
                    ) : (
                      <div className="text-[11px] text-k-red/70 mt-0.5">Sin reporte aún</div>
                    )}
                  </div>
                  {s.reporto && (
                    <div className="flex gap-5 text-right flex-shrink-0">
                      <div>
                        <div className="font-mono text-sm font-medium text-k-green">{s.hh.toFixed(1)}</div>
                        <div className="text-[9px] text-k-text3 uppercase">HH</div>
                      </div>
                      <div>
                        <div className="font-mono text-sm font-medium text-k-text">{s.trabs}</div>
                        <div className="text-[9px] text-k-text3 uppercase">Pers</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actividad por proyecto */}
          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-k-border bg-k-raised">
              <h2 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">
                Actividad por proyecto hoy
              </h2>
            </div>
            {otmActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-k-text3">
                <div className="text-4xl mb-3 opacity-20">📋</div>
                <p className="text-sm">Sin registros de HH para hoy</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-k-border bg-k-raised/50">
                      <th className="px-4 py-2.5 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">OTM</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">Descripción</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-center">Pers</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-right">HH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otmActivity.map(o => (
                      <tr key={o.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-k-amber">{o.id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-k-text2 truncate block max-w-[160px]">{o.desc}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm text-k-text">{o.trabs}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm font-bold text-k-green">{o.hh.toFixed(1)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-k-border bg-k-raised/50">
                      <td colSpan={2} className="px-4 py-2.5 text-[11px] text-k-text3">
                        {otmActivity.length} OTM{otmActivity.length !== 1 ? 's' : ''} con actividad
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-sm font-bold text-k-text">
                        {otmActivity.reduce((s, o) => s + o.trabs, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-bold text-k-green">
                        {hhHoy.toFixed(1)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}