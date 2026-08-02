// ── Libro mayor de fiabilidad de restricciones ───────────────
// Encargo de Jean (2026-08-02). Responde a «¿quién tarda y en qué?» con lo que
// el sistema ya sabe: `liberada_el − fecha_requerida` por responsable y tipo.
//
// LO QUE NO HACE, A PROPÓSITO
// No devuelve «22 % de probabilidad de cumplir». Un porcentaje de dos dígitos
// calculado sobre tres observaciones es falsa precisión, y en cuanto falla dos
// veces el planner deja de mirar el indicador — se pierde también lo que sí
// servía. Aquí va la evidencia cruda con el `n` SIEMPRE al lado: quien lee
// decide cuánto peso darle.
//
// LO QUE SÍ SIRVE DESDE LA PRIMERA SEMANA
// La reincidencia. «Tercera vez este trimestre con la misma causa y el mismo
// responsable» es un conteo, no una distribución: no necesita historia para
// significar algo, y es la frase que mueve a alguien a actuar.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, ShieldCheck, Repeat, Clock, ListChecks } from 'lucide-react'

import { api } from '@/lib/api'
import { TIPOS_RESTRICCION } from '@/lib/catalogos'

interface Celda {
  n: number; n_liberadas: number; n_pendientes: number; n_vencidas: number
  n_medidas: number; n_derivadas: number
  mediana_dias: number | null; p75_dias: number | null; peor_dias: number | null
  pct_a_tiempo: number | null; suficiente: boolean
}
interface FilaTipo extends Celda { tipo: string }
interface FilaResp extends Celda { responsable_id: number | null; responsable: string }
interface FilaCruce extends Celda { tipo: string; responsable: string }
interface Libro {
  total: Celda; por_tipo: FilaTipo[]; por_responsable: FilaResp[]
  reincidencia: FilaCruce[]; n_minimo: number; hoy: string
}
interface Pendiente {
  id: number; descripcion: string; tipo: string
  responsable_id: number | null; responsable: string
  fecha_requerida: string | null; dias: number | null
  actividad_id: number; actividad: string | null; actividad_fecha: string | null
  estado: string; otm_id: string | null
}
interface Bandeja { hoy: string; pendientes: Pendiente[] }

const etiquetaTipo = (t: string) => TIPOS_RESTRICCION[t] ?? t
const dias = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v} d`

export default function Fiabilidad() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const q = useQuery<Libro>({
    queryKey: ['fiabilidad', desde, hasta],
    queryFn: () => api(`/ev/fiabilidad/restricciones?desde=${desde}&hasta=${hasta}`),
  })
  const d = q.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-k-text flex items-center gap-2">
            <ShieldCheck size={15} className="text-k-blue" /> Fiabilidad de restricciones
          </h2>
          <p className="text-xs text-k-text2">
            Cuánto tarda de verdad cada responsable en liberar, y qué se repite.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            title="Restricciones creadas desde"
            className="bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-xs text-k-text2 outline-none" />
          <span className="text-k-text3 text-xs">→</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-xs text-k-text2 outline-none" />
          {q.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
        </div>
      </div>

      {q.isError && <p className="text-k-red text-sm">{(q.error as Error).message}</p>}

      {d && d.total.n > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tarjeta label="Restricciones" valor={d.total.n} />
          <Tarjeta label="Pendientes" valor={d.total.n_pendientes}
            color={d.total.n_pendientes ? 'text-k-alerta' : 'text-k-text'} />
          <Tarjeta label="Vencidas" valor={d.total.n_vencidas}
            color={d.total.n_vencidas ? 'text-k-red' : 'text-k-green'} />
          <Tarjeta label="Liberadas a tiempo"
            valor={d.total.pct_a_tiempo == null ? '—' : `${d.total.pct_a_tiempo}%`}
            pie={`${d.total.n_medidas} medidas`} />
        </div>
      )}

      {/* La bandeja NO se filtra por el rango de fechas de arriba: ese rango
          acota el análisis del pasado, y una restricción abierta hay que verla
          aunque se haya creado fuera de la ventana que se está mirando. */}
      <BandejaLiberacion />

      {d && d.total.n === 0 && (
        <p className="text-sm text-k-text3 border border-k-border rounded-xl px-4 py-6 text-center">
          Todavía no hay restricciones registradas en este rango. Este cuadro se llena solo
          a medida que el planner las anota y las libera.
        </p>
      )}

      {d && d.total.n > 0 && (
        <>
          {/* Reincidencia */}
          {!!d.reincidencia.length && (
            <section>
              <h3 className="text-xs font-bold text-k-text2 flex items-center gap-1.5 mb-2">
                <Repeat size={13} className="text-k-amber" /> Lo que se repite
              </h3>
              <div className="space-y-1">
                {d.reincidencia.slice(0, 10).map(c => (
                  <div key={`${c.tipo}|${c.responsable}`}
                    className="flex items-center gap-2 text-[11px] rounded-lg border border-k-border px-2.5 py-1.5">
                    <b className="text-k-amber w-8 text-right">{c.n}×</b>
                    <span className="text-k-text">{etiquetaTipo(c.tipo)}</span>
                    <span className="text-k-text3">·</span>
                    <span className="text-k-text2">{c.responsable}</span>
                    {c.mediana_dias != null && (
                      <span className="ml-auto text-k-text3">
                        mediana <b className={c.mediana_dias > 0 ? 'text-k-alerta' : 'text-k-green'}>{dias(c.mediana_dias)}</b>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Latencia por responsable y por tipo */}
          <div className="grid md:grid-cols-2 gap-4">
            <Tabla titulo="Por responsable" filas={d.por_responsable.map(r => ({
              clave: r.responsable, ...r }))} nMinimo={d.n_minimo} />
            <Tabla titulo="Por tipo de restricción" filas={d.por_tipo.map(t => ({
              clave: etiquetaTipo(t.tipo), ...t }))} nMinimo={d.n_minimo} />
          </div>

          <p className="text-[10px] text-k-text3 leading-relaxed">
            La latencia es <b>la fecha real de liberación menos la que pidió el planner</b>: positiva = tarde.
            El <b>n</b> va siempre al lado porque una mediana de dos observaciones no es una mediana —
            por debajo de {d.n_minimo} la fila se muestra atenuada. «Derivadas» son las que no tienen fecha real
            declarada y usan el día en que se marcaron en el sistema, que puede ser bastante posterior al hecho.
          </p>
        </>
      )}
    </div>
  )
}

// ── Bandeja de liberación ────────────────────────────────────
// La otra mitad del módulo: el libro mayor de arriba mide el pasado, esto
// resuelve el presente. El viernes el planner repasa lo que sigue restringido y
// declara, fila por fila, QUÉ DÍA se liberó de verdad — si el fierro llegó el
// martes, la latencia del responsable tiene que medir el martes y no el día en
// que hubo tiempo de limpiar la lista. Por eso la fecha por defecto es hoy pero
// cada fila la puede cambiar.
function BandejaLiberacion() {
  const qc = useQueryClient()
  const [fecha, setFecha] = useState('')
  const [porFila, setPorFila] = useState<Record<number, string>>({})
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [resp, setResp] = useState('')
  const [msg, setMsg] = useState('')

  const q = useQuery<Bandeja>({
    queryKey: ['fiab-pendientes'],
    queryFn: () => api('/ev/fiabilidad/pendientes'),
  })

  const hoy = q.data?.hoy ?? ''
  // La fecha de referencia sale del API (hora de Lima) y no del navegador: el
  // `new Date()` del cliente se equivoca de día por poco cerca de medianoche.
  const fechaUso = fecha || hoy
  const todas = q.data?.pendientes ?? []
  const claveResp = (p: Pendiente) => p.responsable_id == null ? 'sin' : String(p.responsable_id)
  const lista = resp ? todas.filter(p => claveResp(p) === resp) : todas
  const areas = [...new Map(todas.map(p => [claveResp(p), p.responsable])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
  const nVencidas = lista.filter(p => (p.dias ?? -1) > 0).length

  const liberar = useMutation({
    mutationFn: (items: { id: number; liberada_el: string }[]) =>
      api<{ liberadas: number[]; omitidas: number[] }>('/ev/fiabilidad/liberar', {
        method: 'POST', body: JSON.stringify({ items }),
      }),
    onSuccess: r => {
      setSel(new Set()); setPorFila({})
      setMsg(`${r.liberadas.length} liberada(s)`
        + (r.omitidas.length ? ` · ${r.omitidas.length} ya lo estaba(n)` : ''))
      // La liberación cambia el conteo de restricciones pendientes que pintan el
      // Lookahead y el plan semanal, no solo esta pantalla.
      for (const k of ['fiab-pendientes', 'fiabilidad', 'programacion', 'lookahead',
        'lookahead-grid', 'restricciones', 'ppc'])
        qc.invalidateQueries({ queryKey: [k] })
    },
    onError: e => setMsg((e as Error).message),
  })

  const fechaDe = (p: Pendiente) => porFila[p.id] ?? fechaUso
  const marcar = (id: number) => setSel(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const todosMarcados = lista.length > 0 && lista.every(p => sel.has(p.id))

  const plazo = (v: number | null) => {
    if (v == null) return <span className="text-k-text3">sin fecha</span>
    if (v > 0) return <b className="text-k-red">+{v} d</b>
    if (v === 0) return <b className="text-k-alerta">hoy</b>
    return <span className="text-k-text3">en {-v} d</span>
  }

  if (q.isLoading) return <p className="text-xs text-k-text3">Cargando pendientes…</p>
  if (q.isError) return <p className="text-k-red text-sm">{(q.error as Error).message}</p>
  if (!todas.length) return (
    <p className="text-xs text-k-green border border-k-green/30 bg-k-green/5 rounded-xl px-4 py-3">
      No queda ninguna restricción abierta.
    </p>
  )

  return (
    <section className="rounded-xl border border-k-border overflow-hidden">
      <header className="flex items-center gap-2 flex-wrap px-3 py-2 bg-k-raised border-b border-k-border">
        <h3 className="text-xs font-bold text-k-text flex items-center gap-1.5">
          <ListChecks size={13} className="text-k-amber" /> Pendientes por liberar
          <span className="font-normal text-k-text3">
            {lista.length}
            {nVencidas > 0 && <span className="text-k-red font-bold"> · {nVencidas} vencidas</span>}
          </span>
        </h3>
        <div className="ml-auto flex items-center gap-2">
          {areas.length > 1 && (
            <select value={resp} onChange={e => setResp(e.target.value)}
              className="bg-k-surface border border-k-border rounded-lg px-2 py-1.5 text-[11px] text-k-text2 outline-none">
              <option value="">Todos los responsables</option>
              {areas.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          )}
          <label className="text-[11px] text-k-text3">Se liberó el</label>
          <input type="date" value={fechaUso} max={hoy} onChange={e => setFecha(e.target.value)}
            title="Fecha que se aplica a las filas que no tengan una propia"
            className="bg-k-surface border border-k-border rounded-lg px-2 py-1.5 text-[11px] text-k-text outline-none" />
          <button className="btn btn-primario btn-sm" disabled={!sel.size || liberar.isPending}
            onClick={() => liberar.mutate(lista.filter(p => sel.has(p.id))
              .map(p => ({ id: p.id, liberada_el: fechaDe(p) })))}>
            {liberar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Liberar{sel.size ? ` ${sel.size}` : ''}
          </button>
        </div>
      </header>

      {msg && <p className="px-3 py-1.5 text-[11px] text-k-text2 bg-k-amber/5">{msg}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
              <th className="px-2 py-1.5 w-8">
                <input type="checkbox" checked={todosMarcados} aria-label="Marcar todas"
                  onChange={() => setSel(todosMarcados ? new Set() : new Set(lista.map(p => p.id)))} />
              </th>
              <th className="text-left px-1 py-1.5 w-16">Plazo</th>
              <th className="text-left px-2 py-1.5">Restricción</th>
              <th className="text-left px-2 py-1.5">Actividad</th>
              <th className="px-2 py-1.5 w-36">Se liberó el</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lista.map(p => (
              <tr key={p.id}
                className={`border-b border-k-border/40 last:border-0 ${sel.has(p.id) ? 'bg-k-amber/5' : ''}`}>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => marcar(p.id)}
                    aria-label={`Marcar ${p.descripcion}`} />
                </td>
                <td className="px-1 py-1.5 whitespace-nowrap">{plazo(p.dias)}</td>
                <td className="px-2 py-1.5">
                  <div className="text-k-text truncate max-w-[340px]">{p.descripcion}</div>
                  <div className="text-k-text3">{etiquetaTipo(p.tipo)} · {p.responsable}</div>
                </td>
                <td className="px-2 py-1.5 text-k-text3">
                  <div className="truncate max-w-[200px]">{p.actividad}</div>
                  {p.estado === 'CANCELADO' && <span className="text-k-red">actividad cancelada</span>}
                </td>
                <td className="px-2 py-1.5">
                  <input type="date" value={fechaDe(p)} max={hoy}
                    onChange={e => setPorFila(f => ({ ...f, [p.id]: e.target.value }))}
                    className="bg-k-surface border border-k-border rounded-lg px-1.5 py-1 text-[11px] text-k-text outline-none focus:border-k-amber w-full" />
                </td>
                <td className="px-1 py-1.5">
                  <button className="btn btn-terciario btn-sm" disabled={liberar.isPending}
                    title="Liberar solo esta, con la fecha de su fila"
                    onClick={() => liberar.mutate([{ id: p.id, liberada_el: fechaDe(p) }])}>
                    <Check size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-3 py-2 text-[10px] text-k-text3 border-t border-k-border">
        La fecha de cada fila es la <b>real</b> de liberación, no la de hoy: es la que mide la
        latencia del responsable. No se aceptan fechas futuras. Marca varias y libéralas de una
        sola vez, o usa el ✓ de la fila para una sola.
      </p>
    </section>
  )
}

function Tarjeta({ label, valor, pie, color = 'text-k-text' }: {
  label: string; valor: number | string; pie?: string; color?: string
}) {
  return (
    <div className="bg-k-surface border border-k-border rounded-xl p-3">
      <div className={`font-mono text-xl font-medium ${color}`}>{valor}</div>
      <div className="text-[10px] text-k-text3 uppercase tracking-wide">{label}</div>
      {pie && <div className="text-[10px] text-k-text3 mt-0.5">{pie}</div>}
    </div>
  )
}

function Tabla({ titulo, filas, nMinimo }: {
  filas: (Celda & { clave: string })[]; titulo: string; nMinimo: number
}) {
  return (
    <section>
      <h3 className="text-xs font-bold text-k-text2 flex items-center gap-1.5 mb-2">
        <Clock size={13} className="text-k-blue" /> {titulo}
      </h3>
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-k-raised text-[10px] uppercase text-k-text3">
              <th className="text-left px-2.5 py-1.5">{titulo.replace('Por ', '')}</th>
              <th className="px-1.5 py-1.5" title="Observaciones con latencia medible">n</th>
              <th className="px-1.5 py-1.5">Mediana</th>
              <th className="px-1.5 py-1.5">p75</th>
              <th className="px-1.5 py-1.5">Peor</th>
              <th className="px-1.5 py-1.5">Pend.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.clave}
                className={`border-b border-k-border/40 last:border-0 ${f.suficiente ? '' : 'opacity-55'}`}
                title={f.suficiente
                  ? `${f.n_medidas} liberaciones medidas${f.n_derivadas ? ` · ${f.n_derivadas} derivadas del sello de captura` : ''}`
                  : `Solo ${f.n_medidas} observación(es): por debajo de ${nMinimo} el dato es indicativo, no una referencia`}>
                <td className="px-2.5 py-1.5 text-k-text truncate max-w-[180px]">
                  {f.clave}
                  {/* «n» son las liberaciones MEDIDAS. Sin esto, un responsable
                      con restricciones abiertas y ninguna liberada aparecía con
                      n=0 y parecía que no tenía nada. */}
                  {f.n !== f.n_medidas && <span className="text-k-text3"> · {f.n} en total</span>}
                  {!f.suficiente && <span className="text-k-text3"> · pocos datos</span>}
                </td>
                <td className="px-1.5 py-1.5 text-center text-k-text3">{f.n_medidas}</td>
                <td className={`px-1.5 py-1.5 text-center font-bold ${
                  f.mediana_dias == null ? 'text-k-text3'
                    : f.mediana_dias > 0 ? 'text-k-alerta' : 'text-k-green'}`}>
                  {dias(f.mediana_dias)}
                </td>
                <td className="px-1.5 py-1.5 text-center text-k-text2">{dias(f.p75_dias)}</td>
                <td className="px-1.5 py-1.5 text-center text-k-text3">{dias(f.peor_dias)}</td>
                <td className={`px-1.5 py-1.5 text-center ${f.n_vencidas ? 'text-k-red font-bold' : 'text-k-text3'}`}>
                  {f.n_pendientes}{f.n_vencidas ? ` (${f.n_vencidas} vencidas)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
