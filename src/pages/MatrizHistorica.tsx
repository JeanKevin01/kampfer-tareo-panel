import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Loader2, Download, ChevronDown, ChevronRight, Grid3X3 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '@/lib/api'
import { iso } from '@/lib/semana'

const DIAS_CORTO = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber'

interface Fila { id: string; etiqueta: string; grupo: string | null; celdas: Record<string, number>; total: number }
interface Matriz {
  desde: string; hasta: string; modo: string; celda: string
  fechas: string[]
  semanas: { semana: number; inicio: string; n: number }[]
  filas: Fila[]
  tot_col: Record<string, number>
  max_celda: number
}

const fmt = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 1 })
const hace = (dias: number) => { const d = new Date(); d.setDate(d.getDate() - dias); return iso(d) }
const inicioMes = () => { const d = new Date(); d.setDate(1); return iso(d) }

const PRESETS: { label: string; desde: () => string }[] = [
  { label: '4 semanas', desde: () => hace(27) },
  { label: '8 semanas', desde: () => hace(55) },
  { label: 'Mes actual', desde: inicioMes },
]

export default function MatrizHistorica() {
  const [desde, setDesde] = useState(hace(27))
  const [hasta, setHasta] = useState(iso(new Date()))
  const [modo, setModo] = useState<'partidas' | 'trabajadores' | 'supervisores'>('partidas')
  const [celda, setCelda] = useState<'hh' | 'cantidad'>('hh')
  const [otm, setOtm] = useState('')
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())

  // OJO: /ev/otms devuelve `otm_id` (no `id`).
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const mz = useQuery<Matriz>({
    queryKey: ['matriz', desde, hasta, modo, celda, otm],
    queryFn: () => api(`/ev/matriz?desde=${desde}&hasta=${hasta}&modo=${modo}&celda=${celda}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
    placeholderData: keepPreviousData,
  })

  // Agrupar filas por `grupo` (fase con nombre / cargo) con subtotales
  const grupos = useMemo(() => {
    const map = new Map<string, Fila[]>()
    for (const f of mz.data?.filas ?? []) {
      const g = f.grupo ?? '(Sin grupo)'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    }
    return [...map.entries()]
  }, [mz.data])

  const heat = (v: number | undefined) => {
    if (!v || !mz.data?.max_celda) return {}
    const a = Math.min(v / mz.data.max_celda, 1)
    return { background: `rgba(245, 158, 11, ${(0.06 + a * 0.34).toFixed(3)})` }
  }

  const subtotal = (filas: Fila[], fecha: string) =>
    filas.reduce((s, f) => s + (f.celdas[fecha] || 0), 0)

  const exportar = () => {
    if (!mz.data) return
    const d = mz.data
    const filasX = d.filas.map(f => ({
      GRUPO: f.grupo ?? '', FILA: f.etiqueta,
      ...Object.fromEntries(d.fechas.map(fe => [fe, f.celdas[fe] ?? ''])),
      TOTAL: f.total,
    }))
    const ws = XLSX.utils.json_to_sheet(filasX, { header: ['GRUPO', 'FILA', ...d.fechas, 'TOTAL'] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Matriz ${d.celda.toUpperCase()}`)
    XLSX.writeFile(wb, `matriz_${d.modo}_${d.desde}_${d.hasta}.xlsx`)
  }

  const toggleGrupo = (g: string) =>
    setColapsados(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n })

  const unidad = celda === 'hh' ? 'HH' : 'cant.'
  const diaHdr = (f: string) => {
    const d = new Date(f + 'T12:00:00')
    return `${DIAS_CORTO[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-k-text flex items-center gap-2">
            <Grid3X3 size={18} className="text-k-amber" /> Matriz histórica
          </h1>
          <p className="text-k-text2 text-sm">Fechas arriba, actividades o personal a la izquierda — el pasado completo sin cambiar de semana.</p>
        </div>
        <button onClick={exportar} disabled={!mz.data}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border disabled:opacity-40">
          <Download size={14} /> Exportar Excel
        </button>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setDesde(p.desde()); setHasta(iso(new Date())) }}
            className={`text-xs px-2.5 py-1.5 rounded-lg border ${desde === p.desde() ? 'border-k-amber text-k-amber' : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
            {p.label}
          </button>
        ))}
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
        <span className="text-k-text3 text-xs">→</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
        <select value={modo} onChange={e => { const m = e.target.value as typeof modo; setModo(m); if (m !== 'partidas') setCelda('hh') }} className={inputCls}>
          <option value="partidas">Por partida</option>
          <option value="trabajadores">Por trabajador</option>
          <option value="supervisores">Por supervisor</option>
        </select>
        {modo === 'partidas' && (
          <select value={celda} onChange={e => setCelda(e.target.value as typeof celda)} className={inputCls}>
            <option value="hh">HH del tareo</option>
            <option value="cantidad">Cantidad ejecutada</option>
          </select>
        )}
        <select value={otm} onChange={e => setOtm(e.target.value)} className={inputCls}>
          <option value="">Todos los proyectos</option>
          {(otms.data ?? []).map(o => <option key={o.otm_id} value={o.otm_id} title={o.descripcion}>{o.otm_id}</option>)}
        </select>
        {mz.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      {mz.isError && <p className="text-k-red text-sm">{(mz.error as Error).message}</p>}

      {/* Matriz */}
      {mz.data && (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
            <table className="text-[11px] border-collapse w-max min-w-full">
              <thead className="sticky top-0 z-20">
                <tr className="bg-k-raised">
                  <th className="sticky left-0 z-30 bg-k-raised text-left px-3 py-1.5 text-[10px] uppercase text-k-text3 border-b border-r border-k-border min-w-[240px]">
                    {modo === 'partidas' ? 'Partida' : modo === 'trabajadores' ? 'Trabajador' : 'Supervisor'}
                  </th>
                  {mz.data.semanas.map(s => (
                    <th key={s.inicio} colSpan={s.n}
                      className="px-1 py-1 text-[10px] text-k-amber border-b border-r border-k-border bg-k-raised whitespace-nowrap">
                      Sem {s.semana}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-[10px] uppercase text-k-text3 border-b border-k-border bg-k-raised">Total {unidad}</th>
                </tr>
                <tr className="bg-k-surface">
                  <th className="sticky left-0 z-30 bg-k-surface border-b border-r border-k-border"></th>
                  {mz.data.fechas.map(f => (
                    <th key={f} className="px-1.5 py-1 text-[9px] text-k-text3 border-b border-k-border font-normal whitespace-nowrap">{diaHdr(f)}</th>
                  ))}
                  <th className="border-b border-k-border"></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(([g, filas]) => (
                  <GrupoFilas key={g} grupo={g} filas={filas} fechas={mz.data!.fechas}
                    colapsado={colapsados.has(g)} onToggle={() => toggleGrupo(g)}
                    heat={heat} subtotal={subtotal} conGrupos={modo === 'partidas' || modo === 'trabajadores'} />
                ))}
                {mz.data.filas.length === 0 && (
                  <tr><td colSpan={mz.data.fechas.length + 2} className="px-4 py-8 text-center text-k-text3">
                    Sin datos en este rango/filtro.
                  </td></tr>
                )}
              </tbody>
              {mz.data.filas.length > 0 && (
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-k-raised font-bold">
                    <td className="sticky left-0 z-30 bg-k-raised px-3 py-1.5 text-k-text border-t border-r border-k-border">TOTAL</td>
                    {mz.data.fechas.map(f => (
                      <td key={f} className="px-1.5 py-1.5 text-right text-k-amber border-t border-k-border whitespace-nowrap">
                        {mz.data!.tot_col[f] ? fmt(mz.data!.tot_col[f]) : ''}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-k-amber border-t border-k-border">
                      {fmt(mz.data.filas.reduce((s, f) => s + f.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
            Intensidad de color = magnitud de {unidad} (escala al percentil 95). Clic en un grupo para colapsarlo.
          </p>
        </div>
      )}
    </div>
  )
}

function GrupoFilas({ grupo, filas, fechas, colapsado, onToggle, heat, subtotal, conGrupos }: {
  grupo: string; filas: Fila[]; fechas: string[]
  colapsado: boolean; onToggle: () => void
  heat: (v: number | undefined) => React.CSSProperties
  subtotal: (filas: Fila[], fecha: string) => number
  conGrupos: boolean
}) {
  const totalGrupo = filas.reduce((s, f) => s + f.total, 0)
  return (
    <>
      {conGrupos && (
        <tr className="bg-k-raised/60 cursor-pointer hover:bg-k-raised" onClick={onToggle}>
          <td className="sticky left-0 z-10 bg-k-raised px-3 py-1 font-bold text-k-text2 border-r border-k-border whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              {colapsado ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              {grupo} <span className="text-k-text3 font-normal">({filas.length})</span>
            </span>
          </td>
          {fechas.map(f => {
            const v = subtotal(filas, f)
            return <td key={f} className="px-1.5 py-1 text-right text-k-text2 whitespace-nowrap">{v ? fmt(v) : ''}</td>
          })}
          <td className="px-2 py-1 text-right font-bold text-k-text2">{fmt(totalGrupo)}</td>
        </tr>
      )}
      {!colapsado && filas.map(fila => (
        <tr key={fila.id} className="border-b border-k-border/30 hover:bg-k-raised/30">
          <td className="sticky left-0 z-10 bg-k-surface px-3 py-1 text-k-text2 border-r border-k-border max-w-[300px] truncate" title={fila.etiqueta}>
            {conGrupos ? <span className="pl-4">{fila.etiqueta}</span> : fila.etiqueta}
          </td>
          {fechas.map(f => (
            <td key={f} className="px-1.5 py-1 text-right text-k-text whitespace-nowrap" style={heat(fila.celdas[f])}>
              {fila.celdas[f] ? fmt(fila.celdas[f]) : ''}
            </td>
          ))}
          <td className="px-2 py-1 text-right font-bold text-k-text">{fmt(fila.total)}</td>
        </tr>
      ))}
    </>
  )
}
