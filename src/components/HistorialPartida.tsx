// Historial de una partida grande: qué porciones ya se cerraron y cuánto queda.
//
// Es la pregunta de la reunión cuando una partida lleva meses avanzando de a
// pocos («¿qué áreas ya cerré?»). Trae TAMBIÉN las terminadas, que en la
// cuadrícula se ocultan justo para que no estorben.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { num } from '@/lib/lookahead'

interface FilaHist {
  id: number; padre_id: number | null; es_frente: boolean
  titulo: string; estado: string; fecha: string; fecha_fin: string
  metrado_prog: number | null; desglose_1: string | null; desglose_2: string | null
  hito_desc: string | null; responsable: string | null
  real: number; dias: Record<string, number>
}
interface Hist {
  codigo: string; descripcion: string; unidad?: string | null
  metrado_presup: number; programado: number; ejecutado: number
  saldo_por_programar: number; excedido: number
  filas: FilaHist[]
}

const SIN_AREA = 'Sin asignar'

export default function HistorialPartida({ partidaId, proyectoId, etiquetaD1, onClose }: {
  partidaId: number; proyectoId: number; etiquetaD1: string; onClose: () => void
}) {
  const [abierta, setAbierta] = useState<number | null>(null)
  const { data, isLoading } = useQuery<Hist>({
    queryKey: ['historial-partida', partidaId, proyectoId],
    queryFn: () => api(`/ev/programacion/historial-partida?partida_id=${partidaId}&proyecto_id=${proyectoId}`),
  })
  const und = data?.unidad || ''
  // Solo las sub-filas: el contenedor no tiene metrado propio, lo que muestra
  // es la suma de sus hijos y aquí repetiría las cifras.
  const filas = (data?.filas ?? []).filter(f => f.es_frente || !f.padre_id)
  const areas = new Map<string, FilaHist[]>()
  for (const f of filas) {
    const k = f.desglose_1 || SIN_AREA
    areas.set(k, [...(areas.get(k) ?? []), f])
  }
  const orden = [...areas.keys()].sort((a, b) =>
    a === SIN_AREA ? 1 : b === SIN_AREA ? -1 : a.localeCompare(b, 'es', { numeric: true }))

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-k-surface border border-k-border rounded-xl w-full max-w-3xl mt-10 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-k-text">Historial de la partida</h3>
            {data && (
              <p className="text-[11px] text-k-text3 mt-0.5 font-mono">
                {data.codigo} — {data.descripcion}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text text-lg leading-none">✕</button>
        </div>

        {isLoading && <div className="text-[11px] text-k-text3 py-6 text-center">Cargando…</div>}

        {data && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['Presupuestado', data.metrado_presup, 'text-k-text'],
                ['Programado', data.programado, 'text-k-plan'],
                ['Ejecutado', data.ejecutado, 'text-k-green'],
                ['Por programar', data.saldo_por_programar, 'text-k-text2'],
              ].map(([t, v, c]) => (
                <div key={t as string} className="bg-k-raised border border-k-border rounded-lg p-2">
                  <div className="text-[9px] uppercase text-k-text3 font-bold">{t as string}</div>
                  <div className={`font-mono font-bold tabular-nums ${c as string}`}>
                    {num(v as number)} <span className="text-[9px] font-normal">{und}</span>
                  </div>
                </div>
              ))}
            </div>
            {data.excedido > 0 && (
              <div className="text-[11px] text-k-amber">
                Programado {num(data.excedido)} {und} por encima del presupuesto: mayor metrado por sustentar.
              </div>
            )}

            {filas.length === 0 && (
              <div className="text-[11px] text-k-text3 py-6 text-center">
                Esta partida todavía no se dividió en porciones.
              </div>
            )}

            {orden.map(area => {
              const fs = areas.get(area)!
              const met = fs.reduce((s, f) => s + (f.metrado_prog ?? 0), 0)
              const real = fs.reduce((s, f) => s + f.real, 0)
              return (
                <div key={area} className="border border-k-border rounded-lg overflow-hidden">
                  <div className="px-2 py-1.5 bg-k-raised flex items-center justify-between text-[11px]">
                    <b className="text-k-text">
                      {area === SIN_AREA ? area : `${etiquetaD1}: ${area}`}
                      <span className="text-k-text3 font-normal"> · {fs.length}</span>
                    </b>
                    <span className="font-mono tabular-nums text-k-text2">
                      {num(real)} / {num(met)} {und}
                    </span>
                  </div>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {fs.map(f => {
                        const pct = f.metrado_prog ? Math.round((f.real / f.metrado_prog) * 100) : null
                        const dias = Object.entries(f.dias).sort()
                        return (
                          <tr key={f.id} className="border-t border-k-border align-top">
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-k-text3">#{f.id}</span>
                                <span className="text-k-text">{f.titulo}</span>
                                {f.estado === 'EJECUTADO' && <span className="text-k-green text-[10px]">✓</span>}
                                {f.estado === 'CANCELADO' && <span className="text-k-text3 text-[10px]">anulada</span>}
                              </div>
                              <div className="text-[9px] text-k-text3">
                                {f.desglose_2 && <>{f.desglose_2} · </>}
                                {f.fecha} → {f.fecha_fin}
                                {f.responsable && <> · {f.responsable}</>}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">
                              <span className="text-k-green">{num(f.real)}</span>
                              <span className="text-k-text3"> / {num(f.metrado_prog ?? 0)}</span>
                              {pct != null && (
                                <div className={`text-[9px] ${pct >= 100 ? 'text-k-green' : 'text-k-text3'}`}>{pct}%</div>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right w-16">
                              {dias.length > 0 && (
                                <button onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                                  className="text-[10px] text-k-blue hover:underline">
                                  {abierta === f.id ? 'ocultar' : `${dias.length} día(s)`}
                                </button>
                              )}
                              {abierta === f.id && (
                                <div className="mt-1 text-[9px] font-mono text-k-text2 text-right space-y-0.5">
                                  {dias.map(([d, v]) => (
                                    <div key={d}>{d.slice(5)} · {num(v)}</div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
