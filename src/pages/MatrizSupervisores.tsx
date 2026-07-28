// ── Matriz de cumplimiento del reporte ───────────────────────
// Encargo de Jean (2026-07-28): «quiero ver por semanas qué fechas reportaron
// los supervisores y si solo reportaron HH, si subieron imágenes, si
// describieron sus actividades, si pusieron restricciones o si marcaron que no
// se hizo tal actividad».
//
// El estado diario ya decía si reportó o no. Esto dice QUÉ reportó: un parte con
// las horas y nada más no es lo mismo que uno con fotos, descripción y las
// trabas del día — y esa diferencia solo se ve puesta en cuadrícula, semana a
// semana. Misma lectura que la Matriz histórica, pero midiendo a quien reporta.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, Camera, FileText, AlertTriangle, XCircle, Download,
} from 'lucide-react'

import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'

interface Celda {
  hh: number; trab: number; partes: number
  fotos: number; desc: boolean; rest: number; nc: number
}
interface Fila {
  supervisor_id: string; nombre: string
  celdas: Record<string, Celda>
  tot: Celda & { dias: number }
}
interface Resp {
  desde: string; hasta: string
  fechas: string[]
  semanas: { lunes: string; n: number }[]
  filas: Fila[]
}

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS1 = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
const diaLetra = (f: string) => DIAS1[new Date(f + 'T12:00:00').getDay()]
const esFinde = (f: string) => [0, 6].includes(new Date(f + 'T12:00:00').getDay())
const num = (v: number) => (Math.round(v * 10) / 10).toString()

const RANGOS = [['4 semanas', 4], ['8 semanas', 8], ['12 semanas', 12]] as const

/** El total, columna por columna — las mismas que salen en el Excel. */
type Tot = Celda & { dias: number }
const TOT_COLS: { k: string; label: string; ayuda: string; color: string; valor: (t: Tot) => number }[] = [
  { k: 'hh', label: 'HH total', color: 'text-k-text font-bold',
    ayuda: 'Horas-hombre que tareó en el periodo', valor: t => t.hh },
  { k: 'dias', label: 'Días', color: 'text-k-text2',
    ayuda: 'Días con reporte (cualquier señal, no solo HH)', valor: t => t.dias },
  { k: 'fotos', label: 'Fotos', color: 'text-k-green',
    ayuda: 'Fotos subidas desde campo', valor: t => t.fotos },
  { k: 'rest', label: 'Restric.', color: 'text-k-alerta',
    ayuda: 'Restricciones que reportó', valor: t => t.rest },
  { k: 'nc', label: 'No se hizo', color: 'text-k-red',
    ayuda: 'Actividades que marcó como no ejecutadas', valor: t => t.nc },
]

/** ¿La celda trae sustento, o son las horas peladas? */
const conSustento = (c: Celda) => c.desc || c.fotos > 0 || c.rest > 0 || c.nc > 0

export default function MatrizSupervisores() {
  const [semanas, setSemanas] = useState(4)
  const { desde, hasta } = useMemo(() => {
    const dom = lunesDe(new Date()); dom.setDate(dom.getDate() + 6)
    const lun = lunesDe(new Date()); lun.setDate(lun.getDate() - (semanas - 1) * 7)
    return { desde: iso(lun), hasta: iso(dom) }
  }, [semanas])

  const q = useQuery<Resp>({
    queryKey: ['matriz-sup', desde, hasta],
    queryFn: () => api(`/admin/supervisores/matriz?desde=${desde}&hasta=${hasta}`),
  })
  const d = q.data

  if (q.isError) return (
    <p className="text-xs text-k-text3 bg-k-surface border border-k-border rounded-xl px-4 py-3">
      Esta vista necesita el API actualizado. Haz el <b>Redeploy</b> en Coolify y recarga.
    </p>
  )

  const fechas = d?.fechas ?? []
  const filas = d?.filas ?? []
  // Referencia para el sombreado: la jornada más cargada del periodo.
  const maxHH = Math.max(1, ...filas.flatMap(f => Object.values(f.celdas).map(c => c.hh)))

  const exportar = () => {
    const cab = ['Supervisor', ...fechas.map(f => `${diaLetra(f)} ${f.slice(8, 10)}/${f.slice(5, 7)}`),
      'HH total', 'Días con reporte', 'Fotos', 'Restricciones', 'No se hizo']
    const linea = (v: string[]) => v.map(x => `"${x.replace(/"/g, '""')}"`).join(';')
    const cuerpo = filas.map(f => linea([
      f.nombre,
      ...fechas.map(fe => {
        const c = f.celdas[fe]
        if (!c) return ''
        // Mismo lenguaje que la cuadrícula, en texto: HH + qué acompañó.
        return [c.hh ? `${num(c.hh)} HH` : '', c.desc ? 'desc' : '',
          c.fotos ? `${c.fotos} foto${c.fotos !== 1 ? 's' : ''}` : '',
          c.rest ? `${c.rest} restr` : '', c.nc ? `${c.nc} no se hizo` : '']
          .filter(Boolean).join(' + ')
      }),
      num(f.tot.hh), String(f.tot.dias), String(f.tot.fotos),
      String(f.tot.rest), String(f.tot.nc),
    ]))
    // BOM para que Excel en Windows respete las tildes.
    const csv = '﻿' + [linea(cab), ...cuerpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `reporte-supervisores_${desde}_${hasta}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-k-text2 text-sm flex-1">
          Qué reportó cada supervisor, día por día
        </p>
        {q.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
        <select value={semanas} onChange={e => setSemanas(Number(e.target.value))}
          className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text2 outline-none focus:border-k-amber">
          {RANGOS.map(([l, n]) => <option key={n} value={n}>Últimas {l}</option>)}
        </select>
        <button onClick={exportar} disabled={!filas.length} className="btn btn-secundario btn-sm">
          <Download size={13} /> Exportar a Excel
        </button>
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px] w-max min-w-full">
            <thead>
              {/* Cabecera doble: la semana manda, el día es el detalle */}
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 bg-k-raised border border-k-border px-3 py-1.5 text-left text-[10px] font-bold uppercase text-k-text3 min-w-[190px]">
                  Supervisor
                </th>
                {(d?.semanas ?? []).map(s => (
                  <th key={s.lunes} colSpan={s.n}
                    className="border border-k-border bg-k-raised px-2 py-1 text-[10px] font-bold text-k-blue">
                    Sem. del {fmtDia(s.lunes)}
                  </th>
                ))}
                {/* El total desglosado, columna por columna — como sale en el
                    Excel. Amontonado en una sola celda no se podía comparar
                    una fila con otra. */}
                <th colSpan={TOT_COLS.length}
                  className="border border-k-border bg-k-raised px-2 py-1 text-[10px] font-bold uppercase text-k-text3">
                  Total del periodo
                </th>
              </tr>
              <tr>
                {fechas.map(f => (
                  <th key={f} className={`border border-k-border px-1 py-1 text-[9px] font-bold min-w-[42px] ${
                    esFinde(f) ? 'bg-k-void text-k-text3' : 'bg-k-raised text-k-text3'}`}>
                    {diaLetra(f)}<br /><span className="font-normal">{f.slice(8, 10)}</span>
                  </th>
                ))}
                {TOT_COLS.map(c => (
                  <th key={c.k} title={c.ayuda}
                    className="border border-k-border bg-k-raised px-2 py-1 text-[9px] font-bold uppercase text-k-text3 whitespace-nowrap cursor-help">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr><td colSpan={fechas.length + 1 + TOT_COLS.length} className="px-4 py-10 text-center text-k-text3">
                  <Loader2 size={15} className="animate-spin inline mr-2" />Armando la matriz…
                </td></tr>
              )}
              {!q.isLoading && filas.length === 0 && (
                <tr><td colSpan={fechas.length + 1 + TOT_COLS.length} className="px-4 py-10 text-center text-k-text3">
                  No hay supervisores activos.
                </td></tr>
              )}
              {filas.map(f => (
                <tr key={f.supervisor_id}>
                  <td className="sticky left-0 z-10 bg-k-surface border border-k-border px-3 py-1.5">
                    <span className="text-k-text">{f.nombre}</span>
                    <span className="block text-[9px] text-k-text3">
                      {f.tot.dias} día{f.tot.dias !== 1 ? 's' : ''} con reporte
                    </span>
                  </td>
                  {fechas.map(fe => <CeldaDia key={fe} c={f.celdas[fe]} maxHH={maxHH} finde={esFinde(fe)} />)}
                  {TOT_COLS.map(c => {
                    const v = c.valor(f.tot)
                    return (
                      <td key={c.k} className="border border-k-border px-2 py-1.5 text-right bg-k-raised/40">
                        <span className={`font-mono tabular-nums ${
                          v ? c.color : 'text-k-text3'}`}>{v ? num(v) : '0'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-k-border flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-k-text3">
          <span>El número grande son las <b className="text-k-text2">HH</b> del día (más oscuro, más carga).</span>
          <span className="flex items-center gap-1"><FileText size={11} className="text-k-blue" /> describió lo que hizo</span>
          <span className="flex items-center gap-1"><Camera size={11} className="text-k-green" /> subió fotos</span>
          <span className="flex items-center gap-1"><AlertTriangle size={11} className="text-k-alerta" /> reportó restricciones</span>
          <span className="flex items-center gap-1"><XCircle size={11} className="text-k-red" /> marcó «no se hizo»</span>
          <span>Celda vacía = ese día no mandó nada.</span>
        </div>
      </div>

      {filas.length > 0 && <Graficos filas={filas} semanas={d?.semanas ?? []} fechas={fechas} />}
    </div>
  )
}

// ── El historial de un vistazo ───────────────────────────────
// La cuadrícula responde «qué pasó tal día»; estas dos barras responden las
// preguntas que uno se hace al mirarla: ¿estamos reportando más o menos que
// antes?, ¿quién manda el parte completo y quién solo las horas?
function Graficos({ filas, semanas, fechas }: {
  filas: Fila[]; semanas: { lunes: string; n: number }[]; fechas: string[]
}) {
  // Días-supervisor con reporte por semana, separando los que traen sustento.
  const porSemana = useMemo(() => {
    const idx = new Map<string, string>()      // fecha → lunes de su semana
    let i = 0
    for (const s of semanas) { for (let k = 0; k < s.n; k++) idx.set(fechas[i++], s.lunes) }
    const acc = new Map<string, { full: number; solo: number }>()
    for (const s of semanas) acc.set(s.lunes, { full: 0, solo: 0 })
    for (const f of filas) {
      for (const [fecha, c] of Object.entries(f.celdas)) {
        const a = acc.get(idx.get(fecha) ?? '')
        if (!a) continue
        if (conSustento(c)) a.full++; else a.solo++
      }
    }
    return semanas.map(s => ({ lunes: s.lunes, ...acc.get(s.lunes)! }))
  }, [filas, semanas, fechas])

  const porSup = useMemo(() => filas.map(f => {
    const celdas = Object.values(f.celdas)
    const full = celdas.filter(conSustento).length
    return { nombre: f.nombre, full, solo: celdas.length - full, dias: celdas.length }
  }).sort((a, b) => b.dias - a.dias), [filas])

  const maxSem = Math.max(1, ...porSemana.map(s => s.full + s.solo))
  const maxSup = Math.max(1, ...porSup.map(s => s.dias))
  const totFull = porSup.reduce((s, x) => s + x.full, 0)
  const totDias = porSup.reduce((s, x) => s + x.dias, 0)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-k-surface border border-k-border rounded-xl p-4">
        <p className="text-xs font-bold text-k-text mb-1">
          Reportes por semana <span className="text-k-text3 font-normal">(días-supervisor)</span>
        </p>
        <p className="text-[10px] text-k-text3 mb-3">
          Si la barra baja, esa semana se reportó menos. Lo verde trae sustento
          —descripción, fotos o restricciones—; lo ámbar son las horas peladas.
        </p>
        <div className="flex items-end gap-2 h-32">
          {porSemana.map(s => {
            const alto = ((s.full + s.solo) / maxSem) * 100
            return (
              <div key={s.lunes} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-[10px] font-bold text-k-text tabular-nums">
                  {s.full + s.solo || ''}
                </span>
                <div className="w-full flex-1 flex flex-col justify-end">
                  <div className="w-full flex flex-col justify-end rounded-t overflow-hidden"
                    style={{ height: `${Math.max(alto, s.full + s.solo ? 3 : 0)}%` }}
                    title={`${s.full} con sustento · ${s.solo} solo HH`}>
                    <div className="bg-amber-500/60" style={{ flex: s.solo }} />
                    <div className="bg-green-500/70" style={{ flex: s.full }} />
                  </div>
                </div>
                <span className="text-[9px] text-k-text3 truncate w-full text-center">
                  {fmtDia(s.lunes)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl p-4">
        <p className="text-xs font-bold text-k-text mb-1">
          Días con reporte por supervisor
        </p>
        <p className="text-[10px] text-k-text3 mb-3">
          {totDias > 0
            ? <>{Math.round((totFull / totDias) * 100)}% de los partes del periodo llegaron con sustento.</>
            : 'Todavía nadie reportó en el periodo.'}
        </p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {porSup.map(s => (
            <div key={s.nombre} className="flex items-center gap-2">
              <span className="text-[10px] text-k-text2 w-36 flex-shrink-0 truncate" title={s.nombre}>
                {s.nombre}
              </span>
              <div className="flex-1 h-3.5 bg-k-raised rounded overflow-hidden flex">
                <div className="bg-green-500/70" style={{ width: `${(s.full / maxSup) * 100}%` }}
                  title={`${s.full} con sustento`} />
                <div className="bg-amber-500/60" style={{ width: `${(s.solo / maxSup) * 100}%` }}
                  title={`${s.solo} solo HH`} />
              </div>
              <span className={`text-[11px] font-bold w-6 text-right tabular-nums ${
                s.dias ? 'text-k-text' : 'text-k-text3'}`}>{s.dias}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CeldaDia({ c, maxHH, finde }: { c?: Celda; maxHH: number; finde: boolean }) {
  if (!c) {
    // Vacío es vacío: pintar un cero haría creer que alguien registró algo.
    return <td className={`border border-k-border/60 ${finde ? 'bg-k-void/40' : ''}`} />
  }
  const carga = Math.min(1, c.hh / maxHH)
  return (
    <td className="border border-k-border/60 px-0.5 py-0.5 text-center align-top"
      style={c.hh ? { background: `rgba(245,158,11,${(0.08 + carga * 0.22).toFixed(3)})` } : undefined}
      title={[c.hh ? `${num(c.hh)} HH · ${c.trab} trabajador${c.trab !== 1 ? 'es' : ''}` : 'Sin tareo',
        c.desc ? 'Describió lo realizado' : '',
        c.fotos ? `${c.fotos} foto${c.fotos !== 1 ? 's' : ''}` : '',
        c.rest ? `${c.rest} restricción${c.rest !== 1 ? 'es' : ''}` : '',
        c.nc ? `${c.nc} actividad${c.nc !== 1 ? 'es' : ''} marcada${c.nc !== 1 ? 's' : ''} como no hecha` : '',
      ].filter(Boolean).join(' · ')}>
      <div className={`font-mono tabular-nums ${c.hh ? 'text-k-text' : 'text-k-text3'}`}>
        {c.hh ? num(c.hh) : '·'}
      </div>
      <div className="flex items-center justify-center gap-px leading-none h-3">
        {c.desc && <FileText size={9} className="text-k-blue" />}
        {c.fotos > 0 && <Camera size={9} className="text-k-green" />}
        {c.rest > 0 && <AlertTriangle size={9} className="text-k-alerta" />}
        {c.nc > 0 && <XCircle size={9} className="text-k-red" />}
      </div>
    </td>
  )
}
