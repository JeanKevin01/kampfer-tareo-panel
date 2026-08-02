// ── Hoja semanal de HH ───────────────────────────────────────
// Encargo de Jean (2026-08-02): un sitio donde corregir las HH del tareo.
// Hasta ahora no había ninguno — el API no tenía forma de editar `tareo_partida`
// y la única corrección posible era que el supervisor reenviara su día desde la
// app, borrándolo entero.
//
// Por qué aquí y no en la Matriz histórica: la celda de la matriz es una SUMA
// (`SUM(hh) GROUP BY trabajador, fecha`), así que escribir encima es ambiguo —
// no hay forma de saber a qué partida quitarle las horas. El orden de esta hoja
// (OTM → partida → personal, decidido por Jean) hace que cada fila sea una
// línea real del tareo y que editarla no requiera adivinar nada.
//
// El precio de ese orden: una persona aparece una vez por partida, así que su
// exceso del día no vive en ninguna fila. Por eso el aviso ⚠ se pinta en TODAS
// sus celdas de ese día —en todos los proyectos— y el desglose cruza proyectos
// aunque se esté mirando uno solo.
import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ChevronDown, Loader2, Download, Plus,
  AlertTriangle, X, Trash2, PencilLine,
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { api } from '@/lib/api'
import { iso, lunesDe } from '@/lib/semana'

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber'

interface Linea {
  id: number; hh: number; supervisor_id: string | null; supervisor: string | null
  editado_por: string | null; motivo: string | null
}
interface Celda { hh: number; n: number; editado: boolean; lineas: Linea[] }
interface Persona { trab_id: string; nombre: string; cargo: string; celdas: Record<string, Celda>; total: number }
interface Partida { partida_id: number; codigo: string; descripcion: string; personas: Persona[]; celdas: Record<string, number>; total: number }
interface Proyecto {
  otm_id: string; descripcion: string; partidas: Partida[]; celdas: Record<string, number>; total: number
  personal: { trab_id: string; nombre: string; cargo: string; total: number }[]
}
interface TotalDia { trab_id: string; nombre: string; fecha: string; hh: number; jornada: number; diff: number; estado: string; n_otms: number; n_lineas: number }
interface Hoja {
  lunes: string; domingo: string; fechas: string[]; jornadas: Record<string, number>
  otms: { id: string; descripcion: string }[]; otm: string
  proyectos: Proyecto[]
  totales_persona_dia: Record<string, TotalDia>
  avisos: TotalDia[]
  total_hh: number
}
interface DetallePersona {
  trab_id: string; nombre: string; fecha: string; jornada: number; registrado: number
  diff: number; estado: string
  lineas: {
    id: number; otm_id: string; otm_desc: string; partida_id: number; codigo: string
    descripcion: string; hh: number; supervisor: string | null; editado_por: string | null; motivo: string | null
  }[]
}

const fmt = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 })
const diaHdr = (f: string, i: number) => `${DIAS[i]} ${f.slice(8, 10)}`

export default function HojaSemanal() {
  const qc = useQueryClient()
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const [otm, setOtm] = useState('')
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [detalle, setDetalle] = useState<{ trab_id: string; fecha: string } | null>(null)
  const [agregar, setAgregar] = useState<{ partida: Partida; otm_id: string } | null>(null)
  const [msg, setMsg] = useState('')

  const hoja = useQuery<Hoja>({
    queryKey: ['hoja-semanal', lunes, otm],
    queryFn: () => api(`/ev/hoja-semanal?lunes=${lunes}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
    placeholderData: keepPreviousData,
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['hoja-semanal'] })
    qc.invalidateQueries({ queryKey: ['detalle-persona'] })
    qc.invalidateQueries({ queryKey: ['registros'] })
  }

  const editar = useMutation({
    mutationFn: (v: { id: number; hh: number; motivo?: string }) =>
      api(`/ev/tareo-linea/${v.id}`, { method: 'PATCH', body: JSON.stringify({ hh: v.hh, motivo: v.motivo }) }),
    onSuccess: () => { setMsg('✓ HH corregidas'); invalidar() },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })
  const anular = useMutation({
    mutationFn: (id: number) => api(`/ev/tareo-linea/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setMsg('✓ Línea anulada'); invalidar() },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })

  const mover = (dias: number) => {
    const d = new Date(lunes + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    setLunes(iso(lunesDe(d)))
  }

  const toggle = (k: string) =>
    setCerrados(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

  // Estado del día de una persona: se consulta al mapa global, que se calculó
  // con TODOS los proyectos aunque la vista esté filtrada por uno.
  const estadoDia = (trab_id: string, fecha: string) =>
    hoja.data?.totales_persona_dia[`${trab_id}|${fecha}`]

  const fechas = hoja.data?.fechas ?? []
  const nCols = fechas.length + 2

  const exportar = () => {
    const d = hoja.data
    if (!d) return
    const filas: Record<string, string | number>[] = []
    for (const p of d.proyectos) {
      for (const pa of p.partidas) {
        for (const pe of pa.personas) {
          filas.push({
            PROYECTO: p.otm_id, DESC_PROYECTO: p.descripcion,
            PARTIDA: pa.codigo, DESC_PARTIDA: pa.descripcion,
            TRABAJADOR: pe.nombre, CARGO: pe.cargo,
            ...Object.fromEntries(d.fechas.map(f => [f, pe.celdas[f]?.hh ?? ''])),
            TOTAL: pe.total,
          })
        }
      }
    }
    const header = ['PROYECTO', 'DESC_PROYECTO', 'PARTIDA', 'DESC_PARTIDA', 'TRABAJADOR', 'CARGO', ...d.fechas, 'TOTAL']
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas, { header }), 'Hoja semanal')
    if (d.avisos.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.avisos.map(a => ({
        TRABAJADOR: a.nombre, FECHA: a.fecha, JORNADA: a.jornada,
        REGISTRADO: a.hh, EXCESO: a.diff, PROYECTOS: a.n_otms,
      }))), 'Avisos')
    }
    XLSX.writeFile(wb, `hoja_semanal_${d.lunes}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* Mandos */}
      <div className="rounded-xl border border-k-border bg-k-raised/40 px-2.5 py-2 flex flex-wrap items-center gap-2">
        <button onClick={() => mover(-7)} title="Semana anterior"
          className="btn btn-terciario btn-sm"><ChevronLeft size={14} /></button>
        <span className="font-bold text-sm text-k-text px-1">
          Semana del {new Date(lunes + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
        </span>
        <button onClick={() => mover(7)} title="Semana siguiente"
          className="btn btn-terciario btn-sm"><ChevronRight size={14} /></button>
        <button onClick={() => setLunes(iso(lunesDe(new Date())))} className="btn btn-terciario btn-sm">Esta semana</button>
        <input type="date" value={lunes} className={inputCls}
          onChange={e => e.target.value && setLunes(iso(lunesDe(new Date(e.target.value + 'T12:00:00'))))} />
        <select value={otm} onChange={e => setOtm(e.target.value)} className={inputCls}>
          <option value="">Todos los proyectos</option>
          {(hoja.data?.otms ?? []).map(o => (
            <option key={o.id} value={o.id} title={o.descripcion}>{o.id}</option>
          ))}
        </select>
        {hoja.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-k-green' : 'text-k-red'}`}>{msg}</span>}
          <button onClick={exportar} disabled={!hoja.data?.proyectos.length} className="btn btn-terciario btn-sm">
            <Download size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Avisos: lo que hay que revisar, antes de la tabla */}
      {!!hoja.data?.avisos.length && (
        <div className="rounded-xl border border-k-alerta/40 bg-k-alerta/10 px-3 py-2">
          <p className="text-xs font-bold text-k-alerta flex items-center gap-1.5">
            <AlertTriangle size={13} />
            {hoja.data.avisos.length} {hoja.data.avisos.length === 1 ? 'persona supera' : 'personas superan'} su jornada esta semana
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {hoja.data.avisos.map(a => (
              <button key={`${a.trab_id}|${a.fecha}`} onClick={() => setDetalle({ trab_id: a.trab_id, fecha: a.fecha })}
                title={`${a.hh} HH registradas contra una jornada de ${a.jornada} · ${a.n_otms} proyecto(s)`}
                className="text-[11px] px-2 py-1 rounded-lg border border-k-alerta/40 bg-k-surface hover:bg-k-raised">
                <b className="text-k-text">{a.nombre.split(' ').slice(0, 2).join(' ')}</b>
                <span className="text-k-text3"> · {a.fecha.slice(5)} · </span>
                <b className="text-k-alerta">+{fmt(a.diff)}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {hoja.isError && <p className="text-k-red text-sm">{(hoja.error as Error).message}</p>}

      {/* Hoja */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
          <table className="text-[11px] border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-k-raised">
                <th className="sticky left-0 z-30 bg-k-raised text-left px-3 py-1.5 text-[10px] uppercase text-k-text3 border-b border-r border-k-border min-w-[320px]">
                  Proyecto · Partida · Personal
                </th>
                {fechas.map((f, i) => (
                  <th key={f} className="px-2 py-1.5 text-[10px] text-k-text3 border-b border-k-border font-normal whitespace-nowrap min-w-[62px]">
                    {diaHdr(f, i)}
                    <span className="block text-[9px] text-k-text3/70">{fmt(hoja.data?.jornadas[f] ?? 0)}</span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-[10px] uppercase text-k-text3 border-b border-l border-k-border bg-k-raised">Total</th>
              </tr>
            </thead>
            <tbody>
              {(hoja.data?.proyectos ?? []).map(p => (
                <BloqueProyecto key={p.otm_id} p={p} fechas={fechas}
                  cerrados={cerrados} onToggle={toggle} estadoDia={estadoDia}
                  onCelda={(trab_id, fecha) => setDetalle({ trab_id, fecha })}
                  onEditar={(id, hh) => editar.mutate({ id, hh })}
                  onAgregar={pa => setAgregar({ partida: pa, otm_id: p.otm_id })} />
              ))}
              {hoja.data && !hoja.data.proyectos.length && (
                <tr><td colSpan={nCols} className="px-4 py-10 text-center text-k-text3">
                  Sin tareo registrado en esta semana{otm ? ' para ese proyecto' : ''}.
                </td></tr>
              )}
            </tbody>
            {!!hoja.data?.proyectos.length && (
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-k-raised font-bold">
                  <td className="sticky left-0 z-30 bg-k-raised px-3 py-1.5 text-k-text border-t border-r border-k-border">TOTAL SEMANA</td>
                  {fechas.map(f => {
                    const v = hoja.data!.proyectos.reduce((s, p) => s + (p.celdas[f] || 0), 0)
                    return <td key={f} className="px-2 py-1.5 text-right text-k-amber border-t border-k-border">{v ? fmt(v) : ''}</td>
                  })}
                  <td className="px-2 py-1.5 text-right text-k-amber border-t border-l border-k-border">{fmt(hoja.data!.total_hh)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
          Clic en una celda para editar sus HH · ⚠ = esa persona pasa de su jornada ese día (sumando todos los proyectos) ·
          ✎ = corregido desde oficina, el reenvío del supervisor ya no lo pisa.
        </p>
      </div>

      {detalle && (
        <ModalPersona {...detalle} onClose={() => setDetalle(null)}
          onEditar={(id, hh, motivo) => editar.mutate({ id, hh, motivo })}
          onAnular={id => anular.mutate(id)} />
      )}
      {agregar && (
        <ModalAgregar partida={agregar.partida} fechas={fechas} lunes={lunes}
          onClose={() => setAgregar(null)}
          onHecho={() => { setAgregar(null); setMsg('✓ Línea agregada'); invalidar() }} />
      )}
    </div>
  )
}

// ── Un proyecto: sus partidas y, dentro, su personal ─────────
function BloqueProyecto({ p, fechas, cerrados, onToggle, estadoDia, onCelda, onEditar, onAgregar }: {
  p: Proyecto; fechas: string[]
  cerrados: Set<string>; onToggle: (k: string) => void
  estadoDia: (t: string, f: string) => TotalDia | undefined
  onCelda: (trab_id: string, fecha: string) => void
  onEditar: (id: number, hh: number) => void
  onAgregar: (pa: Partida) => void
}) {
  const abierto = !cerrados.has(p.otm_id)
  return (
    <>
      <tr className="bg-k-wbs/10 cursor-pointer hover:bg-k-wbs/20" onClick={() => onToggle(p.otm_id)}>
        <td className="sticky left-0 z-10 bg-k-surface px-2 py-1.5 border-r border-k-border">
          <span className="inline-flex items-center gap-1 font-bold text-k-wbs">
            {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {p.otm_id}
            <span className="font-normal text-k-text3 truncate max-w-[220px]" title={p.descripcion}>· {p.descripcion}</span>
          </span>
        </td>
        {fechas.map(f => (
          <td key={f} className="px-2 py-1.5 text-right font-bold text-k-text2">{p.celdas[f] ? fmt(p.celdas[f]) : ''}</td>
        ))}
        <td className="px-2 py-1.5 text-right font-bold text-k-text border-l border-k-border">{fmt(p.total)}</td>
      </tr>

      {abierto && p.partidas.map(pa => {
        const kp = `${p.otm_id}|${pa.partida_id}`
        const abiertaPa = !cerrados.has(kp)
        return (
          <Fragment key={kp}>
            <tr className="bg-k-raised/40 hover:bg-k-raised/70">
              <td className="sticky left-0 z-10 bg-k-surface px-2 py-1 border-r border-k-border">
                <span className="inline-flex items-center gap-1 pl-4">
                  <button onClick={() => onToggle(kp)} className="text-k-text3 hover:text-k-text">
                    {abiertaPa ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                  <span className="font-mono text-k-wbs">{pa.codigo}</span>
                  <span className="text-k-text2 truncate max-w-[200px]" title={pa.descripcion}>{pa.descripcion}</span>
                  <button onClick={() => onAgregar(pa)} title="Agregar HH que el tareo no registró"
                    className="ml-1 text-k-blue/70 hover:text-k-blue"><Plus size={12} /></button>
                </span>
              </td>
              {fechas.map(f => (
                <td key={f} className="px-2 py-1 text-right text-k-text2">{pa.celdas[f] ? fmt(pa.celdas[f]) : ''}</td>
              ))}
              <td className="px-2 py-1 text-right font-bold text-k-text2 border-l border-k-border">{fmt(pa.total)}</td>
            </tr>

            {abiertaPa && pa.personas.map(pe => (
              <tr key={`${kp}|${pe.trab_id}`} className="border-b border-k-border/30 hover:bg-k-raised/20">
                <td className="sticky left-0 z-10 bg-k-surface px-2 py-1 border-r border-k-border">
                  <span className="pl-10 text-k-text">{pe.nombre}</span>
                  <span className="text-k-text3 text-[10px]"> · {pe.cargo}</span>
                </td>
                {fechas.map(f => (
                  <CeldaHH key={f} celda={pe.celdas[f]} estado={estadoDia(pe.trab_id, f)}
                    onAbrir={() => onCelda(pe.trab_id, f)}
                    onEditar={hh => pe.celdas[f]?.n === 1 && onEditar(pe.celdas[f].lineas[0].id, hh)} />
                ))}
                <td className="px-2 py-1 text-right font-bold text-k-text border-l border-k-border">{fmt(pe.total)}</td>
              </tr>
            ))}
          </Fragment>
        )
      })}

      {abierto && !!p.personal.length && (
        <tr className="bg-k-surface">
          <td colSpan={fechas.length + 2} className="px-2 py-1 pl-6 text-[10px] text-k-text3 border-b border-k-border">
            Personal del proyecto esta semana: <b className="text-k-text2">{p.personal.length}</b>
            {' — '}
            {p.personal.map(x => `${x.nombre.split(' ').slice(0, 2).join(' ')} (${fmt(x.total)})`).join(' · ')}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Celda editable ───────────────────────────────────────────
function CeldaHH({ celda, estado, onAbrir, onEditar }: {
  celda?: Celda; estado?: TotalDia
  onAbrir: () => void; onEditar: (hh: number) => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')

  const alerta = estado?.estado === 'extra'
  // Con dos registros en la misma celda no se puede editar a ciegas: se abre el
  // desglose para elegir cuál es el que sobra.
  const multi = (celda?.n ?? 0) > 1

  if (!celda) {
    return <td className="px-2 py-1 text-right text-k-text3/40 hover:bg-k-raised/40 cursor-pointer" onClick={onAbrir}>·</td>
  }

  const guardar = () => {
    const v = parseFloat(valor.replace(',', '.'))
    setEditando(false)
    if (!isNaN(v) && Math.abs(v - celda.hh) > 0.0001) onEditar(v)
  }

  return (
    <td className={`px-1 py-1 text-right whitespace-nowrap cursor-pointer
                    ${alerta ? 'bg-k-alerta/15' : 'hover:bg-k-raised/50'}`}
      title={celda.lineas.map(l => `${l.hh} HH · ${l.supervisor ?? '—'}${l.editado_por ? ` · corregido por ${l.editado_por}` : ''}`).join('\n')
        + (estado ? `\n\nTotal del día: ${estado.hh} HH · jornada ${estado.jornada}${estado.n_otms > 1 ? ` · ${estado.n_otms} proyectos` : ''}` : '')}>
      {editando ? (
        <input autoFocus type="number" step="0.5" value={valor}
          onChange={e => setValor(e.target.value)} onBlur={guardar}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
          className="w-14 bg-k-raised border border-k-amber rounded px-1 py-0.5 text-right text-k-text outline-none" />
      ) : (
        <span className="inline-flex items-center gap-0.5 justify-end w-full"
          onClick={() => { if (multi) { onAbrir(); return } setValor(String(celda.hh)); setEditando(true) }}>
          {alerta && <AlertTriangle size={9} className="text-k-alerta flex-shrink-0" />}
          {celda.editado && <PencilLine size={9} className="text-k-blue flex-shrink-0" />}
          <span className={celda.hh ? 'text-k-text' : 'text-k-text3 line-through'}>{fmt(celda.hh)}</span>
          {multi && <sup className="text-k-alerta font-bold">{celda.n}</sup>}
        </span>
      )}
    </td>
  )
}

// ── El día de una persona, cruzando proyectos ────────────────
function ModalPersona({ trab_id, fecha, onClose, onEditar, onAnular }: {
  trab_id: string; fecha: string; onClose: () => void
  onEditar: (id: number, hh: number, motivo?: string) => void
  onAnular: (id: number) => void
}) {
  const d = useQuery<DetallePersona>({
    queryKey: ['detalle-persona', trab_id, fecha],
    queryFn: () => api(`/ev/hoja-semanal/persona?trab_id=${trab_id}&fecha=${fecha}`),
  })
  const [edit, setEdit] = useState<Record<number, string>>({})
  const [motivo, setMotivo] = useState('')

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[720px] max-w-full max-h-[86vh] overflow-y-auto bg-k-surface border border-k-border rounded-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b border-k-border">
          <div>
            <h3 className="font-bold text-k-text">{d.data?.nombre ?? trab_id}</h3>
            <p className="text-xs text-k-text2">
              {new Date(fecha + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
              {d.data && <> · jornada <b className="text-k-text">{fmt(d.data.jornada)}</b> ·
                registrado <b className={d.data.estado === 'extra' ? 'text-k-alerta' : 'text-k-text'}>{fmt(d.data.registrado)}</b>
                {d.data.estado === 'extra' && <span className="text-k-alerta font-bold"> (+{fmt(d.data.diff)})</span>}
                {d.data.estado === 'bajo' && <span className="text-k-text3"> ({fmt(d.data.diff)})</span>}
              </>}
            </p>
          </div>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-2">
          {d.isLoading && <p className="text-k-text3 text-sm">Cargando…</p>}
          {d.data?.lineas.map(l => (
            <div key={l.id} className="flex items-center gap-2 border border-k-border rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-mono font-bold text-k-amber">{l.otm_id}</span>
                  <span className="text-k-text3"> · </span>
                  <span className="font-mono text-k-wbs">{l.codigo}</span>
                </p>
                <p className="text-[11px] text-k-text2 truncate">{l.descripcion}</p>
                <p className="text-[10px] text-k-text3">
                  Registró: {l.supervisor ?? '—'}
                  {l.editado_por && <span className="text-k-blue"> · corregido por {l.editado_por}</span>}
                  {l.motivo && ` · ${l.motivo}`}
                </p>
              </div>
              <input type="number" step="0.5" defaultValue={l.hh}
                onChange={e => setEdit(p => ({ ...p, [l.id]: e.target.value }))}
                className="w-20 bg-k-raised border border-k-border rounded-lg px-2 py-1 text-right text-sm text-k-text outline-none focus:border-k-amber" />
              <button
                disabled={edit[l.id] === undefined || parseFloat(edit[l.id]) === l.hh}
                onClick={() => onEditar(l.id, parseFloat(edit[l.id].replace(',', '.')), motivo)}
                className="btn btn-secundario btn-sm disabled:opacity-30">Guardar</button>
              <button onClick={() => { if (window.confirm('¿Anular esta línea? Queda en 0 y el reenvío del supervisor ya no la repone.')) onAnular(l.id) }}
                title="Anular la línea" className="text-k-red/70 hover:text-k-red"><Trash2 size={14} /></button>
            </div>
          ))}
          {d.data && !d.data.lineas.length && <p className="text-k-text3 text-sm">Sin registros ese día.</p>}

          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo de la corrección (queda en la traza)"
            className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-xs text-k-text outline-none focus:border-k-amber" />
        </div>
      </div>
    </div>
  )
}

// ── Agregar una línea que el tareo no registró ───────────────
function ModalAgregar({ partida, fechas, lunes, onClose, onHecho }: {
  partida: Partida; fechas: string[]; lunes: string
  onClose: () => void; onHecho: () => void
}) {
  const [trab, setTrab] = useState('')
  const [fecha, setFecha] = useState(fechas[0] ?? lunes)
  const [hh, setHh] = useState('9.5')
  const [motivo, setMotivo] = useState('')
  const [err, setErr] = useState('')

  const trabs = useQuery<{ id: string; nombre: string; cargo: string }[]>({
    queryKey: ['trabajadores'], queryFn: () => api('/api/trabajadores'), staleTime: 5 * 60 * 1000,
  })

  const crear = useMutation({
    mutationFn: () => api('/ev/tareo-linea', {
      method: 'POST',
      body: JSON.stringify({ trabajador_id: trab, partida_id: partida.partida_id, fecha, hh: parseFloat(hh), motivo }),
    }),
    onSuccess: onHecho,
    onError: (e: Error) => setErr(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[460px] max-w-full bg-k-surface border border-k-border rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b border-k-border">
          <div>
            <h3 className="font-bold text-k-text">Agregar HH</h3>
            <p className="text-xs text-k-text2 font-mono">{partida.codigo}</p>
          </div>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <select value={trab} onChange={e => setTrab(e.target.value)} className={inputCls + ' w-full'}>
            <option value="">— Trabajador —</option>
            {(trabs.data ?? []).map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.cargo}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls + ' flex-1'}>
              {fechas.map((f, i) => <option key={f} value={f}>{diaHdr(f, i)}</option>)}
            </select>
            <input type="number" step="0.5" value={hh} onChange={e => setHh(e.target.value)}
              className={inputCls + ' w-24 text-right'} />
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (queda en la traza)" className={inputCls + ' w-full text-xs'} />
          {err && <p className="text-k-red text-xs">{err}</p>}
          <button disabled={!trab || !(parseFloat(hh) > 0) || crear.isPending}
            onClick={() => { setErr(''); crear.mutate() }}
            className="btn btn-primario w-full justify-center disabled:opacity-40">
            {crear.isPending ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
