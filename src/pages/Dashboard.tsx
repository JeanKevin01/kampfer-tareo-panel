import { Users, ClipboardList, Clock, TrendingUp } from 'lucide-react'

const STATS = [
  { label: 'Trabajadores activos', value: '99',  icon: Users,         color: 'text-k-blue',  bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  { label: 'OTMs en ejecución',    value: '6',   icon: ClipboardList, color: 'text-k-amber', bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  { label: 'Registros hoy',        value: '—',   icon: Clock,         color: 'text-k-green', bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  { label: 'HH acumuladas hoy',    value: '—',   icon: TrendingUp,    color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div key={s.label} className={`bg-k-surface border ${s.border} rounded-xl p-5`}>
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-4`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div className={`font-mono text-3xl font-medium ${s.color} mb-1`}>{s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cards secundarias */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Supervisores hoy
          </h3>
          <div className="flex items-center gap-3 py-2 text-sm text-k-text2">
            <span className="w-2 h-2 rounded-full bg-k-text3" />
            Conecta la API para ver datos en tiempo real
          </div>
        </div>
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            OTMs activas
          </h3>
          <div className="flex items-center gap-3 py-2 text-sm text-k-text2">
            <span className="w-2 h-2 rounded-full bg-k-text3" />
            Conecta la API para ver datos en tiempo real
          </div>
        </div>
      </div>

    </div>
  )
}