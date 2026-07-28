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
                <th rowSpan={2} className="border border-k-border bg-k-raised px-2 py-1.5 text-[10px] font-bold uppercase text-k-text3">
                  Total
                </th>
              </tr>
              <tr>
                {fechas.map(f => (
                  <th key={f} className={`border border-k-border px-1 py-1 text-[9px] font-bold min-w-[42px] ${
                    esFinde(f) ? 'bg-k-void text-k-text3' : 'bg-k-raised text-k-text3'}`}>
                    {diaLetra(f)}<br /><span className="font-normal">{f.slice(8, 10)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr><td colSpan={fechas.length + 2} className="px-4 py-10 text-center text-k-text3">
                  <Loader2 size={15} className="animate-spin inline mr-2" />Armando la matriz…
                </td></tr>
              )}
              {!q.isLoading && filas.length === 0 && (
                <tr><td colSpan={fechas.length + 2} className="px-4 py-10 text-center text-k-text3">
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
                  <td className="border border-k-border px-2 py-1.5 text-right bg-k-raised/40">
                    <div className="font-mono font-bold text-k-text tabular-nums">{num(f.tot.hh)}</div>
                    <div className="text-[9px] text-k-text3 whitespace-nowrap">
                      {f.tot.fotos > 0 && <>📷 {f.tot.fotos} </>}
                      {f.tot.rest > 0 && <>⚠ {f.tot.rest} </>}
                      {f.tot.nc > 0 && <>✕ {f.tot.nc}</>}
                    </div>
                  </td>
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
