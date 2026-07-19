// Lookahead tipo Excel — réplica del "Anexo 01 - LookAhead" del ex-gerente:
// filas = actividades agrupadas por proyecto, columnas = días de N semanas.
// Cada actividad tiene 2 filas: PROG (metrado programado por día, celdas
// verdes, editables) y REAL (metrado ejecutado, celdas azules — escribe en
// ev_avances_diarios, la MISMA tabla del módulo de Valor Ganado).
// EvaluacionSemanal = el formato "F030b - Planeamiento" (comprometido vs
// alcanzado de la semana, con cumplimiento SI/NO y causa).
import { Fragment, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Printer } from 'lucide-react'
import { api } from '@/lib/api'
import { CNC } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'
import { DIAS_1, fmtDia, fmtCorta, num, isoDow, clrReal } from '@/lib/lookahead'
import CeldaDia from '@/components/CeldaDia'

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
  hito_id?: number | null; hito_desc?: string | null; hito_peso?: number | null
  dias_salto?: string[]; dias_medio?: string[]
  predecesoras?: { id: number; dep_id: number; titulo: string; fecha_fin: string; lag_dias: number }[]
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

const ESTADO_DOT: Record<string, string> = {
  PROGRAMADO: 'bg-amber-400', EJECUTADO: 'bg-green-500',
  CANCELADO: 'bg-zinc-500', NO_CUMPLIDA: 'bg-red-500',
}

const PROYECTO_ID = 1
const thBase = 'border border-k-border px-1 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'
const tdFijo = 'border border-k-border px-2 py-1 text-[11px] bg-k-surface'

export function LookaheadGrid({ onEditar }: { onEditar: (a: ActGrid) => void }) {
  const qc = useQueryClient()
  const [nSemanas, setNSemanas] = useState(4)
  const [desde, setDesde] = useState(() => iso(lunesDe(new Date())))
  // Cadena resaltada (clic en 🔗): antecesoras en azul, sucesoras en violeta.
  const [cadenaDe, setCadenaDe] = useState<number | null>(null)
  // Modo Vincular (clic-clic): 1er clic = la que va PRIMERO, 2º = la que sigue.
  const [vincular, setVincular] = useState<{ on: boolean; primera: number | null }>({ on: false, primera: null })
  // Panel lateral de dependencias de una actividad (clic en 🔗 o en un chip PRED).
  const [panelDe, setPanelDe] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; error?: boolean } | null>(null)
  // Mostrar relaciones: al pasar el mouse por una actividad vinculada se
  // resalta su cadena (azul = antecesoras, verde = sucesoras) sin hacer clic.
  const [mostrarRel, setMostrarRel] = useState(true)
  const [hoverDe, setHoverDe] = useState<number | null>(null)

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
  const borrarDep = useMutation({
    mutationFn: (depId: number) => api(`/ev/programacion/dependencias/${depId}`, { method: 'DELETE' }),
    onSuccess: () => { setToast({ msg: 'Vínculo eliminado' }); invalidar() },
    onError: (e: Error) => setToast({ msg: e.message, error: true }),
  })
  // POST upsertea: mismo par (sucesora, antecesora) solo actualiza el lag.
  const crearDep = useMutation({
    mutationFn: ({ suc, pred, lag }: { suc: number; pred: number; lag?: number }) =>
      api(`/ev/programacion/actividades/${suc}/dependencias`, {
        method: 'POST', body: JSON.stringify({ predecesora_id: pred, lag_dias: lag ?? 0 }),
      }),
    onSuccess: (j: unknown, vars) => {
      const r = j as { id?: number; movidas?: number[] }
      setToast({
        msg: vars.lag != null
          ? 'Lag actualizado'
          : `✓ Vinculada (FS)${r.movidas?.length ? ` · la cascada movió ${r.movidas.length} actividad(es)` : ''}`,
        undo: vars.lag == null && r.id ? () => { borrarDep.mutate(r.id!); setToast(null) } : undefined,
      })
      invalidar()
    },
    onError: (e: Error) => setToast({ msg: e.message, error: true }),
  })
  // Edición rápida desde el panel lateral: metrado / F.Inicio / F.Fin.
  // El PUT re-prorratea y dispara la cascada FS si el rango cambió.
  const editarAct = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api(`/ev/programacion/actividades/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: (j: unknown) => {
      const m = (j as { movidas?: number[] })?.movidas
      setToast({ msg: `✓ Actividad actualizada${m?.length ? ` · la cascada movió ${m.length} actividad(es)` : ''}` })
      invalidar()
    },
    onError: (e: Error) => setToast({ msg: e.message, error: true }),
  })
  // Clic-clic: el 2º clic crea el FS y esa actividad pasa a ser la nueva
  // "primera" — clics sucesivos van encadenando 1→2→3→4 sin reabrir nada.
  const pick = (id: number) => {
    if (vincular.primera == null || vincular.primera === id) {
      setVincular({ on: true, primera: id }); return
    }
    crearDep.mutate({ suc: id, pred: vincular.primera })
    setVincular({ on: true, primera: id })
  }
  useEffect(() => {
    if (!toast || toast.error) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setVincular({ on: false, primera: null }); setPanelDe(null)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
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
  // El clic (cadenaDe) manda; si no hay, el hover con «Mostrar relaciones».
  const cadena = (() => {
    const focalId = cadenaDe ?? (mostrarRel ? hoverDe : null)
    if (focalId == null || !d) return null
    const acts = d.grupos.flatMap(g => g.actividades)
    const porId = new Map(acts.map(a => [a.id, a]))
    const azules = new Set<number>(); const verdes = new Set<number>()
    const subir = [focalId]
    while (subir.length) {
      const a = porId.get(subir.pop()!)
      for (const p of a?.predecesoras ?? []) if (!azules.has(p.id)) { azules.add(p.id); subir.push(p.id) }
    }
    const bajar = [focalId]
    while (bajar.length) {
      const a = porId.get(bajar.pop()!)
      for (const s of a?.sucesoras ?? []) if (!verdes.has(s)) { verdes.add(s); bajar.push(s) }
    }
    return { focal: focalId, azules, verdes }
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
        <button onClick={() => { setVincular(v => v.on ? { on: false, primera: null } : { on: true, primera: null }); setPanelDe(null) }}
          title="Vincular actividades con dos clics: primero la que va PRIMERO, luego la que sigue (FS). Esc para salir."
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border font-bold ${
            vincular.on ? 'border-amber-500/60 bg-amber-500/15 text-k-amber' : 'border-k-border bg-k-raised text-k-text2 hover:bg-k-border'}`}>
          🔗 Vincular
        </button>
        <label className="flex items-center gap-1.5 text-xs text-k-text2 px-2.5 py-2 rounded-lg border border-k-border bg-k-raised cursor-pointer select-none"
          title="Al pasar el mouse por una actividad vinculada se resalta su cadena: azul = antecesoras, verde = sucesoras">
          <input type="checkbox" checked={mostrarRel} onChange={e => setMostrarRel(e.target.checked)}
            className="accent-amber-500" />
          Mostrar relaciones
        </label>
        {grid.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
        {desde < iso(lunesDe(new Date())) && (
          <span className="text-[11px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            ⏪ Semana pasada — puedes registrar avances y programar retroactivamente
          </span>
        )}
      </div>

      {vincular.on && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          🔗 Modo Vincular:{' '}
          {vincular.primera == null
            ? 'clic en la actividad que va PRIMERO…'
            : `#${vincular.primera} elegida — ahora clic en la que va DESPUÉS (los clics siguientes van encadenando)`}
          <button onClick={() => setVincular({ on: false, primera: null })}
            className="ml-auto text-[11px] px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/15">Salir (Esc)</button>
        </div>
      )}

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
              <th className={`${thBase} min-w-[110px]`} rowSpan={2}
                title="Después de qué actividad(es) puede empezar (FS = Fin→Inicio). Clic en un chip abre el panel de vínculos; usa el botón 🔗 Vincular para crear nuevos con dos clics">DESPUÉS DE</th>
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
                onCadena={id => { setCadenaDe(v => (v === id ? null : id)); setPanelDe(v => (v === id ? null : id)) }}
                vincular={vincular} onPick={pick}
                onPanel={id => { setPanelDe(id); setCadenaDe(id) }}
                onHover={setHoverDe}
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
        Una partida <b>desplegada por etapas</b> se agrupa bajo una cabecera con su color de cadena:
        clic en la cabecera para <b>compactarla en una sola fila</b> (suma el programado y el real de sus
        etapas, solo lectura) y clic de nuevo para desplegarla y editar. Para vincular actividades usa el
        botón <b>🔗 Vincular</b> (dos clics: primero la que va antes, luego la que sigue) — la columna
        DESPUÉS DE muestra los vínculos y el chip abre el panel para editarlos.
      </p>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl ${
          toast.error ? 'border-red-500/50 bg-red-950 text-red-200' : 'border-k-border bg-k-surface text-k-text'}`}>
          {toast.msg}
          {toast.undo && (
            <button onClick={toast.undo}
              className="text-xs font-bold px-2 py-1 rounded border border-k-border text-k-amber hover:bg-k-raised">Deshacer</button>
          )}
          <button onClick={() => setToast(null)} className="text-k-text3 hover:text-k-text">✕</button>
        </div>
      )}

      {panelDe != null && d && (
        <PanelDeps actId={panelDe} data={d}
          onCerrar={() => { setPanelDe(null); setCadenaDe(null) }}
          onIr={id => { setPanelDe(id); setCadenaDe(id) }}
          onCrear={(suc, pred) => crearDep.mutate({ suc, pred })}
          onLag={(suc, pred, lag) => crearDep.mutate({ suc, pred, lag })}
          onQuitar={depId => borrarDep.mutate(depId)}
          onGuardarAct={(id, patch) => editarAct.mutate({ id, patch })} />
      )}
    </div>
  )
}

// ── Panel «Dependencias» (grafo estilo Panel Maestro, elección de Jean) ──
// Cadena visual: ● PREDECESORAS (azul) ↓ actividad seleccionada (ámbar) ↓
// ● SUCESORAS (verde). Clic en una tarjeta = ver/editar ese vínculo en
// «Detalles de la dependencia»; ⤢ = centrar el grafo en esa actividad.
// El metrado y las fechas de la actividad se editan aquí mismo (Enter o
// salir del campo guarda; el API re-prorratea y corre la cascada FS).

interface DepSel {
  dep_id: number; lag: number; predId: number; sucId: number
  predTitulo: string; sucTitulo: string
}
interface Nodo { id: number; titulo: string; a?: ActGrid; dep: DepSel | null }

// Campo editable con commit al salir (mismo patrón no-controlado de CeldaDia).
function CampoAct({ etiqueta, tipo, valor, onCommit }: {
  etiqueta: string; tipo: 'text' | 'date'; valor: string
  onCommit: (v: string) => void
}) {
  return (
    <label className="text-[9px] text-k-text3 flex flex-col gap-0.5 min-w-0">
      {etiqueta}
      <input key={valor} type={tipo} defaultValue={valor}
        inputMode={tipo === 'text' ? 'decimal' : undefined}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onBlur={e => { const v = e.target.value.trim(); if (v !== valor) onCommit(v) }}
        className="w-full bg-k-void border border-k-border rounded-lg px-1.5 py-1 text-[11px] text-k-text outline-none focus:border-k-amber" />
    </label>
  )
}

function PanelDeps({ actId, data, onCerrar, onIr, onCrear, onLag, onQuitar, onGuardarAct }: {
  actId: number; data: GridResp
  onCerrar: () => void; onIr: (id: number) => void
  onCrear: (suc: number, pred: number) => void
  onLag: (suc: number, pred: number, lag: number) => void
  onQuitar: (depId: number) => void
  onGuardarAct: (id: number, patch: Record<string, unknown>) => void
}) {
  const [sel, setSel] = useState<DepSel | null>(null)
  const [agregar, setAgregar] = useState<'pred' | 'suc' | null>(null)
  const [busca, setBusca] = useState('')
  const acts = data.grupos.flatMap(g => g.actividades)
  const porId = new Map(acts.map(a => [a.id, a]))
  const focal = porId.get(actId)
  if (!focal) return null

  // Cadena hacia ARRIBA: sube mientras haya UNA sola predecesora directa
  // (vista lineal como la imagen); con varias, se muestran en paralelo y
  // ahí se detiene la subida.
  const nivelesUp: Nodo[][] = []
  let cur: ActGrid | undefined = focal
  for (let i = 0; i < 8 && cur; i++) {
    const abajo: ActGrid = cur
    const ps = abajo.predecesoras ?? []
    if (!ps.length) break
    nivelesUp.unshift(ps.map(p => ({
      id: p.id, titulo: p.titulo, a: porId.get(p.id),
      dep: { dep_id: p.dep_id, lag: p.lag_dias, predId: p.id, sucId: abajo.id,
             predTitulo: p.titulo, sucTitulo: abajo.titulo },
    })))
    cur = ps.length === 1 ? porId.get(ps[0].id) : undefined
  }
  // Cadena hacia ABAJO, con la misma regla.
  const nivelesDown: Nodo[][] = []
  cur = focal
  for (let i = 0; i < 8 && cur; i++) {
    const arriba: ActGrid = cur
    const ids = arriba.sucesoras ?? []
    if (!ids.length) break
    nivelesDown.push(ids.map(id => {
      const sa = porId.get(id)
      const dp = sa?.predecesoras?.find(p => p.id === arriba.id)
      return {
        id, titulo: sa?.titulo ?? `#${id}`, a: sa,
        dep: dp ? { dep_id: dp.dep_id, lag: dp.lag_dias, predId: arriba.id, sucId: id,
                    predTitulo: arriba.titulo, sucTitulo: sa?.titulo ?? `#${id}` } : null,
      }
    }))
    cur = ids.length === 1 ? porId.get(ids[0]) : undefined
  }

  const vinculadas = new Set([actId, ...(focal.predecesoras ?? []).map(p => p.id), ...(focal.sucesoras ?? [])])
  const q = busca.trim().toLowerCase()
  const candidatas = acts.filter(a => !vinculadas.has(a.id)
    && (!q || a.titulo.toLowerCase().includes(q) || String(a.id) === q)).slice(0, 30)

  const Tarjeta = ({ n, clr }: { n: Nodo; clr: 'azul' | 'verde' }) => {
    const activa = sel != null && n.dep != null && n.dep.dep_id === sel.dep_id
    const base = clr === 'azul'
      ? 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20'
      : 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20'
    return (
      <div onClick={() => n.dep && setSel(activa ? null : n.dep)}
        title={n.dep ? 'Clic: ver y editar este vínculo en «Detalles de la dependencia»' : 'Actividad fuera del rango visible del grid'}
        className={`rounded-lg border px-2.5 py-1.5 cursor-pointer flex-1 min-w-[130px] ${base} ${activa ? 'ring-2 ring-amber-400/70' : ''}`}>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-k-text truncate flex-1">{n.titulo}</span>
          {n.a && (
            <button onClick={e => { e.stopPropagation(); setSel(null); onIr(n.id) }}
              title="Centrar el grafo en esta actividad"
              className="text-[10px] text-k-text3 hover:text-k-text flex-shrink-0">⤢</button>
          )}
        </div>
        <p className="text-[9px] text-k-text3">
          FS +{n.dep?.lag ?? 0}d{n.a ? ` · ${fmtCorta(n.a.fecha)} → ${fmtCorta(n.a.fecha_fin)}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[360px] bg-k-surface border-l border-k-border shadow-2xl flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-k-border">
        <p className="text-sm font-bold text-k-text">Dependencias</p>
        <button onClick={onCerrar} className="ml-auto text-k-text3 hover:text-k-text">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        <div>
          <p className="text-[10px] text-k-text3 mb-1">Actividad seleccionada</p>
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[focal.estado] ?? 'bg-zinc-500'}`} />
              <p className="text-[12px] font-bold text-k-text truncate">{focal.titulo}</p>
            </div>
            {focal.partida_codigo && (
              <p className="text-[9px] text-k-text3 font-mono">📌 {focal.partida_codigo}{focal.und ? ` · ${focal.und}` : ''}</p>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              <CampoAct etiqueta={`Metrado${focal.und ? ` (${focal.und})` : ''}`} tipo="text"
                valor={focal.metrado_prog != null ? String(focal.metrado_prog) : ''}
                onCommit={v => {
                  if (v === '') { onGuardarAct(focal.id, { metrado_prog: null }); return }
                  const m = Number(v)
                  if (Number.isFinite(m) && m >= 0) onGuardarAct(focal.id, { metrado_prog: m })
                }} />
              <CampoAct etiqueta="F. Inicio" tipo="date" valor={focal.fecha}
                onCommit={v => { if (v) onGuardarAct(focal.id, { fecha: v }) }} />
              <CampoAct etiqueta="F. Fin" tipo="date" valor={focal.fecha_fin}
                onCommit={v => { if (v) onGuardarAct(focal.id, { fecha_fin: v }) }} />
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-k-blue mb-1.5">● Predecesoras</p>
          {nivelesUp.length === 0 && (
            <p className="text-[11px] text-k-text3 mb-1.5">Ninguna: puede arrancar cuando se quiera.</p>
          )}
          <div className="space-y-1">
            {nivelesUp.map((nivel, i) => (
              <Fragment key={`u${i}`}>
                <div className="flex gap-1 flex-wrap">
                  {nivel.map(n => <Tarjeta key={n.id} n={n} clr="azul" />)}
                </div>
                <div className="text-center text-sm leading-none text-k-blue">↓</div>
              </Fragment>
            ))}
            <div className="rounded-lg border-2 border-amber-400/70 bg-amber-500/15 px-2.5 py-1.5">
              <p className="text-[11px] font-bold text-k-amber truncate">{focal.titulo}</p>
              <p className="text-[9px] text-k-text3">{fmtCorta(focal.fecha)} → {fmtCorta(focal.fecha_fin)}</p>
            </div>
          </div>
          <p className="text-[10px] uppercase font-bold text-green-400 mt-2 mb-1.5">● Sucesoras</p>
          {nivelesDown.length === 0 && (
            <p className="text-[11px] text-k-text3">Nada depende de esta actividad.</p>
          )}
          <div className="space-y-1">
            {nivelesDown.map((nivel, i) => (
              <Fragment key={`d${i}`}>
                <div className="text-center text-sm leading-none text-green-400">↓</div>
                <div className="flex gap-1 flex-wrap">
                  {nivel.map(n => <Tarjeta key={n.id} n={n} clr="verde" />)}
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <div>
          <div className="flex gap-1.5 mb-1.5">
            <button onClick={() => { setAgregar(v => v === 'pred' ? null : 'pred'); setBusca('') }}
              className={`text-[10px] px-2 py-1 rounded border font-bold ${
                agregar === 'pred' ? 'border-blue-500/50 bg-blue-500/15 text-k-blue' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
              + antecesora
            </button>
            <button onClick={() => { setAgregar(v => v === 'suc' ? null : 'suc'); setBusca('') }}
              className={`text-[10px] px-2 py-1 rounded border font-bold ${
                agregar === 'suc' ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
              + sucesora
            </button>
          </div>
          {agregar && (
            <div className="space-y-1.5">
              <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
                placeholder={`Buscar la ${agregar === 'pred' ? 'antecesora (la que va ANTES)' : 'sucesora (la que va DESPUÉS)'}…`}
                className="w-full bg-k-void border border-k-border rounded-lg px-2 py-1.5 text-[11px] text-k-text outline-none focus:border-k-amber" />
              <div className="max-h-44 overflow-y-auto space-y-1">
                {candidatas.map(cand => (
                  <button key={cand.id}
                    onClick={() => {
                      if (agregar === 'pred') onCrear(actId, cand.id)
                      else onCrear(cand.id, actId)
                      setAgregar(null)
                    }}
                    className="w-full text-left text-[11px] text-k-text2 rounded-lg border border-k-border px-2 py-1.5 hover:bg-k-raised">
                    {cand.titulo}
                    <span className="text-k-text3 block text-[9px]">{cand.otm_id ?? ''} · {fmtCorta(cand.fecha)} → {fmtCorta(cand.fecha_fin)}</span>
                  </button>
                ))}
                {candidatas.length === 0 && <p className="text-[10px] text-k-text3">Sin actividades en el rango visible que coincidan.</p>}
              </div>
            </div>
          )}
        </div>

        {sel && (
          <div className="rounded-xl border border-k-border bg-k-raised/40 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-k-text3">Detalles de la dependencia</p>
            <p className="text-[11px] text-k-text2">
              {sel.predTitulo} <span className="text-k-text3">→</span> {sel.sucTitulo}
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] items-center">
              <span className="text-k-text3">Tipo</span>
              <span className="text-k-text2">FS — Fin a Inicio</span>
              <span className="text-k-text3">Lag</span>
              <span className="flex items-center gap-1.5 text-k-text2">
                <input key={`${sel.dep_id}:${sel.lag}`} defaultValue={sel.lag} inputMode="numeric"
                  title="Días de espera tras el fin de la antecesora"
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  onBlur={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v) && v >= 0 && v !== sel.lag) onLag(sel.sucId, sel.predId, v)
                  }}
                  className="w-12 bg-k-void border border-k-border rounded px-1.5 py-0.5 text-[11px] text-k-text text-center outline-none focus:border-k-amber" />
                días
              </span>
            </div>
            <button onClick={() => { onQuitar(sel.dep_id); setSel(null) }}
              className="w-full text-[10px] font-bold px-2 py-1.5 rounded-lg border border-red-500/40 text-k-red hover:bg-red-500/10">
              🗑 Quitar este vínculo
            </button>
          </div>
        )}
      </div>
      <p className="px-4 py-2 text-[9px] text-k-text3 border-t border-k-border">
        FS: la sucesora arranca al terminar la antecesora (+lag). Mover una antecesora
        empuja a sus sucesoras automáticamente, nunca las adelanta.
      </p>
    </div>
  )
}
// Paleta de "cadenas" (inspiración Panel Maestro): cada partida desplegada
// por etapas recibe un color para identificar su flujo constructivo.
const PALETA_CADENA = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6']

type ItemGrid = { tipo: 'suelta'; a: ActGrid } | { tipo: 'partida'; pid: number; acts: ActGrid[] }

// Agrupa las actividades de la OTM: una partida con 2+ actividades (etapas
// desplegadas por hitos) se junta bajo una cabecera colapsable; el resto
// (actividades libres o de etapa única) queda como fila suelta.
function agruparPorPartida(acts: ActGrid[]): ItemGrid[] {
  const porPartida = new Map<number, ActGrid[]>()
  for (const a of acts) {
    if (!a.partida_id) continue
    const l = porPartida.get(a.partida_id) ?? []
    l.push(a); porPartida.set(a.partida_id, l)
  }
  const items: ItemGrid[] = []
  const vistas = new Set<number>()
  for (const a of acts) {
    const pid = a.partida_id
    if (pid && (porPartida.get(pid)?.length ?? 0) > 1) {
      if (!vistas.has(pid)) { vistas.add(pid); items.push({ tipo: 'partida', pid, acts: porPartida.get(pid)! }) }
    } else {
      items.push({ tipo: 'suelta', a })
    }
  }
  return items
}

interface Vincular { on: boolean; primera: number | null }

function GrupoOTM({ grupo, fechas, hoy, laborable, cadena, onCadena, onEditar, onReal, vincular, onPick, onPanel, onHover }: {
  grupo: GridResp['grupos'][number]; fechas: string[]; hoy: string
  laborable: (f: string) => boolean
  cadena: { focal: number; azules: Set<number>; verdes: Set<number> } | null
  onCadena: (id: number) => void
  onEditar: (a: ActGrid) => void
  onReal: (actId: number, fecha: string, v: number | null) => void
  vincular: Vincular; onPick: (id: number) => void; onPanel: (id: number) => void
  onHover: (id: number | null) => void
}) {
  // Partidas compactadas (▸): sus etapas se muestran en UNA sola fila agregada.
  const [compactas, setCompactas] = useState<Set<number>>(new Set())
  const toggle = (pid: number) => setCompactas(prev => {
    const s = new Set(prev); if (s.has(pid)) s.delete(pid); else s.add(pid); return s
  })
  const items = agruparPorPartida(grupo.actividades)
  const idxCadena = new Map<number, number>()
  for (const it of items) if (it.tipo === 'partida') idxCadena.set(it.pid, idxCadena.size)
  return (
    <>
      <tr>
        <td colSpan={7 + fechas.length}
          className="border border-k-border px-2 py-1 text-[11px] font-bold bg-blue-500/15 text-k-blue sticky left-0">
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {items.map(it => {
        if (it.tipo === 'suelta') {
          return <FilaActividad key={it.a.id} a={it.a} fechas={fechas} hoy={hoy}
            laborable={laborable} cadena={cadena} onCadena={onCadena}
            onEditar={onEditar} onReal={onReal}
            vincular={vincular} onPick={onPick} onPanel={onPanel} onHover={onHover} />
        }
        const color = PALETA_CADENA[(idxCadena.get(it.pid) ?? 0) % PALETA_CADENA.length]
        const compacta = compactas.has(it.pid)
        const a0 = it.acts[0]
        if (compacta) {
          return <FilaPartidaCompacta key={`p${it.pid}`} acts={it.acts} color={color}
            fechas={fechas} laborable={laborable} onToggle={() => toggle(it.pid)} />
        }
        return (
          <Fragment key={`p${it.pid}`}>
            <tr>
              <td colSpan={7 + fechas.length} onClick={() => toggle(it.pid)}
                title="Partida desplegada por etapas (hitos) — clic para compactarla en una sola fila"
                className="border border-k-border px-2 py-1 text-[10px] font-bold sticky left-0 cursor-pointer hover:bg-k-raised/60"
                style={{ borderLeft: `3px solid ${color}`, background: `${color}14` }}>
                <span className="text-k-text2">▾</span>{' '}
                <span style={{ color }}>●</span>{' '}
                <span className="text-k-text">{a0.partida_codigo} — {a0.partida_desc}</span>{' '}
                <span className="text-k-text3 font-normal">· {it.acts.length} etapas · clic para compactar</span>
              </td>
            </tr>
            {it.acts.map(a => (
              <FilaActividad key={a.id} a={a} fechas={fechas} hoy={hoy}
                laborable={laborable} cadena={cadena} onCadena={onCadena}
                onEditar={onEditar} onReal={onReal} color={color}
                vincular={vincular} onPick={onPick} onPanel={onPanel} onHover={onHover} />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

// Fila única de una partida COMPACTADA: agrega el programado y el real de
// todas sus etapas por día (solo lectura — para editar, despliega con ▸).
function FilaPartidaCompacta({ acts, color, fechas, laborable, onToggle }: {
  acts: ActGrid[]; color: string; fechas: string[]
  laborable: (f: string) => boolean; onToggle: () => void
}) {
  const a0 = acts[0]
  const progAgg: Record<string, number> = {}
  const realAgg: Record<string, number> = {}
  for (const a of acts) {
    for (const [f, v] of Object.entries(a.prog)) progAgg[f] = (progAgg[f] ?? 0) + v
    for (const [f, v] of Object.entries(a.real)) realAgg[f] = (realAgg[f] ?? 0) + v
  }
  const totalMeta = acts.reduce((s, a) => s + (a.metrado_prog ?? 0), 0)
  const totalReal = acts.reduce((s, a) => s + (a.acum_real ?? 0), 0)
  const ejecutadas = acts.filter(a => a.estado === 'EJECUTADO').length
  const fIni = acts.reduce((m, a) => (a.fecha < m ? a.fecha : m), acts[0].fecha)
  const fFin = acts.reduce((m, a) => (a.fecha_fin > m ? a.fecha_fin : m), acts[0].fecha_fin)
  const conFS = acts.some(a => (a.predecesoras ?? []).length > 0)
  return (
    <tr>
      <td onClick={onToggle}
        className={`${tdFijo} sticky left-0 z-10 cursor-pointer hover:bg-k-raised align-top`}
        style={{ borderLeft: `3px solid ${color}` }}
        title={'Partida compactada: la fila suma el programado y el real de todas sus etapas.\nClic para desplegar las etapas (y poder editar los avances).'}>
        <div className="flex items-center gap-1.5">
          <span className="text-k-text2">▸</span>
          <span style={{ color }}>●</span>
          <span className="text-k-text leading-tight font-bold">{a0.partida_codigo} — {a0.partida_desc}</span>
        </div>
        <div className="text-[9px] text-k-text3 pl-3.5">
          ◆ {acts.length} etapas compactadas · {ejecutadas}/{acts.length} ✓
        </div>
      </td>
      <td className={`${tdFijo} text-center text-k-text2`}>
        {a0.supervisor_nombre?.split(' ')[0] || a0.responsable || '—'}
      </td>
      <td className={`${tdFijo} text-center align-middle`}
        title="Σ metrado meta de las etapas · Σ real anotado">
        <div className="font-mono font-bold text-k-text">{totalMeta > 0 ? num(totalMeta) : '—'}</div>
        {totalMeta > 0 && (
          <div className="text-[9px] text-k-text3">Σ etapas · saldo {num(Math.max(totalMeta - totalReal, 0))}</div>
        )}
      </td>
      <td className={`${tdFijo} text-center text-k-text2`}>{a0.und ?? '—'}</td>
      <td className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(fIni)}</td>
      <td className={`${tdFijo} text-center font-mono text-[10px] text-k-text2`}>{fmtCorta(fFin)}</td>
      <td className={`${tdFijo} text-center font-mono text-[9px] text-k-text2`}
        title={conFS ? 'Las etapas están encadenadas FS (despliega para verlas)' : 'Sin antecesoras'}>
        {conFS ? '⛓ FS' : '—'}
      </td>
      {fechas.map(f => (
        <CeldaDia key={f} prog={progAgg[f]} real={realAgg[f]}
          esSalto={false} esMedio={false} laborable={laborable(f)}
          editable={false} onRegistrar={() => {}} />
      ))}
    </tr>
  )
}

function FilaActividad({ a, fechas, hoy, laborable, cadena, onCadena, onEditar, onReal, color, vincular, onPick, onPanel, onHover }: {
  a: ActGrid; fechas: string[]; hoy: string
  laborable: (f: string) => boolean
  cadena: { focal: number; azules: Set<number>; verdes: Set<number> } | null
  onCadena: (id: number) => void
  onEditar: (a: ActGrid) => void
  onReal: (actId: number, fecha: string, v: number | null) => void
  color?: string
  vincular: Vincular; onPick: (id: number) => void; onPanel: (id: number) => void
  onHover: (id: number | null) => void
}) {
        const editable = a.estado !== 'CANCELADO'
        const saltos = new Set(a.dias_salto ?? [])
        const medios = new Set(a.dias_medio ?? [])
        // Resaltado de cadena: focal normal, antecesoras azul, sucesoras violeta, resto atenuado
        const claseCadena = !cadena ? ''
          : cadena.focal === a.id ? 'ring-1 ring-inset ring-amber-500/50'
          : cadena.azules.has(a.id) ? 'bg-blue-500/10'
          : cadena.verdes.has(a.id) ? 'bg-green-500/10'
          : 'opacity-30'
        const esPrimera = vincular.on && vincular.primera === a.id
        return (
          <tr key={a.id} className={`${a.estado === 'CANCELADO' ? 'opacity-50' : ''} ${claseCadena} ${esPrimera ? 'bg-amber-500/15' : ''}`}
            onMouseEnter={() => onHover((a.dep_total ?? 0) > 0 ? a.id : null)}
            onMouseLeave={() => onHover(null)}>
            <td onClick={() => (vincular.on ? onPick(a.id) : onEditar(a))}
              className={`${tdFijo} sticky left-0 z-10 cursor-pointer hover:bg-k-raised align-top`}
              style={color ? { borderLeft: `3px solid ${color}` } : undefined}
              title={vincular.on
                ? (vincular.primera == null ? 'Clic: esta actividad va PRIMERO'
                  : esPrimera ? 'Elegida como la que va primero'
                  : `Clic: esta va DESPUÉS de #${vincular.primera}`)
                : `${a.titulo}${a.partida_desc ? `\n📌 ${a.partida_codigo} — ${a.partida_desc}` : ''}\n(clic para editar: meta, fechas, saltos, antecesoras, restricciones)`}>
              <div className={`flex items-center gap-1.5${color ? ' pl-2' : ''}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
                <span className="text-[8px] font-mono text-k-text3 flex-shrink-0">#{a.id}</span>
                <span className="text-k-text leading-tight">{a.titulo}</span>
                {(a.rest_pend ?? 0) > 0 && <span className="text-[9px] font-bold text-k-red flex-shrink-0">⛔{a.rest_pend}</span>}
                {(a.dep_total ?? 0) > 0 && (
                  <button onClick={e => { e.stopPropagation(); onCadena(a.id) }}
                    title={`${a.dep_total} vínculo(s) — clic para resaltar la cadena (azul = antecesoras, verde = sucesoras)`}
                    className={`text-[9px] font-bold flex-shrink-0 px-1 rounded ${
                      cadena?.focal === a.id ? 'bg-amber-500/20 text-k-amber' : 'text-k-blue hover:bg-k-raised'}`}>
                    🔗{a.dep_total}
                  </button>
                )}
              </div>
              {!color && a.partida_codigo && (
                <div className="text-[9px] text-k-text3 font-mono pl-3.5 truncate max-w-[240px]">
                  📌 {a.partida_codigo}{a.partida_desc ? ` · ${a.partida_desc.slice(0, 34)}` : ''}
                </div>
              )}
              {a.hito_desc && (
                <div className="text-[9px] text-violet-300/90 pl-3.5 truncate max-w-[240px]"
                  title="Etapa (hito) de la partida que programa esta actividad — su registro diario alimenta ese hito en el % EV">
                  ◆ Etapa: {a.hito_desc}{a.hito_peso != null ? ` (${Math.round(a.hito_peso * 100)}%)` : ''}
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
            <td className={`${tdFijo} align-middle`}>
              <div className="flex flex-col gap-0.5 items-stretch">
                {(a.predecesoras ?? []).map(p => (
                  <button key={p.dep_id} onClick={() => onPanel(a.id)}
                    title={`Después de: ${p.titulo} (termina ${fmtCorta(p.fecha_fin)}${p.lag_dias ? `, lag ${p.lag_dias}d` : ''}) — clic para editar el vínculo`}
                    className="text-left text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-k-blue truncate max-w-[110px] hover:bg-blue-500/20">
                    ↳ {p.titulo.slice(0, 15)}{p.lag_dias ? ` +${p.lag_dias}d` : ''}
                  </button>
                ))}
                {(a.predecesoras ?? []).length === 0 && (
                  <button onClick={() => onPanel(a.id)} title="Sin antecesoras — clic para vincular desde el panel"
                    className="text-[9px] text-k-text3 hover:text-k-text text-center">—</button>
                )}
              </div>
            </td>
            {fechas.map(f => (
              <CeldaDia key={f} prog={a.prog[f]} real={a.real[f]}
                esSalto={saltos.has(f)} esMedio={medios.has(f)} laborable={laborable(f)}
                editable={editable && !!a.partida_id && f <= hoy}
                onRegistrar={v => onReal(a.id, f, v)} />
            ))}
          </tr>
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
