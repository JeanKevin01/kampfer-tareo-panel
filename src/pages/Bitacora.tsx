import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, Users, ClipboardList, TrendingUp, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Registro {
  id: number; trab_id: string; otm_id: string
  supervisor_id: string; fecha: string; hora: string; hh: number | null
  created_at: string
}
interface Supervisor { id: string; nombre: string }

function fechasRango(dias: number): string[] {
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return d.toISOString().split('T')[0]
  })
}

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Bitacora() {
  const [dias, setDias]           = useState(7)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const fechas = useMemo(() => fechasRango(dias), [dias])

  const { data: supervisores = [] } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(API + '/api/supervisores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const supMap = useMemo(() =>
    Object.fromEntries(supervisores.map(s => [s.id, s.nombre])), [supervisores])

  // Fetch registros para cada fecha en paralelo
  const queries = fechas.map(fecha => useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => fetch(`${API}/api/registros/${fecha}`).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  }))

  const loading = queries.some(q => q.isLoading)

  // Agrupar registros por fecha → supervisor → OTM
  const diasData = useMemo(() => {
    return fechas.map((fecha, i) => {
      const regs = queries[i].data ?? []
      if (regs.length === 0) return { fecha, regs: [], grupos: [], totalHH: 0 }

      // Agrupar por supervisor + OTM
      const grupos: Record<string, { supId: string; otm: string; count: number; hora: string; hh: number }> = {}
      regs.forEach(r => {
        const key = `${r.supervisor_id}__${r.otm_id}`
        if (!grupos[key]) grupos[key] = { supId: r.supervisor_id, otm: r.otm_id, count: 0, hora: r.hora, hh: 0 }
        grupos[key].count++
        grupos[key].hh += r.hh ?? 0
        if (r.hora < grupos[key].hora) grupos[key].hora = r.hora
      })

      const totalHH = regs.reduce((s, r) => s + (r.hh ?? 0), 0)
      return { fecha, regs, grupos: Object.values(grupos), totalHH }
    }).filter(d => d.regs.length > 0)
  }, [fechas, queries.map(q => q.data).join(',')])

  const totalSemana   = diasData.reduce((s, d) => s + d.regs.length, 0)
  const diasConActividad = diasData.length
  const totalHHSemana = diasData.reduce((s, d) => s + d.totalHH, 0)

  function toggleDia(fecha: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(fecha) ? next.delete(fecha) : next.add(fecha)
      return next
    })
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">Historial de actividad del sistema de tareo</p>
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                dias === d ? 'bg-k-amber text-black' : 'bg-k-raised border border-k-border text-k-text2 hover:text-k-text'
              }`}>
              {d === 7 ? 'Esta semana' : d === 14 ? '2 semanas' : '30 días'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Registros en el período', value: totalSemana,                    color: 'text-k-blue',  icon: Users       },
          { label: 'Días con actividad',       value: diasConActividad,               color: 'text-k-green', icon: Calendar    },
          { label: 'HH acumuladas',            value: totalHHSemana.toFixed(1) + ' HH', color: 'text-k-amber', icon: TrendingUp  },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-k-raised flex items-center justify-center flex-shrink-0">
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`font-mono text-2xl font-medium ${s.color}`}>
                {loading ? '…' : s.value}
              </div>
              <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-k-text3">
          <Loader2 size={18} className="animate-spin mr-2" /> Cargando historial…
        </div>
      )}

      {!loading && diasData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-3 opacity-20">📜</div>
          <p className="text-k-text3 text-sm">Sin actividad en los últimos {dias} días</p>
        </div>
      )}

      <div className="space-y-3">
        {diasData.map(dia => {
          const expanded = expandidos.has(dia.fecha)
          const trabUnicos = new Set(dia.regs.map(r => r.trab_id)).size
          const otmsUnicos = new Set(dia.regs.map(r => r.otm_id)).size
          const supsUnicos = new Set(dia.regs.map(r => r.supervisor_id)).size

          return (
            <div key={dia.fecha} className="bg-k-surface border border-k-border rounded-xl overflow-hidden">

              {/* Header del día */}
              <button onClick={() => toggleDia(dia.fecha)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-k-raised/50 transition-colors text-left">
                <div className="w-2.5 h-2.5 rounded-full bg-k-green flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-k-text capitalize">{formatFecha(dia.fecha)}</p>
                  <p className="text-[11px] text-k-text3 mt-0.5">
                    {dia.regs.length} registros · {trabUnicos} trabajadores · {otmsUnicos} OTMs · {supsUnicos} supervisores
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-k-green">{dia.totalHH.toFixed(1)} HH</div>
                    <div className="text-[9px] text-k-text3 uppercase">Total día</div>
                  </div>
                  {expanded ? <ChevronUp size={14} className="text-k-text3" /> : <ChevronDown size={14} className="text-k-text3" />}
                </div>
              </button>

              {/* Detalle por grupos */}
              {expanded && (
                <div className="border-t border-k-border">
                  {dia.grupos
                    .sort((a, b) => a.hora.localeCompare(b.hora))
                    .map((g, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-k-border last:border-0 hover:bg-k-raised/30 transition-colors">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Clock size={12} className="text-k-text3" />
                        <span className="font-mono text-xs text-k-text2">{g.hora}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-k-text truncate">{supMap[g.supId] ?? g.supId}</span>
                        <span className="text-k-text3">→</span>
                        <span className="font-mono text-xs font-bold text-k-amber flex-shrink-0">{g.otm}</span>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Users size={11} className="text-k-text3" />
                          <span className="text-xs text-k-text2">{g.count} trabajadores</span>
                        </div>
                        {g.hh > 0 && (
                          <div className="flex items-center gap-1.5">
                            <TrendingUp size={11} className="text-k-green" />
                            <span className="text-xs font-mono text-k-green">{g.hh.toFixed(1)} HH</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}