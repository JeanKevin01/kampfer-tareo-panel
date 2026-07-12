// Lookahead tipo Excel — réplica del "Anexo 01 - LookAhead" del ex-gerente:
// filas = actividades agrupadas por OTM, columnas = días de N semanas.
// Cada actividad tiene 2 filas: PROG (metrado programado por día, celdas
// verdes, editables) y REAL (metrado ejecutado, celdas azules — escribe en
// ev_avances_diarios, la MISMA tabla del módulo de Valor Ganado).
// EvaluacionSemanal = el formato "F030b - Planeamiento" (comprometido vs
// alcanzado de la semana, con cumplimiento SI/NO y causa).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Printer } from 'lucide-react'
import { api } from '@/lib/api'
import { CNC } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS_1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
const fmtCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''))

export interface ActGrid {
  id: number; titulo: string; estado: string; descripcion?: string | null
  fecha: string; fecha_fin: string
  otm_id?: string | null; partida_id?: number | null
  partida_codigo?: string | null; partida_desc?: string | null
  responsable?: string | null; supervisor_id?: string | null; supervisor_nombre?: string | null
  causa_nc?: string | null; causa_nc_cat?: string | null
  rest_pend?: number; rest_total?: number
  und?: string | null; metrado_prog?: number | null
  metrado_base?: number | null; acum_real?: number | null; saldo?: number | null
  prog: Record<string, number>; real: Record<string, number>
}
export interface GridResp {
  desde: string; hasta: string
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  fechas: string[]
  grupos: { otm_id: string | null; otm_desc: string | null; actividades: ActGrid[] }[]
}

const ESTADO_DOT: Record<string, string> = {
  PROGRAMADO: 'bg-amber-400', EJECUTADO: 'bg-green-500',
  CANCELADO: 'bg-zinc-500', NO_CUMPLIDA: 'bg-red-500',
}

const PROYECTO_ID = 1
const thBase = 'border border-k-border px-1 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'
const tdFijo = 'border border-k-border px-2 py-1 text-[11px] bg-k-surface'

function CeldaMetrado({ valor, editable, tipo, onGuardar }: {
  valor: number | undefined; editable: boolean
  tipo: 'prog' | 'real'; onGuardar: (v: number | null) => void
}) {
  const lleno = valor != null && valor > 0
  const clr = tipo === 'prog'
    ? (lleno ? 'bg-green-500/20 text-green-300 font-medium' : '')
    : (lleno ? 'bg-blue-500/20 text-blue-300 font-medium' : '')
  if (!editable) {
    return <td className={`border border-k-border/60 px-0.5 py-0.5 text-center text-[10px] ${clr}`}>
      {lleno ? num(valor!) : ''}</td>
  }
  const commit = (el: HTMLInputElement) => {
    const limpio = el.value.trim()
    const v = limpio === '' ? null : Number(limpio)
    if (limpio !== '' && (Number.isNaN(v) || v! < 0)) { el.value = valor != null ? num(valor) : ''; return }
    const antes = valor ?? null
    if (v === antes || (v === 0 && antes === null)) return
    onGuardar(v === 0 ? null : v)
  }
  return (
    <td className={`border border-k-border/60 p-0 text-center ${clr}`}>
      {/* No controlado + key: al llegar el valor del servidor la celda se re-monta */}
      <input key={valor ?? 'vacio'} defaultValue={valor != null ? num(valor) : ''}
        onBlur={e => commit(e.target)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-11 bg-transparent text-center text-[10px] py-1 outline-none focus:bg-k-raised"
        inputMode="decimal" />
    </td>
  )
}

export function LookaheadGrid({ onEditar }: { onEditar: (a: ActGrid) => void }) {
  const qc = useQueryClient()
  const [nSemanas, setNSemanas] = useState(4)
  const [desde, setDesde] = useState(() => iso(lunesDe(new Date())))

  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid', desde, nSemanas],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${desde}&semanas=${nSemanas}`),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['lookahead-grid'] })
    qc.invalidateQueries({ queryKey: ['programacion'] })
    qc.invalidateQueries({ queryKey: ['lookahead'] })
    qc.invalidateQueries({ queryKey: ['ppc'] })
  }
  const guardarProg = useMutation({
    mutationFn: ({ actId, fecha, v }: { actId: number; fecha: string; v: number | null }) =>
      api(`/ev/programacion/actividades/${actId}/metrado-dias`, {
        method: 'PUT', body: JSON.stringify({ dias: { [fecha]: v } }),
      }),
    onSuccess: invalidar, onError: (e: Error) => { alert(e.message); invalidar() },
  })
  const guardarReal = useMutation({
    mutationFn: ({ partidaId, fecha, v }: { partidaId: number; fecha: string; v: number | null }) =>
      api('/ev/programacion/avance-dia', {
        method: 'POST', body: JSON.stringify({ partida_id: partidaId, fecha, cantidad: v }),
      }),
    onSuccess: invalidar, onError: (e: Error) => { alert(e.message); invalidar() },
  })
  const mover = (dias: number) => {
    const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + dias); setDesde(iso(lunesDe(d)))
  }
  const hoy = iso(new Date())
  const d = grid.data
  const nCols = 6 + (d ? d.fechas.length : nSemanas * 7)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => mover(-7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={15} /></button>
        <span className="text-sm font-bold text-k-text">LookAhead desde {fmtDia(desde)}</span>
        <button onClick={() => mover(7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={15} /></button>
        <button onClick={() => setDesde(iso(lunesDe(new Date())))} className="text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">Hoy</button>
        <select value={nSemanas} onChange={e => setNSemanas(Number(e.target.value))}
          className="bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none">
          {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n} semanas</option>)}
        </select>
        <button onClick={() => window.open(`/programacion/lookahead-imprimir?desde=${desde}&semanas=${nSemanas}`, '_blank')}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
          <Printer size={14} /> Exportar PDF
        </button>
        {grid.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      <div className="overflow-x-auto rounded-xl border border-k-border">
        <table className="border-collapse w-max min-w-full">
          <thead>
            <tr>
              <th className={`${thBase} text-left sticky left-0 z-10 min-w-[240px]`} rowSpan={2}>ACTIVIDADES</th>
              <th className={`${thBase} min-w-[80px]`} rowSpan={2}>RESP</th>
              <th className={`${thBase} min-w-[70px]`} rowSpan={2}>METRADO</th>
              <th className={thBase} rowSpan={2}>UND</th>
              <th className={thBase} rowSpan={2}>F. Inic</th>
              <th className={thBase} rowSpan={2}>F. Fin</th>
              {(d?.semanas ?? []).map((s, i) => (
                <th key={s.lunes} colSpan={7}
                  className="border border-k-border px-1 py-1 text-[10px] font-bold uppercase bg-red-900/30 text-red-200">
                  {i === 0 ? 'Esta semana' : `Semana +${i}`} · {fmtDia(s.lunes)} — {fmtDia(s.domingo)}
                </th>
              ))}
            </tr>
            <tr>
              {(d?.fechas ?? []).map((f, i) => (
                <th key={f} className={`border border-k-border/60 px-0.5 py-0.5 text-[9px] font-bold min-w-[44px] ${
                  f === hoy ? 'bg-green-500/20 text-k-green' : 'bg-k-raised text-k-text3'}`}>
                  {DIAS_1[i % 7]}<br />{fmtCorta(f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d?.grupos ?? []).map(g => (
              <GrupoOTM key={g.otm_id ?? '-'} grupo={g} fechas={d!.fechas} hoy={hoy}
                onEditar={onEditar}
                onProg={(actId, fecha, v) => guardarProg.mutate({ actId, fecha, v })}
                onReal={(partidaId, fecha, v) => guardarReal.mutate({ partidaId, fecha, v })} />
            ))}
            {(d?.grupos ?? []).length === 0 && !grid.isLoading && (
              <tr><td colSpan={nCols} className="px-4 py-8 text-center text-k-text3 text-sm">
                Sin actividades en el rango. Prográmalas desde el Plan semanal (o el botón + del calendario)
                indicando F.Inic–F.Fin y el metrado comprometido.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-k-text3">
        Celdas <span className="text-green-300 font-bold">verdes</span> = metrado PROGRAMADO por día
        (se distribuye solo entre F.Inic y F.Fin; edítalo celda a celda como en el Excel) ·
        celdas <span className="text-blue-300 font-bold">azules</span> = metrado REAL ejecutado —
        se guarda en el avance diario del módulo <b>Valor Ganado</b> (puedes ingresarlo aquí o allá:
        es el mismo dato). La fila Real requiere partida de control.
      </p>
    </div>
  )
}

function GrupoOTM({ grupo, fechas, hoy, onEditar, onProg, onReal }: {
  grupo: GridResp['grupos'][number]; fechas: string[]; hoy: string
  onEditar: (a: ActGrid) => void
  onProg: (actId: number, fecha: string, v: number | null) => void
  onReal: (partidaId: number, fecha: string, v: number | null) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={6 + fechas.length}
          className="border border-k-border px-2 py-1 text-[11px] font-bold bg-blue-500/15 text-k-blue sticky left-0">
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => {
        const editable = a.estado !== 'CANCELADO'
        return (
          <FilasActividad key={a.id} a={a} fechas={fechas} hoy={hoy} editable={editable}
            onEditar={onEditar} onProg={onProg} onReal={onReal} />
        )
      })}
    </>
  )
}

function FilasActividad({ a, fechas, hoy, editable, onEditar, onProg, onReal }: {
  a: ActGrid; fechas: string[]; hoy: string; editable: boolean
  onEditar: (a: ActGrid) => void
  onProg: (actId: number, fecha: string, v: number | null) => void
  onReal: (partidaId: number, fecha: string, v: number | null) => void
}) {
  return (
    <>
      <tr className={a.estado === 'CANCELADO' ? 'opacity-50' : ''}>
        <td rowSpan={2} onClick={() => onEditar(a)}
          className={`${tdFijo} sticky left-0 z-10 cursor-pointer hover:bg-k-raised align-top`}
          title={`${a.titulo}${a.partida_desc ? `\n📌 ${a.partida_codigo} — ${a.partida_desc}` : ''}\n(clic para editar / restricciones)`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
            <span className="text-k-text leading-tight">{a.titulo}</span>
            {(a.rest_pend ?? 0) > 0 && <span className="text-[9px] font-bold text-k-red flex-shrink-0">⛔{a.rest_pend}</span>}
          </div>
          {a.partida_codigo && (
            <div className="text-[9px] text-k-text3 font-mono pl-3.5 truncate max-w-[240px]">
              📌 {a.partida_codigo}{a.partida_desc ? ` · ${a.partida_desc.slice(0, 34)}` : ''}
            </div>
          )}
          {a.estado === 'NO_CUMPLIDA' && (a.causa_nc_cat || a.causa_nc) && (
            <div className="text-[9px] text-k-red/90 pl-3.5">
              {CNC[a.causa_nc_cat ?? ''] ?? ''}{a.causa_nc ? ` — ${a.causa_nc.slice(0, 40)}` : ''}
            </div>
          )}
        </td>
        <td rowSpan={2} className={`${tdFijo} text-center text-k-text2`}>
          {a.supervisor_nombre?.split(' ')[0] || a.responsable || '—'}
        </td>
        <td rowSpan={2} className={`${tdFijo} text-center align-middle`}>
          <div className="font-mono font-bold text-k-text">{a.metrado_prog != null ? num(a.metrado_prog) : '—'}</div>
          {a.metrado_base != null && (
            <div className="text-[9px] text-k-text3" title="Metrado presupuestado de la partida · saldo por ejecutar">
              base {num(a.metrado_base)}{a.saldo != null ? ` · saldo ${num(a.saldo)}` : ''}
            </div>
          )}
        </td>
        <td rowSpan={2} className={`${tdFijo} text-center text-k-text2`}>{a.und ?? '—'}</td>
        <td rowSpan={2} className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(a.fecha)}</td>
        <td rowSpan={2} className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(a.fecha_fin)}</td>
        {fechas.map(f => (
          <CeldaMetrado key={f} valor={a.prog[f]} tipo="prog" editable={editable}
            onGuardar={v => onProg(a.id, f, v)} />
        ))}
      </tr>
      <tr className={a.estado === 'CANCELADO' ? 'opacity-50' : ''}>
        {fechas.map(f => (
          <CeldaMetrado key={f} valor={a.real[f]} tipo="real"
            editable={!!a.partida_id && f <= hoy}
            onGuardar={v => onReal(a.partida_id!, f, v)} />
        ))}
      </tr>
    </>
  )
}

// ── F030b: evaluación de la semana (comprometido vs alcanzado) ──
export function EvaluacionSemanal() {
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid', lunes, 1],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${lunes}&semanas=1`),
  })
  const mover = (dias: number) => {
    const d = new Date(lunes + 'T12:00:00'); d.setDate(d.getDate() + dias); setLunes(iso(lunesDe(d)))
  }
  const d = grid.data
  const fechas = d?.fechas ?? []

  const cumplimiento = (a: ActGrid) =>
    a.estado === 'EJECUTADO' ? ['SI', 'text-k-green'] :
    a.estado === 'NO_CUMPLIDA' ? ['NO', 'text-k-red'] :
    a.estado === 'CANCELADO' ? ['—', 'text-k-text3'] : ['…', 'text-k-amber']

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-k-border flex items-center gap-2 flex-wrap">
        <p className="text-xs font-bold text-k-text">Evaluación semanal <span className="text-k-text3 font-normal">(formato F030b: comprometido vs alcanzado)</span></p>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => mover(-7)} className="p-1 rounded border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={13} /></button>
          <span className="text-[11px] font-bold text-k-text">{fmtDia(lunes)}{fechas.length ? ` — ${fmtDia(fechas[6])}` : ''}</span>
          <button onClick={() => mover(7)} className="p-1 rounded border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={13} /></button>
          {grid.isFetching && <Loader2 size={12} className="animate-spin text-k-text3" />}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse w-max min-w-full text-[11px]">
          <thead>
            <tr>
              <th className={`${thBase} text-left min-w-[220px]`}>ACTIVIDAD</th>
              <th className={thBase}>UND</th>
              <th className={thBase}>RESP</th>
              {fechas.map((f, i) => (
                <th key={f} className={`${thBase} min-w-[44px]`}>{DIAS_1[i]}<br /><span className="font-normal text-[9px]">{fmtCorta(f)}</span></th>
              ))}
              <th className={thBase}>COMPROM.</th>
              <th className={thBase}>ALCANZ.</th>
              <th className={thBase}>CUMPL.</th>
              <th className={`${thBase} text-left min-w-[180px]`}>CAUSA DE NO CUMPLIMIENTO</th>
            </tr>
          </thead>
          <tbody>
            {(d?.grupos ?? []).map(g => (
              <EvalGrupo key={g.otm_id ?? '-'} grupo={g} fechas={fechas} cumplimiento={cumplimiento} />
            ))}
            {(d?.grupos ?? []).length === 0 && !grid.isLoading && (
              <tr><td colSpan={7 + fechas.length} className="px-4 py-6 text-center text-k-text3">Semana sin actividades programadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
        Por día: <span className="text-green-300">programado</span> / <span className="text-blue-300">real</span>.
        COMPROM. = metrado comprometido de la semana · ALCANZ. = metrado real registrado (avance diario del EV).
      </p>
    </div>
  )
}

function EvalGrupo({ grupo, fechas, cumplimiento }: {
  grupo: GridResp['grupos'][number]; fechas: string[]
  cumplimiento: (a: ActGrid) => string[]
}) {
  return (
    <>
      <tr>
        <td colSpan={7 + fechas.length} className="border border-k-border px-2 py-1 font-bold bg-blue-500/15 text-k-blue">
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => {
        const comprom = fechas.reduce((s, f) => s + (a.prog[f] ?? 0), 0)
        const alcanz = fechas.reduce((s, f) => s + (a.real[f] ?? 0), 0)
        const [cumpl, clr] = cumplimiento(a)
        return (
          <tr key={a.id} className={a.estado === 'CANCELADO' ? 'opacity-50' : ''}>
            <td className={`${tdFijo}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
                <span className="text-k-text">{a.titulo}</span>
              </div>
              {a.partida_codigo && <div className="text-[9px] text-k-text3 font-mono pl-3.5">📌 {a.partida_codigo}</div>}
            </td>
            <td className={`${tdFijo} text-center text-k-text2`}>{a.und ?? '—'}</td>
            <td className={`${tdFijo} text-center text-k-text2`}>{a.supervisor_nombre?.split(' ')[0] || a.responsable || '—'}</td>
            {fechas.map(f => (
              <td key={f} className="border border-k-border/60 px-0.5 py-0.5 text-center text-[10px]">
                {(a.prog[f] ?? 0) > 0 && <div className="text-green-300">{num(a.prog[f])}</div>}
                {(a.real[f] ?? 0) > 0 && <div className="text-blue-300">{num(a.real[f])}</div>}
              </td>
            ))}
            <td className={`${tdFijo} text-center font-mono font-bold text-green-300`}>{comprom > 0 ? num(comprom) : '—'}</td>
            <td className={`${tdFijo} text-center font-mono font-bold text-blue-300`}>{alcanz > 0 ? num(alcanz) : '—'}</td>
            <td className={`${tdFijo} text-center font-bold ${clr}`}>{cumpl}</td>
            <td className={`${tdFijo} text-k-red/90`}>
              {a.estado === 'NO_CUMPLIDA'
                ? `${CNC[a.causa_nc_cat ?? ''] ?? ''}${a.causa_nc ? ` — ${a.causa_nc}` : ''}`
                : ''}
            </td>
          </tr>
        )
      })}
    </>
  )
}
