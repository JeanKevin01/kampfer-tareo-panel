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
  causa_nc_planner?: string | null; causa_nc_planner_cat?: string | null
  rest_pend?: number; rest_total?: number
  und?: string | null; metrado_prog?: number | null
  metrado_base?: number | null; acum_real?: number | null; saldo?: number | null
  dias_salto?: string[]; dias_medio?: string[]
  predecesoras?: { id: number; titulo: string; fecha_fin: string; lag_dias: number }[]
  sucesoras?: number[]; dep_total?: number
  prog: Record<string, number>; real: Record<string, number>
}
export interface GridResp {
  desde: string; hasta: string
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  fechas: string[]
  dias_semana?: number[]; feriados?: string[]
  grupos: { otm_id: string | null; otm_desc: string | null; actividades: ActGrid[] }[]
}

// ISO weekday del string YYYY-MM-DD sin depender de la zona horaria local
const isoDow = (f: string) => {
  const d = new Date(f + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}
// Color del avance real vs el programado congelado del día (línea base):
// más = verde · igual = ámbar · menos = rojo
const clrReal = (real: number | undefined, prog: number | undefined) => {
  if (real == null) return ''
  const p = prog ?? 0
  if (real > p + 0.0005) return 'bg-green-500/25 text-green-300 font-bold'
  if (real >= p - 0.0005) return 'bg-amber-500/25 text-amber-300 font-bold'
  return 'bg-red-500/25 text-red-300 font-bold'
}

const ESTADO_DOT: Record<string, string> = {
  PROGRAMADO: 'bg-amber-400', EJECUTADO: 'bg-green-500',
  CANCELADO: 'bg-zinc-500', NO_CUMPLIDA: 'bg-red-500',
}

const PROYECTO_ID = 1
const thBase = 'border border-k-border px-1 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'
const tdFijo = 'border border-k-border px-2 py-1 text-[11px] bg-k-surface'

// Colores base de la celda (bg tailwind ↔ rgba para el gradiente de medio día)
const NIVEL_TXT: Record<string, string> = {
  verde: 'text-green-300 font-bold', ambar: 'text-amber-300 font-bold',
  rojo: 'text-red-300 font-bold', celeste: 'text-sky-300 font-medium', gris: '',
}
const NIVEL_BG: Record<string, string> = {
  verde: 'bg-green-500/25', ambar: 'bg-amber-500/25', rojo: 'bg-red-500/25',
  celeste: 'bg-sky-500/20', gris: 'bg-zinc-700/30',
}
const NIVEL_RGBA: Record<string, string> = {
  verde: 'rgba(34,197,94,0.25)', ambar: 'rgba(245,158,11,0.25)',
  rojo: 'rgba(239,68,68,0.25)', celeste: 'rgba(14,165,233,0.20)',
  gris: 'rgba(63,63,70,0.30)',
}
const nivelDe = (real: number | undefined, prog: number | undefined, laborable: boolean) =>
  real != null
    ? (real > (prog ?? 0) + 0.0005 ? 'verde' : real >= (prog ?? 0) - 0.0005 ? 'ambar' : 'rojo')
    : (prog ?? 0) > 0 ? 'celeste' : !laborable ? 'gris' : ''

// Una celda = un día de la actividad. Muestra el PROGRAMADO (celeste, línea
// base) hasta que se registra el avance: al escribir encima se guarda el REAL
// del día (el meta NO cambia; el saldo se re-prorratea en los días siguientes)
// y la celda toma el semáforo verde/ámbar/rojo con un ✓ de "registrada".
// Un día ◐ (medio día, pesa 0.5) se pinta con relleno SOLO hasta la mitad.
function CeldaDia({ prog, real, editable, esSalto, esMedio, laborable, onRegistrar }: {
  prog: number | undefined; real: number | undefined
  editable: boolean; esSalto: boolean; esMedio: boolean; laborable: boolean
  onRegistrar: (v: number | null) => void
}) {
  if (esSalto) {
    return <td title="Salto intencional de la actividad (edítalo en el modal)"
      className="border border-k-border/60 px-0.5 py-0.5 text-center text-[10px] bg-zinc-600/30 text-k-text3">∅</td>
  }
  const registrada = real != null
  const nivel = nivelDe(real, prog, laborable)
  const clr = nivel ? `${NIVEL_TXT[nivel]}${esMedio ? '' : ` ${NIVEL_BG[nivel]}`}` : ''
  // Medio día: el fondo llena solo la MITAD inferior de la celda (notorio)
  const estilo = esMedio && nivel
    ? { background: `linear-gradient(to top, ${NIVEL_RGBA[nivel]} 50%, transparent 50%)` }
    : undefined
  const titulo = (esMedio ? 'Medio día (pesa 0.5). ' : '') + (registrada
    ? `Programado: ${prog != null ? num(prog) : '—'} · Real registrado: ${num(real!)}`
    : (prog ?? 0) > 0 ? `Programado: ${num(prog!)} — escribe el avance real del día` : '')
  const valor = registrada ? real : prog
  if (!editable) {
    return <td title={titulo} style={estilo}
      className={`relative border border-k-border/60 px-0.5 py-0.5 text-center text-[10px] ${clr}`}>
      {esMedio && <span className="absolute top-0 left-0.5 text-[7px] leading-none text-k-text3">◐</span>}
      {valor != null && valor > 0 ? num(valor) : ''}</td>
  }
  const commit = (el: HTMLInputElement) => {
    const limpio = el.value.trim()
    // vaciar una celda registrada borra el avance del día (vuelve a celeste)
    const v = limpio === '' ? null : Number(limpio)
    if (limpio !== '' && (Number.isNaN(v) || v! < 0)) { el.value = valor != null ? num(valor) : ''; return }
    if (registrada ? v === real : v === null) { el.value = valor != null ? num(valor) : ''; return }
    onRegistrar(v)
  }
  return (
    <td title={titulo} style={estilo} className={`relative border border-k-border/60 p-0 text-center ${clr}`}>
      {esMedio && <span className="absolute top-0 left-0.5 text-[7px] leading-none text-k-text3" title="Medio día (pesa 0.5)">◐</span>}
      {registrada && <span className="absolute top-0 right-0.5 text-[7px] leading-none text-current opacity-90" title="Avance registrado">✓</span>}
      {/* No controlado + key: al llegar el valor del servidor la celda se re-monta */}
      <input key={`${prog ?? '-'}|${real ?? '-'}`} defaultValue={valor != null ? num(valor) : ''}
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
  // Cadena resaltada (clic en 🔗): antecesoras en azul, sucesoras en violeta.
  const [cadenaDe, setCadenaDe] = useState<number | null>(null)

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
  // El real va por actividad: el API escribe en el avance diario del EV y
  // RE-PRORRATEA el saldo entre los días hábiles SIGUIENTES de la actividad.
  const guardarReal = useMutation({
    mutationFn: ({ actId, fecha, v }: { actId: number; fecha: string; v: number | null }) =>
      api(`/ev/programacion/actividades/${actId}/avance-dia`, {
        method: 'POST', body: JSON.stringify({ fecha, cantidad: v }),
      }),
    onSuccess: invalidar, onError: (e: Error) => { alert(e.message); invalidar() },
  })
  const mover = (dias: number) => {
    const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + dias); setDesde(iso(lunesDe(d)))
  }
  const hoy = iso(new Date())
  const d = grid.data
  const nCols = 7 + (d ? d.fechas.length : nSemanas * 7)
  const diasSemana = new Set(d?.dias_semana ?? [1, 2, 3, 4, 5, 6, 7])
  const feriados = new Set(d?.feriados ?? [])
  const laborable = (f: string) => diasSemana.has(isoDow(f)) && !feriados.has(f)

  // BFS transitivo sobre las actividades visibles para pintar la cadena.
  const cadena = (() => {
    if (cadenaDe == null || !d) return null
    const acts = d.grupos.flatMap(g => g.actividades)
    const porId = new Map(acts.map(a => [a.id, a]))
    const azules = new Set<number>(); const violetas = new Set<number>()
    const subir = [cadenaDe]
    while (subir.length) {
      const a = porId.get(subir.pop()!)
      for (const p of a?.predecesoras ?? []) if (!azules.has(p.id)) { azules.add(p.id); subir.push(p.id) }
    }
    const bajar = [cadenaDe]
    while (bajar.length) {
      const a = porId.get(bajar.pop()!)
      for (const s of a?.sucesoras ?? []) if (!violetas.has(s)) { violetas.add(s); bajar.push(s) }
    }
    return { focal: cadenaDe, azules, violetas }
  })()

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
        <input type="date" value={desde} title="Saltar a la semana de una fecha"
          onChange={e => { if (e.target.value) setDesde(iso(lunesDe(new Date(e.target.value + 'T12:00:00')))) }}
          className="bg-k-raised border border-k-border rounded-lg px-2 py-1.5 text-xs text-k-text2 outline-none" />
        <button onClick={() => window.open(`/programacion/lookahead-imprimir?desde=${desde}&semanas=${nSemanas}`, '_blank')}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
          <Printer size={14} /> Exportar PDF
        </button>
        {grid.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
        {desde < iso(lunesDe(new Date())) && (
          <span className="text-[11px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            ⏪ Semana pasada — puedes registrar avances y programar retroactivamente
          </span>
        )}
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
              <th className={`${thBase} min-w-[60px]`} rowSpan={2}
                title="Antecesoras (estilo MS Project): #id de la actividad que debe terminar antes, FS = Fin→Inicio, +d = lag">PRED.</th>
              {(d?.semanas ?? []).map((s, i) => (
                <th key={s.lunes} colSpan={7}
                  className="border border-k-border px-1 py-1 text-[10px] font-bold uppercase bg-red-900/30 text-red-200">
                  {i === 0 ? 'Esta semana' : `Semana +${i}`} · {fmtDia(s.lunes)} — {fmtDia(s.domingo)}
                </th>
              ))}
            </tr>
            <tr>
              {(d?.fechas ?? []).map((f, i) => (
                <th key={f} title={feriados.has(f) ? 'Feriado / día no laborable' : !laborable(f) ? 'Día no laborable (calendario)' : ''}
                  className={`border border-k-border/60 px-0.5 py-0.5 text-[9px] font-bold min-w-[44px] ${
                  f === hoy ? 'bg-green-500/20 text-k-green'
                    : !laborable(f) ? 'bg-zinc-700/50 text-k-text3 line-through'
                    : 'bg-k-raised text-k-text3'}`}>
                  {DIAS_1[i % 7]}<br />{fmtCorta(f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d?.grupos ?? []).map(g => (
              <GrupoOTM key={g.otm_id ?? '-'} grupo={g} fechas={d!.fechas} hoy={hoy}
                laborable={laborable} onEditar={onEditar} cadena={cadena}
                onCadena={id => setCadenaDe(v => (v === id ? null : id))}
                onReal={(actId, fecha, v) => guardarReal.mutate({ actId, fecha, v })} />
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
        Celda <span className="text-sky-300 font-bold">celeste</span> = PROGRAMADO (línea base: el metrado
        meta prorrateado entre los días laborables, saltando feriados y saltos ∅). Escribe encima el{' '}
        <b>avance real del día</b> (hasta hoy): la celda queda ✓ registrada en{' '}
        <span className="text-green-300 font-bold">verde</span> si avanzaste más,{' '}
        <span className="text-amber-300 font-bold">ámbar</span> justo lo programado,{' '}
        <span className="text-red-300 font-bold">rojo</span> menos — los días anteriores no se tocan y el{' '}
        <b>saldo se re-prorratea en los días siguientes</b> para cumplir el meta en F.Fin. El meta solo se
        cambia abriendo la actividad. El real alimenta el avance diario de <b>Valor Ganado</b> (un solo dato).
      </p>
    </div>
  )
}

function GrupoOTM({ grupo, fechas, hoy, laborable, cadena, onCadena, onEditar, onReal }: {
  grupo: GridResp['grupos'][number]; fechas: string[]; hoy: string
  laborable: (f: string) => boolean
  cadena: { focal: number; azules: Set<number>; violetas: Set<number> } | null
  onCadena: (id: number) => void
  onEditar: (a: ActGrid) => void
  onReal: (actId: number, fecha: string, v: number | null) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={7 + fechas.length}
          className="border border-k-border px-2 py-1 text-[11px] font-bold bg-blue-500/15 text-k-blue sticky left-0">
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => {
        const editable = a.estado !== 'CANCELADO'
        const saltos = new Set(a.dias_salto ?? [])
        const medios = new Set(a.dias_medio ?? [])
        // Resaltado de cadena: focal normal, antecesoras azul, sucesoras violeta, resto atenuado
        const claseCadena = !cadena ? ''
          : cadena.focal === a.id ? 'ring-1 ring-inset ring-amber-500/50'
          : cadena.azules.has(a.id) ? 'bg-blue-500/10'
          : cadena.violetas.has(a.id) ? 'bg-violet-500/10'
          : 'opacity-30'
        return (
          <tr key={a.id} className={`${a.estado === 'CANCELADO' ? 'opacity-50' : ''} ${claseCadena}`}>
            <td onClick={() => onEditar(a)}
              className={`${tdFijo} sticky left-0 z-10 cursor-pointer hover:bg-k-raised align-top`}
              title={`${a.titulo}${a.partida_desc ? `\n📌 ${a.partida_codigo} — ${a.partida_desc}` : ''}\n(clic para editar: meta, fechas, saltos, antecesoras, restricciones)`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
                <span className="text-[8px] font-mono text-k-text3 flex-shrink-0">#{a.id}</span>
                <span className="text-k-text leading-tight">{a.titulo}</span>
                {(a.rest_pend ?? 0) > 0 && <span className="text-[9px] font-bold text-k-red flex-shrink-0">⛔{a.rest_pend}</span>}
                {(a.dep_total ?? 0) > 0 && (
                  <button onClick={e => { e.stopPropagation(); onCadena(a.id) }}
                    title={`${a.dep_total} vínculo(s) — clic para resaltar la cadena (azul = antecesoras, violeta = sucesoras)`}
                    className={`text-[9px] font-bold flex-shrink-0 px-1 rounded ${
                      cadena?.focal === a.id ? 'bg-amber-500/20 text-k-amber' : 'text-k-blue hover:bg-k-raised'}`}>
                    🔗{a.dep_total}
                  </button>
                )}
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
            <td className={`${tdFijo} text-center text-k-text2`}>
              {a.supervisor_nombre?.split(' ')[0] || a.responsable || '—'}
            </td>
            <td className={`${tdFijo} text-center align-middle`}
              title="Metrado META — solo se cambia abriendo la actividad">
              <div className="font-mono font-bold text-k-text">{a.metrado_prog != null ? num(a.metrado_prog) : '—'}</div>
              {a.metrado_base != null && (
                <div className="text-[9px] text-k-text3" title="Metrado presupuestado de la partida · saldo por ejecutar">
                  base {num(a.metrado_base)}{a.saldo != null ? ` · saldo ${num(a.saldo)}` : ''}
                </div>
              )}
            </td>
            <td className={`${tdFijo} text-center text-k-text2`}>{a.und ?? '—'}</td>
            <td className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(a.fecha)}</td>
            <td className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(a.fecha_fin)}</td>
            <td className={`${tdFijo} text-center font-mono text-[9px] text-k-text2`}
              title={(a.predecesoras ?? []).map(p => `#${p.id} ${p.titulo} (termina ${fmtCorta(p.fecha_fin)}${p.lag_dias ? `, lag ${p.lag_dias}d` : ''})`).join('\n') || 'Sin antecesoras'}>
              {(a.predecesoras ?? []).map(p => `${p.id}FS${p.lag_dias ? `+${p.lag_dias}d` : ''}`).join(', ') || '—'}
            </td>
            {fechas.map(f => (
              <CeldaDia key={f} prog={a.prog[f]} real={a.real[f]}
                esSalto={saltos.has(f)} esMedio={medios.has(f)} laborable={laborable(f)}
                editable={editable && !!a.partida_id && f <= hoy}
                onRegistrar={v => onReal(a.id, f, v)} />
            ))}
          </tr>
        )
      })}
    </>
  )
}

// ── F030b: evaluación de la semana (comprometido vs alcanzado) ──
export function EvaluacionSemanal() {
  const qc = useQueryClient()
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid', lunes, 1],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${lunes}&semanas=1`),
  })
  // Causa de no cumplimiento según el PLANNER (separada de la de campo).
  const causaPlanner = useMutation({
    mutationFn: ({ actId, cat, detalle }: { actId: number; cat: string | null; detalle: string | null }) =>
      api(`/ev/programacion/actividades/${actId}`, {
        method: 'PUT',
        body: JSON.stringify({ causa_nc_planner_cat: cat, causa_nc_planner: detalle }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lookahead-grid'] }),
    onError: (e: Error) => alert(e.message),
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
              <th className={`${thBase} text-left min-w-[160px]`}>CAUSA (CAMPO)</th>
              <th className={`${thBase} text-left min-w-[200px]`}>CAUSA (PLANNER)</th>
            </tr>
          </thead>
          <tbody>
            {(d?.grupos ?? []).map(g => (
              <EvalGrupo key={g.otm_id ?? '-'} grupo={g} fechas={fechas} cumplimiento={cumplimiento}
                onCausaPlanner={(actId, cat, detalle) => causaPlanner.mutate({ actId, cat, detalle })} />
            ))}
            {(d?.grupos ?? []).length === 0 && !grid.isLoading && (
              <tr><td colSpan={8 + fechas.length} className="px-4 py-6 text-center text-k-text3">Semana sin actividades programadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
        Por día: <span className="text-sky-300">programado</span> / real (<span className="text-green-300">verde</span> más,{' '}
        <span className="text-amber-300">ámbar</span> igual, <span className="text-red-300">rojo</span> menos que lo programado).
        COMPROM. = metrado comprometido de la semana · ALCANZ. = metrado real registrado (avance diario del EV).
        CAUSA (CAMPO) la reporta el supervisor; CAUSA (PLANNER) la depura oficina — en el Pareto de
        PPC·Causas manda la del planner y, si no existe, cuenta la de campo.
      </p>
    </div>
  )
}

function EvalGrupo({ grupo, fechas, cumplimiento, onCausaPlanner }: {
  grupo: GridResp['grupos'][number]; fechas: string[]
  cumplimiento: (a: ActGrid) => string[]
  onCausaPlanner: (actId: number, cat: string | null, detalle: string | null) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={8 + fechas.length} className="border border-k-border px-2 py-1 font-bold bg-blue-500/15 text-k-blue">
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
                {(a.prog[f] ?? 0) > 0 && <div className="text-sky-300">{num(a.prog[f])}</div>}
                {a.real[f] != null && <div className={clrReal(a.real[f], a.prog[f]).replace(/bg-\S+/g, '')}>{num(a.real[f])}</div>}
              </td>
            ))}
            <td className={`${tdFijo} text-center font-mono font-bold text-sky-300`}>{comprom > 0 ? num(comprom) : '—'}</td>
            <td className={`${tdFijo} text-center font-mono font-bold ${
              alcanz <= 0 ? 'text-k-text3' : alcanz > comprom + 0.0005 ? 'text-green-300' : alcanz >= comprom - 0.0005 ? 'text-amber-300' : 'text-red-300'}`}>
              {alcanz > 0 ? num(alcanz) : '—'}</td>
            <td className={`${tdFijo} text-center font-bold ${clr}`}>{cumpl}</td>
            <td className={`${tdFijo} text-k-red/90`}>
              {a.estado === 'NO_CUMPLIDA'
                ? `${CNC[a.causa_nc_cat ?? ''] ?? ''}${a.causa_nc ? ` — ${a.causa_nc}` : ''}`
                : ''}
            </td>
            <td className="border border-k-border px-1 py-0.5">
              <div className="flex gap-1 items-center">
                <select value={a.causa_nc_planner_cat ?? ''}
                  onChange={e => onCausaPlanner(a.id, e.target.value || null, a.causa_nc_planner ?? null)}
                  className="bg-k-raised border border-k-border rounded px-1 py-0.5 text-[10px] text-k-text2 outline-none max-w-[110px]">
                  <option value="">—</option>
                  {Object.entries(CNC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input key={a.causa_nc_planner ?? ''} defaultValue={a.causa_nc_planner ?? ''}
                  placeholder="detalle…"
                  onBlur={e => { const v = e.target.value.trim() || null; if (v !== (a.causa_nc_planner ?? null)) onCausaPlanner(a.id, a.causa_nc_planner_cat ?? null, v) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="bg-transparent border-b border-k-border/60 text-[10px] text-k-text2 outline-none w-24 focus:border-k-amber" />
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
