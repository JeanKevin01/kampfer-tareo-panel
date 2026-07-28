// ── Cierre de la semana: el PPC que ya no se mueve ───────────
// El PPC se calculaba siempre sobre el plan VIGENTE, así que el pasado
// cambiaba: mover una actividad que no se hizo borraba su compromiso de la
// semana cerrada y el indicador subía solo. Cerrar la semana congela el
// veredicto de cada actividad — a partir de ahí, reprogramar ya no reescribe
// la historia.
//
// Es también la reunión semanal del Last Planner: se revisa lo comprometido,
// se le pone causa a lo que no salió (eso alimenta el Pareto) y se cierra.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, LockOpen, ChevronLeft, ChevronRight } from 'lucide-react'

import { api } from '@/lib/api'
import { fmtDia } from '@/lib/lookahead'
import { lunesDe, iso } from '@/lib/semana'

interface ActCierre {
  actividad_id: number
  titulo: string
  supervisor_nombre?: string | null
  comprometido: number
  alcanzado: number
  cumplida: boolean
  no_planificada: boolean
  causa_cat?: string | null
  causa?: string | null
}
interface Cierre {
  cerrada: boolean
  lunes: string
  corte?: string
  hasta: string
  parcial: boolean
  puede_cerrarse?: boolean
  comprometidas: number
  cumplidas: number
  no_cumplidas: number
  no_planificadas: number
  ppc: number | null
  actividades: ActCierre[]
  cnc_catalogo: Record<string, string>
  cierre_dia?: number
  cierre_semana_siguiente?: boolean
  cerrado_en?: string
  cerrado_por?: string | null
}
type Ajuste = { cumplida?: boolean; no_planificada?: boolean; causa_cat?: string; causa?: string }

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-xs text-k-text outline-none focus:border-k-amber'

export default function CierreSemana({ proyectoId = 1 }: { proyectoId?: number }) {
  const qc = useQueryClient()
  // Arranca en la semana PASADA: es la que toca cerrar.
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date(Date.now() - 7 * 864e5))))
  const [ajustes, setAjustes] = useState<Record<number, Ajuste>>({})
  const [err, setErr] = useState('')
  const [verConfig, setVerConfig] = useState(false)

  const q = useQuery<Cierre>({
    queryKey: ['cierre-semana', lunes, proyectoId],
    queryFn: () => api(`/ev/programacion/cierre-semana?lunes=${lunes}&proyecto_id=${proyectoId}`),
  })
  const d = q.data
  const irA = (delta: number) => {
    const f = new Date(lunes + 'T12:00:00')
    f.setDate(f.getDate() + delta * 7)
    setLunes(iso(lunesDe(f))); setAjustes({}); setErr('')
  }
  const refrescar = () => {
    setAjustes({}); setErr('')
    qc.invalidateQueries({ queryKey: ['cierre-semana'] })
    qc.invalidateQueries({ queryKey: ['ppc'] })
  }
  const cerrar = useMutation({
    mutationFn: () => api('/ev/programacion/cierre-semana', {
      method: 'POST',
      body: JSON.stringify({
        lunes, proyecto_id: proyectoId,
        actividades: Object.entries(ajustes).map(([id, a]) => ({ actividad_id: Number(id), ...a })),
      }),
    }),
    onSuccess: refrescar,
    onError: (e: Error) => setErr(e.message),
  })
  const reabrir = useMutation({
    mutationFn: () => api(`/ev/programacion/cierre-semana?lunes=${lunes}&proyecto_id=${proyectoId}`,
      { method: 'DELETE' }),
    onSuccess: refrescar,
    onError: (e: Error) => setErr(e.message),
  })
  const guardarCfg = useMutation({
    mutationFn: (v: { cierre_dia: number; cierre_semana_siguiente: boolean }) =>
      api('/ev/programacion/cierre-config', {
        method: 'PUT', body: JSON.stringify({ ...v, proyecto_id: proyectoId }),
      }),
    onSuccess: refrescar,
    onError: (e: Error) => setErr(e.message),
  })

  // El endpoint llega con el API 0036. Si el servidor todavía no se redesplegó,
  // esto responde 404: mejor decirlo que dejar un bloque vacío sin explicación
  // (la lección del semáforo que marcaba todo en rojo por un campo ausente).
  if (q.isError) {
    return (
      <div className="bg-k-surface border border-k-border rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-k-text mb-1">Cierre de la semana</p>
        <p className="text-[11px] text-k-text3">
          Necesita el API actualizado (migración <b>0036</b>). Haz el <b>Redeploy</b> y
          <b> alembic upgrade head</b> en Coolify y recarga esta página.
        </p>
      </div>
    )
  }

  const efectiva = (a: ActCierre): ActCierre => ({ ...a, ...(ajustes[a.actividad_id] ?? {}) })
  const set = (id: number, patch: Ajuste) =>
    setAjustes(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))
  const filas = (d?.actividades ?? []).map(efectiva)
  const comprometidas = filas.filter(a => !a.no_planificada)
  const cumplidas = comprometidas.filter(a => a.cumplida).length
  const ppcVivo = comprometidas.length ? cumplidas / comprometidas.length : null
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const clr = (v: number | null) => (v == null ? 'text-k-text3'
    : v >= 0.75 ? 'text-k-green' : v >= 0.5 ? 'text-k-alerta' : 'text-k-red')
  // Sin causa no hay aprendizaje: el Pareto se alimenta de aquí.
  const sinCausa = comprometidas.filter(a => !a.cumplida && !a.causa_cat).length

  return (
    <div className="bg-k-surface border border-k-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-k-border flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => irA(-1)} className="p-1 rounded hover:bg-k-raised text-k-text3"
            title="Semana anterior"><ChevronLeft size={15} /></button>
          <span className="text-xs font-bold text-k-text tabular-nums">
            Semana del {fmtDia(lunes)}
          </span>
          <button onClick={() => irA(1)} className="p-1 rounded hover:bg-k-raised text-k-text3"
            title="Semana siguiente"><ChevronRight size={15} /></button>
        </div>
        {d?.cerrada ? (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
            bg-green-500/15 text-k-green border border-green-500/30">
            <Lock size={10} /> Cerrada
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
            bg-k-raised text-k-text3 border border-k-border">
            <LockOpen size={10} /> Abierta
          </span>
        )}
        {d?.parcial && (
          <span title="El corte cae antes de que la semana termine: el sábado y el domingo no se cuentan"
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-k-alerta
              border border-amber-500/30 cursor-help">
            Corte parcial
          </span>
        )}
        {q.isFetching && <Loader2 size={13} className="animate-spin text-k-text3" />}
        <button onClick={() => setVerConfig(v => !v)}
          className="ml-auto text-[11px] text-k-text3 hover:text-k-text underline">
          Día del corte: {DIAS[d?.cierre_dia ?? 7]}
          {d?.cierre_semana_siguiente ? ' (siguiente)' : ''}
        </button>
      </div>

      {verConfig && (
        <div className="px-4 py-3 border-b border-k-border bg-k-raised/40 space-y-2">
          <p className="text-[11px] text-k-text2">
            <b>Cuándo se corta el PPC.</b> No mueve la semana: la semana sigue siendo de lunes a
            domingo en todos los módulos. Solo dice cuándo se mira — si te piden el reporte el
            viernes en una obra que trabaja domingo, el corte queda marcado como <b>parcial</b>.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select className={inputCls} value={d?.cierre_dia ?? 7}
              onChange={e => guardarCfg.mutate({
                cierre_dia: Number(e.target.value),
                cierre_semana_siguiente: !!d?.cierre_semana_siguiente,
              })}>
              {DIAS.map((n, i) => i > 0 && <option key={i} value={i}>{n}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-k-text2">
              <input type="checkbox" checked={!!d?.cierre_semana_siguiente}
                onChange={e => guardarCfg.mutate({
                  cierre_dia: d?.cierre_dia ?? 7,
                  cierre_semana_siguiente: e.target.checked,
                })} />
              de la semana siguiente
            </label>
            {d?.corte && (
              <span className="text-[11px] text-k-text3">
                Esta semana se corta el <b className="text-k-text2">{fmtDia(d.corte)}</b>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className={`font-mono text-2xl font-medium ${clr(d?.cerrada ? d.ppc : ppcVivo)}`}>
              {pct(d?.cerrada ? (d.ppc ?? null) : ppcVivo)}
            </div>
            <div className="text-[10px] uppercase text-k-text3 tracking-wide">
              PPC {d?.cerrada ? 'congelado' : 'propuesto'}
            </div>
          </div>
          <div className="text-[11px] text-k-text2 leading-relaxed">
            <div>{cumplidas} de {comprometidas.length} comprometidas</div>
            {filas.some(a => a.no_planificada) && (
              <div className="text-k-alerta">
                {filas.filter(a => a.no_planificada).length} no planificadas (fuera del PPC)
              </div>
            )}
            {d?.hasta && <div className="text-k-text3">Contado hasta el {fmtDia(d.hasta)}</div>}
          </div>
          {!d?.cerrada && (
            <button onClick={() => cerrar.mutate()}
              disabled={cerrar.isPending || !d?.puede_cerrarse || !filas.length}
              title={!d?.puede_cerrarse ? `Todavía no llega el día del corte (${d?.corte ?? ''})`
                : sinCausa ? `${sinCausa} sin causa: se cerrarán como «Otros»` : undefined}
              className="ml-auto btn btn-primario disabled:opacity-40">
              {cerrar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Cerrar la semana
            </button>
          )}
          {d?.cerrada && (
            <button onClick={() => reabrir.mutate()} disabled={reabrir.isPending}
              title="Reabre para corregir. Al volver a cerrar se congela con los datos de ese momento."
              className="ml-auto btn btn-secundario">
              <LockOpen size={14} /> Reabrir
            </button>
          )}
        </div>

        {err && <p className="text-k-red text-xs">{err}</p>}
        {!d?.cerrada && sinCausa > 0 && (
          <p className="text-[11px] text-k-alerta">
            <b>{sinCausa}</b> sin causa. Ponérsela ahora es lo que hace útil el Pareto — después
            nadie se acuerda de por qué no salió.
          </p>
        )}

        {filas.length === 0 && !q.isLoading && (
          <p className="text-xs text-k-text3 py-4 text-center">
            Nada comprometido esa semana.
          </p>
        )}

        {filas.length > 0 && (
          <div className="border border-k-border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-k-raised text-k-text3">
                <tr>
                  <th className="text-left px-2 py-1.5 font-bold uppercase">Actividad</th>
                  <th className="text-right px-2 py-1.5 font-bold uppercase">Comprom.</th>
                  <th className="text-right px-2 py-1.5 font-bold uppercase">Hecho</th>
                  <th className="text-center px-2 py-1.5 font-bold uppercase">¿Cumplió?</th>
                  <th className="text-left px-2 py-1.5 font-bold uppercase">Causa si no</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(a => (
                  <tr key={a.actividad_id}
                    className={`border-t border-k-border ${a.no_planificada ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-2 py-1.5">
                      <div className="text-k-text leading-tight">{a.titulo}</div>
                      <div className="text-[10px] text-k-text3 flex items-center gap-1.5">
                        {a.supervisor_nombre ?? '—'}
                        {a.no_planificada && (
                          <button disabled={d?.cerrada}
                            onClick={() => set(a.actividad_id, { no_planificada: false })}
                            title="Entró después de comprometerse la semana, así que no cuenta en el PPC. Clic si sí estaba planificada."
                            className="text-k-alerta font-bold hover:underline disabled:no-underline">
                            no planificada ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-k-text2 tabular-nums">
                      {a.comprometido}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${
                      a.alcanzado >= a.comprometido ? 'text-k-green' : 'text-k-red'}`}>
                      {a.alcanzado}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={a.cumplida} disabled={d?.cerrada}
                        onChange={e => set(a.actividad_id, { cumplida: e.target.checked })}
                        title="El sistema lo propone por metrado; puedes corregirlo" />
                    </td>
                    <td className="px-2 py-1.5">
                      {a.cumplida ? <span className="text-k-text3">—</span> : (
                        <select className={`${inputCls} w-full`} disabled={d?.cerrada}
                          value={a.causa_cat ?? ''}
                          onChange={e => set(a.actividad_id, { causa_cat: e.target.value })}>
                          <option value="">¿Por qué no salió?</option>
                          {Object.entries(d?.cnc_catalogo ?? {}).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {d?.cerrada && d.cerrado_en && (
          <p className="text-[10px] text-k-text3">
            Congelada el {d.cerrado_en.slice(0, 10)}
            {d.cerrado_por ? ` por ${d.cerrado_por}` : ''} · reprogramar ya no la cambia.
          </p>
        )}
      </div>
    </div>
  )
}
