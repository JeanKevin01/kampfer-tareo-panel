import { useQuery } from '@tanstack/react-query'
import { Users, ClipboardList, Clock, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

function useAPI<T>(key: string, url: string) {
  return useQuery<T>({ queryKey: [key], queryFn: () => fetch(API + url).then(r => r.json()) })
}

interface Supervisor { id: string; nombre: string }
interface OTM { id: string; descripcion: string; estado: string }
interface Registro { id: number; trab_id: string; otm_id: string; supervisor_id: string; hh: number | null }

export default function Dashboard() {
  const supervisores = useAPI<Supervisor[]>('supervisores', '/api/supervisores')
  const otms         = useAPI<OTM[]>('otms', '/api/otms')
  const registros    = useAPI<Registro[]>('registros-hoy', '/api/registros/hoy')

  const totalHH = registros.data
    ? registros.data.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1)
    : '—'

  const stats = [
    {
      label: 'Trabajadores activos', value: '99',
      icon: Users, color: 'text-k-blue', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    },
    {
      label: 'OTMs en ejecución',
      value: otms.isLoading ? '…' : String(otms.data?.length ?? '—'),
      icon: ClipboardList, color: 'text-k-amber', bg: 'bg-amber-500/10', border: 'border-amber-500/20',
    },
    {
      label: 'Registros hoy',
      value: registros.isLoading ? '…' : String(registros.data?.length ?? '—'),
      icon: Clock, color: 'text-k-green', bg: 'bg-green-500/10', border: 'border-green-500/20',
    },
    {
      label: 'HH acumuladas hoy', value: registros.isLoading ? '…' : totalHH,
      icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    },
  ]

  return (
    <div className="space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`bg-k-surface border ${s.border} rounded-xl p-5`}>
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-4`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div className={`font-mono text-3xl font-medium ${s.color} mb-1`}>{s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Supervisores + OTMs */}
      <div className="grid grid-cols-2 gap-4">

        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Supervisores registrados
          </h3>
          {supervisores.isLoading && <p className="text-k-text3 text-sm">Cargando…</p>}
          {supervisores.data?.map((s) => {
            const reportoHoy = registros.data?.some(r => r.supervisor_id === s.id)
            return (
              <div key={s.id} className="flex items-center gap-3 py-2 border-b border-k-border last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${reportoHoy ? 'bg-k-green' : 'bg-k-text3'}`} />
                <span className="text-sm text-k-text flex-1 truncate">{s.nombre}</span>
                {reportoHoy
                  ? <span className="flex items-center gap-1 text-[10px] text-k-green"><CheckCircle size={11}/> Reportó</span>
                  : <span className="flex items-center gap-1 text-[10px] text-k-text3"><AlertCircle size={11}/> Pendiente</span>
                }
              </div>
            )
          })}
        </div>

        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            OTMs activas
          </h3>
          {otms.isLoading && <p className="text-k-text3 text-sm">Cargando…</p>}
          {otms.data?.map((o) => (
            <div key={o.id} className="flex items-center gap-3 py-2 border-b border-k-border last:border-0">
              <span className="font-mono text-[11px] text-k-amber flex-shrink-0">{o.id}</span>
              <span className="text-[12px] text-k-text2 flex-1 truncate">{o.descripcion}</span>
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wide flex-shrink-0
                ${o.estado === 'EJECUCION' ? 'bg-green-500/10 text-k-green border border-green-500/20'
                : 'bg-amber-500/10 text-k-amber border border-amber-500/20'}`}>
                {o.estado}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}