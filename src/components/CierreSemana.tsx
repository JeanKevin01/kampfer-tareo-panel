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

import HistorialSemana from '@/components/HistorialSemana'
import { api } from '@/lib/api'
import { fmtDia } from '@/lib/lookahead'
import { lunesDe, iso } from '@/lib/semana'

interface ActCierre {
  actividad_id: number
  titulo: string
  supervisor_nombre?: string | null
  unidad?: string | null
  comprometido: number
  alcanzado: number
  cumplida: boolean
  no_planificada: boolean
  causa_cat?: string | null
  causa?: string | null
  /** 0040 — por qué entró y a quién le quitó la cuadrilla. */
  no_plan_motivo?: string | null
  no_plan_desplaza_a?: number | null
  no_plan_desplaza_tit?: string | null
  /** Lo que el sistema propuso. Si difiere de `no_planificada`, alguien lo
   *  cambió al cerrar: con cerrado_por/cerrado_en queda quién y cuándo. */
  no_plan_auto?: boolean
  no_plan_editada?: boolean
  hh?: number
}
/** Lo que campo dejó escrito esa semana. Referencia para redactar, no dato del
 *  indicador: la causa que reportó el supervisor el día que no salió y las
 *  restricciones que anotó aunque el trabajo sí se hiciera. */
interface CampoRef {
  causa?: { cat?: string | null; detalle?: string | null } | null
  restricciones?: { cat: string; detalle: string; fecha: string }[]
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
  campo?: Record<string, CampoRef>
  cnc_catalogo: Record<string, string>
  cierre_dia?: number
  cierre_semana_siguiente?: boolean
  cerrado_en?: string
  cerrado_por?: string | null
  /** 0040 — de dónde sale la marca de «no planificada»: del compromiso
   *  congelado (exacto, no se discute) o de la fecha de creación (deducido). */
  compromiso?: 'congelado' | 'deducido'
  comprometido_en?: string | null
  /** 0041 — contra qué plan se está midiendo, y cuántas comprometidas ya no
   *  tienen metrado en el plan de hoy (las movieron o cancelaron después de
   *  prometerlas). El PPC ya no se mueve por eso, pero hay que verlo. */
  origen?: 'CERRADA' | 'COMPROMETIDO' | 'VIGENTE'
  reprogramadas?: number
  sin_clasificar?: number
  motivos?: Record<string, string>
  hh_total?: number
  hh_no_planificadas?: number
  hh_sin_actividad?: number
  ratio_no_planificado?: number | null
}
type Ajuste = { cumplida?: boolean; no_planificada?: boolean; causa_cat?: string; causa?: string
  no_plan_motivo?: string | null }

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-xs text-k-text outline-none focus:border-k-amber'

export default function CierreSemana({ proyectoId = 1, lunes, onLunes }: {
  proyectoId?: number
  /** La semana la manda el tab: el cierre y la evaluación semanal de abajo
   *  miran SIEMPRE la misma. Dos fechas distintas en la misma pantalla no son
   *  dos vistas, son una contradicción. */
  lunes: string
  onLunes: (lunes: string) => void
}) {
  const qc = useQueryClient()
  const [ajustes, setAjustes] = useState<Record<number, Ajuste>>({})
  const [err, setErr] = useState('')
  const [verConfig, setVerConfig] = useState(false)

  const q = useQuery<Cierre>({
    queryKey: ['cierre-semana', lunes, proyectoId],
    queryFn: () => api(`/ev/programacion/cierre-semana?lunes=${lunes}&proyecto_id=${proyectoId}`),
  })
  const d = q.data
  // Los ajustes sin guardar pertenecen a la semana que se estaba revisando: el
  // padre remonta este bloque con `key={lunes}` y se van con ella.
  const irA = (delta: number) => {
    const f = new Date(lunes + 'T12:00:00')
    f.setDate(f.getDate() + delta * 7)
    onLunes(iso(lunesDe(f)))
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
  // Congelar el compromiso al inicio de la semana. Reemplaza el proxy «nació
  // después del lunes», que marcaba como no planificado un plan acordado el
  // lunes y tecleado el martes, y permitía desmarcar al cerrar —convirtiendo la
  // omisión propia en compromiso cumplido— sin dejar rastro.
  const comprometer = useMutation({
    mutationFn: () => api('/ev/programacion/plan-semana', {
      method: 'POST',
      body: JSON.stringify({ lunes, proyecto_id: proyectoId }),
    }),
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
  // Y sin DETALLE el cliente no recibe explicación: en su reporte no va la
  // categoría («Falta de materiales» es para oficina), va este texto.
  const sinDetalle = comprometidas.filter(a => !a.cumplida && !(a.causa ?? '').trim()).length
  const campo = d?.campo ?? {}
  const und = (a: ActCierre) => (a.unidad ? ` ${a.unidad}` : '')

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
          {/* Indicador PAR del PPC: cuántas de las horas de la semana se fueron
              en trabajo que nadie comprometió. Va al lado y NO dentro — un PPC
              que incluyera esto premiaría improvisar. */}
          <div>
            <div className={`font-mono text-2xl font-medium ${
              d?.ratio_no_planificado == null ? 'text-k-text3'
                : d.ratio_no_planificado <= 0.15 ? 'text-k-green'
                  : d.ratio_no_planificado <= 0.30 ? 'text-k-alerta' : 'text-k-red'}`}>
              {d?.ratio_no_planificado == null ? '—'
                : `${Math.round(d.ratio_no_planificado * 100)}%`}
            </div>
            <div className="text-[10px] uppercase text-k-text3 tracking-wide"
              title={`${d?.hh_no_planificadas ?? 0} de ${d?.hh_total ?? 0} HH del tareo de la semana`}>
              HH no planificadas
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

        {/* De dónde sale la marca de «no planificada». Deducida por fecha de
            creación admite discusión —y se puede desmarcar al cerrar sin que
            nadie lo note—; congelada en la reunión, no. */}
        {!d?.cerrada && d?.compromiso === 'deducido' && (
          <div className="flex items-start gap-2 flex-wrap bg-k-raised/50 border border-k-border
            rounded-lg px-3 py-2">
            <p className="text-[11px] text-k-text2 flex-1 min-w-[220px] leading-relaxed">
              <b>Esta semana no está comprometida.</b> Lo «no planificado» se está deduciendo de
              la fecha en que se creó cada actividad, y eso marca de más un plan que se acordó el
              lunes y se tecleó el martes. Comprometer la semana congela el conjunto: desde ahí,
              lo que entre es no planificado sin nada que discutir.
            </p>
            <button onClick={() => comprometer.mutate()} disabled={comprometer.isPending || !filas.length}
              className="btn btn-secundario btn-sm disabled:opacity-40">
              {comprometer.isPending ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              Comprometer la semana
            </button>
          </div>
        )}
        {!d?.cerrada && d?.compromiso === 'congelado' && (
          <p className="text-[11px] text-k-green">
            Compromiso congelado{d.comprometido_en ? ` el ${fmtDia(d.comprometido_en.slice(0, 10))}` : ''}:
            lo que entró después no cuenta en el PPC, y no hace falta discutirlo.
            {' '}El metrado también quedó fijo, así que reprogramar ya no mueve este número.
          </p>
        )}
        {/* Comprometidas que hoy ya no están en el plan. Antes de 0041 esto era
            invisible PORQUE el indicador se limpiaba solo; ahora el número no se
            mueve y lo que queda es avisar de que alguien las movió. */}
        {!d?.cerrada && (d?.reprogramadas ?? 0) > 0 && (
          <p className="text-[11px] text-k-alerta leading-relaxed">
            <b>{d?.reprogramadas}</b> actividad(es) comprometida(s) ya no tienen metrado en el
            plan de esta semana: las movieron o las cancelaron después de prometerlas. Siguen
            contando en el PPC con lo que se comprometió — si de verdad no tocaban esta semana,
            la conversación es esa, no el número.
          </p>
        )}
        {!d?.cerrada && (d?.sin_clasificar ?? 0) > 0 && (
          <p className="text-[11px] text-k-alerta">
            <b>{d?.sin_clasificar}</b> no planificada(s) sin motivo. Clasificarlas es lo que
            separa la omisión del planner del imprevisto real — son dos problemas distintos con
            dos soluciones distintas.
          </p>
        )}
        {!d?.cerrada && sinCausa > 0 && (
          <p className="text-[11px] text-k-alerta">
            <b>{sinCausa}</b> sin categoría. Ponerla ahora es lo que hace útil el Pareto — después
            nadie se acuerda de por qué no salió.
          </p>
        )}
        {!d?.cerrada && sinDetalle > 0 && (
          <p className="text-[11px] text-k-text3">
            <b className="text-k-text2">{sinDetalle}</b> sin explicación escrita: saldrán en blanco
            en el reporte del cliente. La categoría no se le entrega — a él se le explica el caso.
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
                      <div className="text-[10px] text-k-text3 flex items-center gap-1.5 flex-wrap">
                        {a.supervisor_nombre ?? '—'}
                        {!!a.hh && <span className="font-mono" title="Horas del tareo en esta actividad">{a.hh} HH</span>}
                        {a.no_planificada && (
                          <button disabled={d?.cerrada}
                            onClick={() => set(a.actividad_id, { no_planificada: false })}
                            title="Entró después de comprometerse la semana, así que no cuenta en el PPC. Clic si sí estaba planificada."
                            className="text-k-alerta font-bold hover:underline disabled:no-underline">
                            no planificada ✕
                          </button>
                        )}
                        {/* El desmarque queda a la vista: un indicador que el
                            evaluado puede editar sin dejar huella no aguanta una
                            revisión. */}
                        {a.no_plan_editada && (
                          <span className="text-k-blue"
                            title={`El sistema la propuso como ${a.no_plan_auto ? 'NO planificada' : 'comprometida'} y se cambió al cerrar${d?.cerrado_por ? ` (${d.cerrado_por})` : ''}`}>
                            ✎ corregida al cerrar
                          </span>
                        )}
                        {a.no_plan_desplaza_tit && (
                          <span className="text-k-text3" title="Le quitó la cuadrilla a esta comprometida">
                            desplazó a «{a.no_plan_desplaza_tit}»
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-k-text2 tabular-nums">
                      {a.comprometido > 0 ? `${a.comprometido}${und(a)}` : '—'}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${
                      a.comprometido <= 0 ? 'text-k-text3'
                        : a.alcanzado >= a.comprometido ? 'text-k-green' : 'text-k-red'}`}>
                      {a.comprometido > 0 ? `${a.alcanzado}${und(a)}` : '—'}
                    </td>
                    {/* En una fila NO PLANIFICADA el «¿cumplió?» no significa
                        nada —está fuera del PPC—, así que ahí va lo que sí hace
                        falta: por qué entró. */}
                    <td className="px-2 py-1.5 text-center">
                      {a.no_planificada ? (
                        <select className={`${inputCls} w-full max-w-[190px] ${
                          a.no_plan_motivo ? '' : 'border-amber-500/50'}`}
                          disabled={d?.cerrada} value={a.no_plan_motivo ?? ''}
                          onChange={e => set(a.actividad_id,
                            { no_plan_motivo: e.target.value || null })}>
                          <option value="">¿Por qué entró?</option>
                          {Object.entries(d?.motivos ?? {}).map(([k, v]) =>
                            <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (
                        <input type="checkbox" checked={a.cumplida} disabled={d?.cerrada}
                          onChange={e => set(a.actividad_id, { cumplida: e.target.checked })}
                          title="El sistema lo propone por metrado; puedes corregirlo" />
                      )}
                    </td>
                    {/* La categoría es para el Pareto (contar lo que se repite);
                        el DETALLE es para el cliente, que no entiende «Falta de
                        materiales» a secas: quiere saber qué material, desde
                        cuándo y qué se hizo. Los dos, no uno u otro. */}
                    <td className="px-2 py-1.5">
                      {/* Lo que campo escribió va SIEMPRE, cumpla o no: si el
                          supervisor reportó una restricción, el planner tiene
                          que verla aquí y no ir a buscarla a otra pantalla. */}
                      <RefCampo r={campo[String(a.actividad_id)]} cnc={d?.cnc_catalogo ?? {}}
                        onUsar={d?.cerrada ? undefined : (cat, texto) => set(a.actividad_id, {
                          ...(cat && !a.causa_cat ? { causa_cat: cat } : {}),
                          causa: [a.causa, texto].filter(Boolean).join(' · '),
                        })} />
                      {a.cumplida ? <span className="text-k-text3">—</span> : d?.cerrada ? (
                        <div className="leading-tight">
                          <div className="text-k-text2">
                            {d.cnc_catalogo?.[a.causa_cat ?? ''] ?? a.causa_cat ?? '—'}
                          </div>
                          {a.causa && <div className="text-[10px] text-k-text3">{a.causa}</div>}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <select className={`${inputCls} w-full`}
                            value={a.causa_cat ?? ''}
                            onChange={e => set(a.actividad_id, { causa_cat: e.target.value })}>
                            <option value="">¿Por qué no salió? (interno)</option>
                            {Object.entries(d?.cnc_catalogo ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                          <input className={`${inputCls} w-full`} value={a.causa ?? ''}
                            placeholder="Explicación para el cliente: qué pasó exactamente…"
                            title="Esto es lo único que ve el cliente. La categoría queda para el Pareto de oficina."
                            onChange={e => set(a.actividad_id, { causa: e.target.value })} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filas.length > 0 && (
          <p className="text-[10px] text-k-text3 leading-relaxed">
            <b className="text-k-text2">Categoría</b> = para el Pareto de oficina (contar lo que se
            repite). <b className="text-k-text2">Explicación</b> = lo único que ve el cliente.
            Lo que está en ámbar es lo que reportaron desde campo: «usar» lo copia a la explicación
            para no reescribirlo.
          </p>
        )}

        {d?.cerrada && d.cerrado_en && (
          <p className="text-[10px] text-k-text3">
            Congelada el {d.cerrado_en.slice(0, 10)}
            {d.cerrado_por ? ` por ${d.cerrado_por}` : ''} · reprogramar ya no la cambia.
          </p>
        )}

        {/* Quién congeló qué y cuándo. Va al final porque no se consulta a
            diario — se consulta el día que alguien pregunta por un número. */}
        <HistorialSemana proyectoId={proyectoId} lunes={lunes} />
      </div>
    </div>
  )
}

// ── Lo que reportaron desde campo esa semana ─────────────────
// El supervisor ya escribió por qué no salió el trabajo o qué lo frenó. Que el
// planner tenga que ir a buscarlo a otra pantalla es cómo se acaba escribiendo
// «no se pudo avanzar» en el reporte del cliente.
function RefCampo({ r, cnc, onUsar }: {
  r?: CampoRef
  cnc: Record<string, string>
  /** Ausente = la semana está cerrada: se lee, no se copia. */
  onUsar?: (cat: string | null, texto: string) => void
}) {
  if (!r) return null
  const et = (c?: string | null) => (c ? cnc[c] ?? c : '')
  const lineas: string[] = []
  if (r.causa?.detalle || r.causa?.cat) {
    const c = et(r.causa.cat)
    lineas.push(r.causa.detalle ? `${r.causa.detalle}${c ? ` (${c})` : ''}` : c)
  }
  for (const x of r.restricciones ?? []) {
    const c = et(x.cat)
    lineas.push(`${x.detalle || c}${x.detalle && c ? ` (${c})` : ''} · ${fmtDia(x.fecha)}`)
  }
  if (!lineas.length) return null
  // Para copiar va solo el texto de campo, no las etiquetas ni las fechas: la
  // explicación del cliente se redacta, no se pega en jerga interna.
  const texto = [r.causa?.detalle, ...(r.restricciones ?? []).map(x => x.detalle)]
    .map(t => (t ?? '').trim()).filter(Boolean).join(' · ')

  return (
    <div className="mb-1 text-[10px] text-k-alerta/90 leading-tight">
      {lineas.map((l, i) => <div key={i}>⚠ {l}</div>)}
      {onUsar && texto && (
        <button onClick={() => onUsar(r.causa?.cat ?? null, texto)}
          title="Copia lo que escribió campo a la explicación del cliente"
          className="text-k-text3 hover:text-k-amber underline">usar</button>
      )}
    </div>
  )
}
