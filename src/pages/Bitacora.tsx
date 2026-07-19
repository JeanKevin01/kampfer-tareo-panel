import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, Users, TrendingUp, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

import { api } from '@/lib/api'

interface Registro {
  id: number; trab_id: string; otm_id: string
  supervisor_id: string; hora: string; hh: number | null
}
interface Supervisor { id: string; nombre: string }
interface DiaData { fecha: string; regs: Registro[] }

function hoy() { return new Date().toISOString().split('T')[0] }

function haceDias(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - (n - 1))
  return d.toISOString().split('T')[0]
}

function getDatesInRange(desde: string, hasta: string): string[] {
  const dates: string[] = []
  const cur = new Date(desde + 'T12:00:00')
  const end = new Date(hasta + 'T12:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function formatFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

type Modo = '7' | '14' | '30' | 'custom'

export default function Bitacora() {
  const [modo, setModo]               = useState<Modo>('7')
  const [desdeCustom, setDesdeCustom] = useState(haceDias(7))
  const [hastaCustom, setHastaCustom] = useState(hoy())
  const [expandidos, setExpandidos]   = useState<Set<string>>(new Set())

  const rangoDesde = modo === 'custom' ? desdeCustom : haceDias(parseInt(modo))
  const rangoHasta = modo === 'custom' ? hastaCustom : hoy()

  const { data: supervisores = [] } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => api<Supervisor[]>('/api/supervisores'),
    staleTime: 10 * 60 * 1000,
  })

  const { data: diasData = [], isLoading } = useQuery<DiaData[]>({
    queryKey: ['bitacora', rangoDesde, rangoHasta],
    queryFn: async () => {
      const fechas = getDatesInRange(rangoDesde, rangoHasta)
      const resultados = await Promise.all(
        fechas.map(f =>
          api(`/api/registros/${f}`)
            .then(data => ({ fecha: f, regs: Array.isArray(data) ? data : [] }))
            .catch(() => ({ fecha: f, regs: [] }))
        )
      )
      return resultados
        .filter(d => d.regs.length > 0)
        .reverse()
    },
    staleTime: 2 * 60 * 1000,
  })

  const supMap: Record<string, string> = Object.fromEntries(
    supervisores.map(s => [s.id, s.nombre])
  )

  const totalRegistros   = diasData.reduce((s, d) => s + d.regs.length, 0)
  const diasConActividad = diasData.length
  const totalHH          = diasData.reduce((s, d) =>
    s + d.regs.reduce((ss, r) => ss + (r.hh ?? 0), 0), 0)

  function cambiarModo(m: Modo) {
    setModo(m)
    setExpandidos(new Set())
  }

  function toggleDia(fecha: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(fecha)) next.delete(fecha)
      else next.add(fecha)
      return next
    })
  }

  const OPCIONES: [Modo, string][] = [['7','7 días'],['14','2 semanas'],['30','30 días'],['custom','Rango']]

  return (
    <div className="space-y-5">

      {/* Selector de rango */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-k-raised border border-k-border rounded-xl p-1">
          {OPCIONES.map(([m, label]) => (
            <button key={m} onClick={() => cambiarModo(m)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                modo === m ? 'bg-k-amber text-black' : 'text-k-text2 hover:text-k-text'
              }`}>
              {m === 'custom' && <Calendar size={11} />}
              {label}
            </button>
          ))}
        </div>

        {modo === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Calendar size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
              <input type="date" value={desdeCustom} max={hastaCustom}
                onChange={e => { setDesdeCustom(e.target.value); setExpandidos(new Set()) }}
                className="bg-k-raised border border-k-border rounded-lg pl-8 pr-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
            </div>
            <span className="text-k-text3">→</span>
            <div className="relative">
              <Calendar size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
              <input type="date" value={hastaCustom} min={desdeCustom} max={hoy()}
                onChange={e => { setHastaCustom(e.target.value); setExpandidos(new Set()) }}
                className="bg-k-raised border border-k-border rounded-lg pl-8 pr-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
            </div>
            <span className="text-[11px] text-k-text3 bg-k-raised border border-k-border px-3 py-2 rounded-lg">
              {getDatesInRange(desdeCustom, hastaCustom).length} días
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Registros en el período', value: isLoading ? '…' : totalRegistros,              color: 'text-k-blue',  Icon: Users      },
          { label: 'Días con actividad',       value: isLoading ? '…' : diasConActividad,            color: 'text-k-green', Icon: Calendar   },
          { label: 'HH acumuladas',            value: isLoading ? '…' : totalHH.toFixed(1) + ' HH', color: 'text-k-amber', Icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-k-raised flex items-center justify-center flex-shrink-0">
              <s.Icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`font-mono text-2xl font-medium ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-k-text3">
          <Loader2 size={24} className="animate-spin text-k-amber" />
          <p className="text-sm">Cargando historial…</p>
        </div>
      )}

      {/* Vacío */}
      {!isLoading && diasData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-3 opacity-20">📜</div>
          <p className="text-k-text3 text-sm">Sin actividad en el período seleccionado</p>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && diasData.length > 0 && (
        <div className="space-y-3">
          {diasData.map(dia => {
            const expanded   = expandidos.has(dia.fecha)
            const trabUnicos = new Set(dia.regs.map(r => r.trab_id)).size
            const otmsUnicos = new Set(dia.regs.map(r => r.otm_id)).size
            const supsUnicos = new Set(dia.regs.map(r => r.supervisor_id)).size
            const totalHHDia = dia.regs.reduce((s, r) => s + (r.hh ?? 0), 0)

            const grupos: Record<string, {
              supId: string; otm: string; count: number; hora: string; hh: number
            }> = {}
            dia.regs.forEach(r => {
              const k = `${r.supervisor_id}|${r.otm_id}`
              if (!grupos[k]) grupos[k] = {
                supId: r.supervisor_id, otm: r.otm_id,
                count: 0, hora: r.hora, hh: 0,
              }
              grupos[k].count++
              grupos[k].hh += r.hh ?? 0
              if (r.hora < grupos[k].hora) grupos[k].hora = r.hora
            })

            return (
              <div key={dia.fecha} className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
                <button onClick={() => toggleDia(dia.fecha)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-k-raised/50 transition-colors text-left">
                  <div className="w-2.5 h-2.5 rounded-full bg-k-green flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-k-text capitalize">{formatFecha(dia.fecha)}</p>
                    <p className="text-[11px] text-k-text3 mt-0.5">
                      {dia.regs.length} registros · {trabUnicos} trabajadores · {otmsUnicos} proyectos · {supsUnicos} supervisores
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-k-green">{totalHHDia.toFixed(1)} HH</div>
                      <div className="text-[9px] text-k-text3 uppercase">Total</div>
                    </div>
                    {expanded
                      ? <ChevronUp   size={14} className="text-k-text3" />
                      : <ChevronDown size={14} className="text-k-text3" />}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-k-border">
                    {Object.values(grupos)
                      .sort((a, b) => a.hora.localeCompare(b.hora))
                      .map((g, i) => (
                        <div key={i}
                          className="flex items-center gap-4 px-5 py-3 border-b border-k-border last:border-0 hover:bg-k-raised/30 transition-colors">
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Clock size={12} className="text-k-text3" />
                            <span className="font-mono text-xs text-k-text2">{g.hora}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-k-text truncate">
                              {supMap[g.supId] ?? g.supId}
                            </span>
                            <span className="text-k-text3 text-xs flex-shrink-0">→</span>
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
      )}
    </div>
  )
}