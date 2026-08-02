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
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, ShieldCheck, Repeat, Clock } from 'lucide-react'

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
interface Vencida {
  id: number; tipo: string; responsable: string; descripcion: string
  actividad: string | null; actividad_id: number; fecha_requerida: string; dias: number
}
interface Libro {
  total: Celda; por_tipo: FilaTipo[]; por_responsable: FilaResp[]
  reincidencia: FilaCruce[]; vencidas: Vencida[]; n_minimo: number; hoy: string
}

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
      {d && d.total.n === 0 && (
        <p className="text-sm text-k-text3 border border-k-border rounded-xl px-4 py-6 text-center">
          Todavía no hay restricciones registradas en este rango. Este cuadro se llena solo
          a medida que el planner las anota y las libera.
        </p>
      )}

      {d && d.total.n > 0 && (
        <>
          {/* Resumen */}
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

          {/* Vencidas: lo accionable de hoy, antes que cualquier estadística */}
          {!!d.vencidas.length && (
            <section className="rounded-xl border border-k-red/30 bg-k-red/5 p-3">
              <h3 className="text-xs font-bold text-k-red flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} /> {d.vencidas.length} restricciones pasadas de fecha y sin liberar
              </h3>
              <div className="space-y-1">
                {d.vencidas.slice(0, 8).map(v => (
                  <div key={v.id} className="flex items-baseline gap-2 text-[11px]">
                    <b className="text-k-red w-14 flex-shrink-0">{v.dias} d</b>
                    <span className="text-k-text2 flex-1 min-w-0 truncate">
                      {v.descripcion} <span className="text-k-text3">· {etiquetaTipo(v.tipo)} · {v.responsable}</span>
                    </span>
                    <span className="text-k-text3 truncate max-w-[180px]">{v.actividad}</span>
                  </div>
                ))}
                {d.vencidas.length > 8 && (
                  <p className="text-[10px] text-k-text3">…y {d.vencidas.length - 8} más.</p>
                )}
              </div>
            </section>
          )}

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
