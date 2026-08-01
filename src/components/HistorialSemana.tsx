// ── Bitácora de la semana: cuándo se congeló y quién lo hizo ─────────
// El PPC de una semana lo pueden mover cuatro actos: comprometer, deshacer el
// compromiso, cerrar y reabrir. Hasta 0041 ninguno dejaba rastro en BD —
// `prog_semana_plan` se pisaba a sí mismo con ON CONFLICT y reabrir borraba el
// cierre entero—, así que no había forma de responder «¿este 85% es el mismo
// que entregamos el lunes?». Esta lista es esa respuesta.
//
// Es de solo lectura y la tabla es append-only: no hay botón de borrar aquí ni
// endpoint que lo permita. Una bitácora editable no sustenta ningún indicador.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Lock, LockOpen, Unlock, CheckCircle2, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'

interface EventoDet {
  id?: number
  titulo?: string
  metrado?: number
  unidad?: string
  ppc_que_se_reabre?: number | null
  cumplidas?: number
  no_cumplidas?: number
  ajustes?: number
  backfill?: boolean
}
interface Evento {
  id: number
  lunes: string
  evento: 'COMPROMETIDA' | 'DESCOMPROMETIDA' | 'CERRADA' | 'REABIERTA'
  etiqueta: string
  actor?: string | null
  n_actividades: number
  metrado: number
  ppc: number | null
  nota?: string | null
  detalle?: EventoDet[] | EventoDet | null
  backfill?: boolean
  creado_en: string
}
interface Resumen {
  eventos: number
  veces_comprometida: number
  veces_cerrada: number
  reaperturas: number
  descompromisos: number
  ppc_primero: number | null
  ppc_ultimo: number | null
  ppc_cambio: number | null
}

const ICONO = {
  COMPROMETIDA: Lock,
  DESCOMPROMETIDA: Unlock,
  CERRADA: CheckCircle2,
  REABIERTA: LockOpen,
} as const
const COLOR = {
  COMPROMETIDA: 'text-k-blue',
  DESCOMPROMETIDA: 'text-k-alerta',
  CERRADA: 'text-k-green',
  REABIERTA: 'text-k-alerta',
} as const

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v * 100)}%`
/** Fecha Y hora: dos eventos del mismo día son lo habitual (comprometer por la
 *  mañana, corregir por la tarde) y sin la hora no se distinguen. */
const fmtMomento = (s: string) => {
  const f = new Date(s.replace(' ', 'T'))
  if (isNaN(f.getTime())) return s.slice(0, 16)
  return f.toLocaleString('es-PE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function HistorialSemana({ proyectoId = 1, lunes }: {
  proyectoId?: number
  lunes: string
}) {
  const [abierto, setAbierto] = useState(false)
  const q = useQuery<{ eventos: Evento[]; resumen: Resumen | null }>({
    queryKey: ['semana-historial', lunes, proyectoId],
    queryFn: () => api(`/ev/programacion/semana-historial?lunes=${lunes}&proyecto_id=${proyectoId}`),
    enabled: abierto,
  })
  const evs = q.data?.eventos ?? []
  const res = q.data?.resumen

  return (
    <div className="border-t border-k-border pt-2 mt-1">
      <button onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-k-text2 hover:text-k-text">
        <History size={13} />
        Historial de esta semana
        {abierto && q.isFetching && <Loader2 size={11} className="animate-spin" />}
      </button>

      {abierto && (
        <div className="mt-2 space-y-2">
          {q.isError && (
            <p className="text-[11px] text-k-text3">
              Necesita el API actualizado (migración <b>0041</b>).
            </p>
          )}
          {!q.isError && !q.isFetching && !evs.length && (
            <p className="text-[11px] text-k-text3">
              Sin movimientos registrados. La bitácora empieza a llenarse cuando se compromete o
              se cierra la semana.
            </p>
          )}

          {/* Lo que hay que ver primero: si el número que se publicó cambió. */}
          {res != null && res.ppc_cambio != null && (
            <p className="text-[11px] text-k-alerta leading-relaxed">
              <b>Esta semana se cerró {res.veces_cerrada} veces.</b> El PPC pasó
              de {pct(res.ppc_primero)} a {pct(res.ppc_ultimo)}
              {' '}({res.ppc_cambio > 0 ? '+' : ''}{Math.round(res.ppc_cambio * 100)} puntos).
              Si el primero ya se entregó, el reporte de hoy no dice lo mismo.
            </p>
          )}
          {res != null && res.descompromisos > 0 && (
            <p className="text-[11px] text-k-text2">
              El compromiso se deshizo {res.descompromisos} vez/veces antes de cerrar.
            </p>
          )}

          <ul className="space-y-1.5">
            {evs.map(e => {
              const Icono = ICONO[e.evento] ?? History
              const det = Array.isArray(e.detalle) ? null : e.detalle
              const acts = Array.isArray(e.detalle) ? e.detalle : []
              return (
                <li key={e.id} className="flex items-start gap-2 text-[11px]">
                  <Icono size={13} className={`${COLOR[e.evento] ?? 'text-k-text3'} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <div className="text-k-text">
                      <b>{e.etiqueta}</b>
                      <span className="text-k-text3"> · {fmtMomento(e.creado_en)}</span>
                      {e.actor && <span className="text-k-text2"> · {e.actor}</span>}
                      {e.ppc != null && (
                        <span className={COLOR[e.evento]}> · PPC {pct(e.ppc)}</span>
                      )}
                    </div>
                    <div className="text-k-text3">
                      {e.n_actividades} actividad(es)
                      {e.metrado > 0 && ` · ${e.metrado} de metrado comprometido`}
                      {det?.ajustes ? ` · ${det.ajustes} veredicto(s) corregido(s) a mano` : ''}
                      {/* Los eventos que la migración reconstruyó tienen fecha
                          real pero no el detalle por actividad: nunca se guardó. */}
                      {e.backfill && ' · registro reconstruido al instalar la bitácora'}
                    </div>
                    {e.nota && <div className="text-k-text2 italic">«{e.nota}»</div>}
                    {acts.length > 0 && (
                      <details className="mt-0.5">
                        <summary className="text-k-text3 cursor-pointer hover:text-k-text2">
                          ver lo que se comprometió
                        </summary>
                        <ul className="mt-1 ml-1 space-y-0.5 text-k-text2">
                          {acts.map((a, i) => (
                            <li key={a.id ?? i}>
                              {a.titulo}
                              {a.metrado ? ` — ${a.metrado}${a.unidad ? ` ${a.unidad}` : ''}` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
