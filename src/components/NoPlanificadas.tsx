// ── Bandeja de trabajo no planificado ────────────────────────
// El supervisor reporta desde campo una partida que el planner no programó, y
// ese parte —lo que se hizo, qué lo frenó, las fotos— se quedaba en el teléfono.
// Aquí llega a oficina para lo único que hace falta hacer con él: decir POR QUÉ
// entró y A QUIÉN le quitó la cuadrilla.
//
// Nada de esto toca el PPC: estas actividades siguen fuera, porque el PPC mide
// la confiabilidad de la promesa y nadie prometió esto. Lo que alimentan es el
// indicador de HH no planificadas y el Pareto de motivos — el par que muestra
// mejora de verdad, porque el PPC solo puede verse bien mientras la obra es un
// desorden.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react'

import { API_BASE, api } from '@/lib/api'
import { fmtDia } from '@/lib/lookahead'

interface Foto {
  id: number; url: string | null; url_thumb: string | null; purgada: boolean
}
interface Rep {
  id: number; fecha: string; turno?: string | null; frente?: string | null
  supervisor?: string | null
  anotaciones: string[]
  restricciones: { cat: string; detalle: string }[]
  texto: string
  fotos: Foto[]
}
interface ActNP {
  actividad_id: number
  titulo: string
  partida_codigo?: string | null
  supervisor_nombre?: string | null
  comprometido: number
  alcanzado: number
  unidad?: string | null
  hh: number
  no_plan_motivo?: string | null
  no_plan_desplaza_a?: number | null
  no_plan_desplaza_tit?: string | null
  pendiente: boolean
  sin_parte: boolean
  reportes: Rep[]
}
interface Resp {
  desde: string; hasta: string
  motivos: Record<string, string>
  improvisacion: string[]
  semanas: { lunes: string; hasta: string; cerrada: boolean
    candidatas: { actividad_id: number; titulo: string }[]
    actividades: number[] }[]
  actividades: ActNP[]
  pendientes: number
}

const mediaUrl = (u: string | null) => (u ? `${API_BASE}${u}` : '')
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-[11px] text-k-text outline-none focus:border-k-amber'

/** Color por motivo: ámbar el que indica defecto de planificación, azul el
 *  informativo, verde el adelanto (que NO es improvisación, es flexibilidad). */
const CLR_MOTIVO: Record<string, string> = {
  OMISION_PLANNER: 'text-k-alerta border-amber-500/40 bg-amber-500/10',
  EMERGENCIA: 'text-k-red border-red-500/40 bg-red-500/10',
  CLIENTE: 'text-k-blue border-blue-500/40 bg-blue-500/10',
  ADELANTO: 'text-k-green border-green-500/40 bg-green-500/10',
}

export default function NoPlanificadas({ proyectoId = 1, nSem, lunes }: {
  proyectoId?: number
  /** El mismo rango que los indicadores del tab: dos ventanas distintas en la
   *  misma pantalla no son dos vistas, son una contradicción. */
  nSem: number
  /** Lunes que se está mirando arriba, para poder acotar la bandeja a él. */
  lunes?: string
}) {
  const qc = useQueryClient()
  const [soloSemana, setSoloSemana] = useState(false)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const q = useQuery<Resp>({
    queryKey: ['no-planificadas', nSem, proyectoId],
    queryFn: () => api(`/ev/programacion/no-planificadas?proyecto_id=${proyectoId}&semanas=${nSem}`),
  })
  const clasificar = useMutation({
    mutationFn: (v: { id: number; motivo?: string | null; desplaza_a?: number | null }) =>
      api(`/ev/programacion/no-planificadas/${v.id}`, {
        method: 'PUT',
        body: JSON.stringify({ motivo: v.motivo ?? null, desplaza_a: v.desplaza_a ?? null }),
      }),
    onSuccess: () => {
      setErr('')
      qc.invalidateQueries({ queryKey: ['no-planificadas'] })
      qc.invalidateQueries({ queryKey: ['ppc'] })
      qc.invalidateQueries({ queryKey: ['cierre-semana'] })
    },
    onError: (e: Error) => setErr(e.message),
  })

  // Si el API todavía no se redesplegó esto responde 404: decirlo es mejor que
  // dejar un bloque vacío sin explicación.
  if (q.isError) {
    return (
      <div className="bg-k-surface border border-k-border rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-k-text mb-1">Trabajo no planificado</p>
        <p className="text-[11px] text-k-text3">
          Necesita el API actualizado (migración <b>0040</b>): <b>Redeploy</b> +
          <b> alembic upgrade head</b> en Coolify, y recarga.
        </p>
      </div>
    )
  }

  const d = q.data
  // El API ya devuelve qué actividad cae en qué semana, así que acotar es
  // filtrar en cliente: ni una consulta más ni un endpoint nuevo.
  const idsDeLaSemana = soloSemana && lunes
    ? new Set((d?.semanas ?? []).filter(s => s.lunes === lunes).flatMap(s => s.actividades))
    : null
  const actos = (d?.actividades ?? []).filter(a => !idsDeLaSemana || idsDeLaSemana.has(a.actividad_id))
  // A quién pudo desplazar: las comprometidas que NO cumplieron en la semana de
  // esta actividad. Es de donde salió la cuadrilla.
  const candidatasDe = (actId: number) => {
    const sem = (d?.semanas ?? []).find(s => s.actividades.includes(actId))
    return sem?.candidatas ?? []
  }

  return (
    <div className="bg-k-surface border border-k-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-k-border flex-wrap">
        <AlertTriangle size={14} className="text-k-alerta flex-shrink-0" />
        <p className="text-xs font-bold text-k-text">Trabajo no planificado</p>
        {/* Esta bandeja NO sigue la navegación de semana de arriba (esa es del
            cierre): es un acumulado de las últimas N semanas, para clasificar de
            una vez todo lo pendiente. Como está justo debajo del navegador de
            semana, parecía roto — «cambio de semana y no cambia». Ahora lo dice,
            y se puede acotar a la semana que se está mirando. */}
        {!!d && (
          <span className="text-[10px] text-k-text3 font-mono">
            {soloSemana && lunes ? `solo la semana del ${fmtDia(lunes)}`
              : `${fmtDia(d.desde)} → ${fmtDia(d.hasta)} · acumulado`}
          </span>
        )}
        {!!lunes && (
          <label className="flex items-center gap-1.5 text-[10px] text-k-text2 cursor-pointer select-none"
            title="La bandeja junta varias semanas a propósito: clasificar de una vez sale más barato que ir semana por semana. Marca esto para ver solo la que tienes arriba.">
            <input type="checkbox" checked={soloSemana} className="accent-amber-500"
              onChange={e => setSoloSemana(e.target.checked)} />
            Solo la semana de arriba
          </label>
        )}
        {q.isFetching && <Loader2 size={13} className="animate-spin text-k-text3" />}
        {!!d?.pendientes && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full
            bg-amber-500/15 text-k-alerta border border-amber-500/30">
            {d.pendientes} sin clasificar
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-[11px] text-k-text2 leading-relaxed">
          Lo que entró sin estar comprometido. <b>No cuenta en el PPC</b> —nadie lo prometió—
          pero sí en las <b>HH no planificadas</b>. Clasificarlo es lo que convierte «3 no
          planificadas» en algo que se puede atacar: la omisión se corrige con mejor lookahead,
          el imprevisto con holgura, y el pedido del cliente es sustento del adicional.
        </p>
        {err && <p className="text-k-red text-xs">{err}</p>}

        {!actos.length && !q.isLoading && (
          <p className="text-xs text-k-text3 py-4 text-center">
            {soloSemana && (d?.actividades ?? []).length > 0
              ? <>Nada fuera del plan en esta semana — pero hay{' '}
                  <b className="text-k-text2">{(d?.actividades ?? []).length}</b> en el acumulado.
                  Desmarca «Solo la semana de arriba» para verlas.</>
              : 'Nada fuera del plan en este periodo.'}
          </p>
        )}

        {actos.map(a => {
          const cands = candidatasDe(a.actividad_id)
          const abierto = abierta === a.actividad_id
          const nFotos = a.reportes.reduce((s, r) => s + r.fotos.length, 0)
          return (
            <div key={a.actividad_id}
              className={`border rounded-lg overflow-hidden ${a.pendiente
                ? 'border-amber-500/40 bg-amber-500/5' : 'border-k-border'}`}>
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-xs font-bold text-k-text leading-tight">{a.titulo}</div>
                    <div className="text-[10px] text-k-text3 font-mono mt-0.5">
                      {a.partida_codigo ?? '—'}
                      {a.supervisor_nombre ? ` · ${a.supervisor_nombre}` : ''}
                      {a.reportes[0] ? ` · ${fmtDia(a.reportes[0].fecha)}` : ''}
                    </div>
                  </div>
                  {/* Las HH son el peso real: contar actividades hace pesar igual
                      una de 4 HH y una de 200. */}
                  <span title="Horas del tareo que se fueron en este trabajo"
                    className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full
                      bg-k-raised text-k-text2 border border-k-border cursor-help">
                    {a.hh.toLocaleString('es-PE')} HH
                  </span>
                  {!!nFotos && (
                    <span className="flex items-center gap-1 text-[10px] text-k-text3">
                      <Camera size={11} /> {nFotos}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select className={`${inputCls} ${a.no_plan_motivo
                    ? CLR_MOTIVO[a.no_plan_motivo] ?? '' : 'border-amber-500/50'}`}
                    value={a.no_plan_motivo ?? ''}
                    onChange={e => clasificar.mutate({
                      id: a.actividad_id, motivo: e.target.value || null,
                      desplaza_a: a.no_plan_desplaza_a ?? null,
                    })}>
                    <option value="">¿Por qué entró? (sin clasificar)</option>
                    {Object.entries(d?.motivos ?? {}).map(([k, v]) =>
                      <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className={inputCls} value={a.no_plan_desplaza_a ?? ''}
                    disabled={!cands.length}
                    title={cands.length
                      ? 'La comprometida a la que le quitó la cuadrilla. Sin este vínculo el Pareto dice «nos falta gente» cuando la verdad es «nos metieron trabajo que no estaba».'
                      : 'Esa semana no hubo comprometidas incumplidas a las que desplazar'}
                    onChange={e => clasificar.mutate({
                      id: a.actividad_id, motivo: a.no_plan_motivo ?? null,
                      desplaza_a: e.target.value ? Number(e.target.value) : null,
                    })}>
                    <option value="">¿Desplazó a alguna? (opcional)</option>
                    {cands.map(c =>
                      <option key={c.actividad_id} value={c.actividad_id}>{c.titulo}</option>)}
                  </select>
                  {a.no_plan_motivo && !d?.improvisacion.includes(a.no_plan_motivo) && (
                    <span className="text-[10px] text-k-green">
                      No cuenta como improvisación
                    </span>
                  )}
                </div>

                {a.sin_parte ? (
                  <p className="text-[11px] text-k-text3">
                    Sin parte de campo: solo se registraron horas. Aquí no hay nada que leer.
                  </p>
                ) : (
                  <button onClick={() => setAbierta(abierto ? null : a.actividad_id)}
                    className="text-[11px] text-k-blue hover:underline">
                    {abierto ? 'Ocultar' : 'Ver'} el parte de campo
                    {nFotos ? ` y sus ${nFotos} foto${nFotos !== 1 ? 's' : ''}` : ''}
                  </button>
                )}
              </div>

              {abierto && a.reportes.map(r => (
                <div key={r.id} className="px-3 py-3 border-t border-k-border bg-k-raised/40 space-y-2">
                  <div className="text-[10px] text-k-text3 font-mono">
                    {fmtDia(r.fecha)} · {r.turno ?? 'DIA'}
                    {r.frente ? ` · ${r.frente}` : ''} · {r.supervisor ?? '—'}
                  </div>
                  {/* El parte tal como el supervisor lo mandó al grupo: es la
                      materia prima con la que el planner redacta, en vez de
                      escribir «se atendió una urgencia» de memoria. */}
                  <pre className="text-[10.5px] font-mono leading-relaxed text-k-text2
                    whitespace-pre-wrap break-words bg-k-surface border border-k-border
                    rounded-lg p-2.5 max-h-64 overflow-y-auto">{r.texto}</pre>
                  {!!r.restricciones.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.restricciones.map((x, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full
                          bg-red-500/10 text-k-red border border-red-500/30">
                          {x.detalle || x.cat}
                        </span>
                      ))}
                    </div>
                  )}
                  {!!r.fotos.length && (
                    <div className="flex flex-wrap gap-2">
                      {r.fotos.map(f => (f.url_thumb ? (
                        <button key={f.id} onClick={() => setFoto(mediaUrl(f.url))}
                          title="Ver en grande">
                          <img src={mediaUrl(f.url_thumb)} alt="" loading="lazy"
                            className="w-20 h-20 object-cover rounded-lg border border-k-border
                              hover:border-k-amber transition-colors" />
                        </button>
                      ) : (
                        <span key={f.id} title="Foto purgada del disco (el reporte semanal ya se exportó)"
                          className="w-20 h-20 rounded-lg border border-dashed border-k-border
                            flex items-center justify-center text-[9px] text-k-text3">
                          purgada
                        </span>
                      )))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {foto && (
        <button onClick={() => setFoto(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6">
          <X size={22} className="absolute top-4 right-4 text-white/80" />
          <img src={foto} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  )
}
