// Lookahead tipo Excel — réplica del "Anexo 01 - LookAhead" del ex-gerente:
// filas = actividades agrupadas por proyecto, columnas = días de N semanas.
// Cada actividad tiene 2 filas: PROG (metrado programado por día, celdas
// verdes, editables) y REAL (metrado ejecutado, celdas azules — escribe en
// ev_avances_diarios, la MISMA tabla del módulo de Valor Ganado).
// EvaluacionSemanal = el formato "F030b - Planeamiento" (comprometido vs
// alcanzado de la semana, con cumplimiento SI/NO y causa).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Printer, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { CNC } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'
import { DIAS_1, fmtDia, fmtCorta, num, isoDow, clrRealTxt, parseDeps, fmtDeps, runsDeFila, tramosDeFila, numCorto } from '@/lib/lookahead'
import type { TipoDep } from '@/lib/lookahead'
import CeldaDia from '@/components/CeldaDia'
import AyudaLookahead from '@/components/AyudaLookahead'

export interface ActGrid {
  id: number; titulo: string; estado: string; descripcion?: string | null
  fecha: string; fecha_fin: string
  otm_id?: string | null; partida_id?: number | null
  partida_codigo?: string | null; partida_desc?: string | null
  partida_hh_presup?: number | null; partida_naturaleza?: string | null
  responsable?: string | null; supervisor_id?: string | null; supervisor_nombre?: string | null
  causa_nc?: string | null; causa_nc_cat?: string | null
  causa_nc_planner?: string | null; causa_nc_planner_cat?: string | null
  rest_pend?: number; rest_total?: number
  und?: string | null; metrado_prog?: number | null
  metrado_base?: number | null; acum_real?: number | null; saldo?: number | null
  hito_id?: number | null; hito_desc?: string | null; hito_peso?: number | null
  dias_salto?: string[]; dias_medio?: string[]
  plazo_dias?: number | null; modo_fecha?: string | null
  predecesoras?: { id: number; dep_id: number; titulo: string; fecha_fin: string
                   lag_dias: number; tipo?: string }[]
  sucesoras?: number[]; dep_total?: number
  prog: Record<string, number>; real: Record<string, number>
  prog_manual?: string[]
}
export interface GridResp {
  desde: string; hasta: string
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  fechas: string[]
  dias_semana?: number[]; feriados?: string[]
  grupos: { otm_id: string | null; otm_desc: string | null; actividades: ActGrid[] }[]
}

// Tanda 2 del sistema de color: PROGRAMADO deja de ser ámbar y pasa a
// «lo previsto». Con eso el ámbar queda para la ACCIÓN y deja de significar
// tres cosas a la vez.
const ESTADO_DOT: Record<string, string> = {
  PROGRAMADO: 'bg-k-plan', EJECUTADO: 'bg-k-green',
  CANCELADO: 'bg-zinc-500', NO_CUMPLIDA: 'bg-k-red',
}

const PROYECTO_ID = 1
const thBase = 'border border-k-border px-1 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'
const tdFijo = 'border border-k-border px-2 py-1 text-[11px] bg-k-surface'

// ── Inmovilizar paneles (pedido del planner: la fila de fechas SIEMPRE visible)
// El ancho de cada columna de la izquierda es fijo para poder calcular el
// desplazamiento acumulado del `sticky left`. El orden es el de la cabecera.
const ANCHOS = [42, 240, 80, 72, 40, 58, 58, 58, 120] as const   // # · ACT · RESP · METRADO · UND · PLAZO · F.Inic · F.Fin · DESPUÉS DE
const IZQ = ANCHOS.map((_, i) => ANCHOS.slice(0, i).reduce((s, w) => s + w, 0))
const N_FIJAS = ANCHOS.length
/** Columnas siempre congeladas: el # y el nombre (sin ellos no se sabe qué fila
 *  se está leyendo). El resto se congela solo con «⇥ Fijar columnas», porque
 *  las 9 juntas se comen media pantalla. */
const stick = (i: number, fijar: boolean): React.CSSProperties | undefined => {
  const base = { minWidth: ANCHOS[i], width: ANCHOS[i] }
  if (i <= 1) return { position: 'sticky', left: IZQ[i], zIndex: 10, ...base }
  if (!fijar) return undefined
  // «Fijar columnas» congela # · ACTIVIDADES · DESPUÉS DE (encargo de Jean):
  // son las tres que hacen falta para leer una fila cuando el scroll está en
  // una semana lejana — qué es, y de qué depende. DESPUÉS DE se pega JUSTO
  // detrás de ACTIVIDADES y las columnas intermedias (resp/metrado/fechas)
  // pasan por debajo, que es lo que deja sitio para las fechas.
  if (i === 8) return { position: 'sticky', left: IZQ[2], zIndex: 11, ...base }
  return undefined
}
/** Alto de la 1ª fila de cabecera (SEMANA); la 2ª (días) se pega debajo. */
/** Rótulo de una fila de agrupación (proyecto / partida). La celda lleva
 *  colSpan y por tanto ya ocupa todo el ancho: el `sticky` tiene que ir en el
 *  contenido para que el texto no se vaya con el scroll horizontal. */
const ROTULO: React.CSSProperties = {
  position: 'sticky', left: 8, width: 'fit-content', maxWidth: '100%',
}
/** Dos problemas que hay que ver a la primera, ambos en rojo:
 *  · metrado SIN partida → no se puede anotar el avance, no suma al valor
 *    ganado y el PPC la cuenta como no cumplida aunque el trabajo se haga;
 *  · partida sin HH presupuestadas → normalmente un ADICIONAL al que todavía
 *    no le llegó el dato (se sabe al aprobarlo o al terminarlo). */
const motivoRevisar = (a: ActGrid): string | null => {
  if ((a.metrado_prog ?? 0) > 0 && !a.partida_id)
    return 'Tiene metrado pero NO tiene partida: no se puede registrar su avance real, no suma al valor ganado y el PPC la contará como no cumplida.\nÁbrela y elige la partida, o bórrale el metrado si es una actividad de apoyo.'
  if (a.partida_id && (a.partida_hh_presup ?? 0) <= 0)
    return `A la partida${a.partida_naturaleza === 'ADICIONAL' ? ' (ADICIONAL)' : ''} le faltan las HH presupuestadas.\nHasta cargarlas, el trabajo consume horas sin ganar ninguna: el rendimiento sale castigado.\nCárgalas en Valor Ganado → Partidas cuando tengas el dato.`
  return null
}
const porRevisar = (a: ActGrid) => motivoRevisar(a) !== null

const H_SEM = 22
// Dock inferior de dependencias: plegado deja solo la franja de datos
// editables; desplegado agrega el grafo. El grid se acorta lo mismo que mide,
// así nunca queda una fila tapada.
const ALTO_FRANJA = 52         // franja de datos (metrado, fechas, supervisor…)
const ALTO_CHIPS = 34          // franja de los días del rango (∅ / ◐)
const ALTO_DOCK = 278
const ALTO_DOCK_MIN = ALTO_FRANJA + ALTO_CHIPS
// El borde de una celda `sticky` se va con el scroll cuando la tabla usa
// border-collapse; el inset box-shadow lo reemplaza y no se despega.
const thSticky = (top: number, z = 30): React.CSSProperties => ({
  position: 'sticky', top, zIndex: z,
  boxShadow: 'inset 0 -1px 0 rgb(var(--k-border)), inset -1px 0 0 rgb(var(--k-border))',
})

export function LookaheadGrid({ onEditar, onProgramar }: {
  onEditar: (a: ActGrid) => void
  /** abre el wizard de programar por partidas desde la pantalla vacía */
  onProgramar?: () => void
}) {
  const qc = useQueryClient()
  const [nSemanas, setNSemanas] = useState(4)
  const [desde, setDesde] = useState(() => iso(lunesDe(new Date())))
  // Cadena resaltada (clic en 🔗): antecesoras en azul, sucesoras en violeta.
  const [cadenaDe, setCadenaDe] = useState<number | null>(null)
  // Modo Vincular (clic-clic): 1er clic = la que va PRIMERO, 2º = la que sigue.
  const [vincular, setVincular] = useState<{ on: boolean; primera: number | null }>({ on: false, primera: null })
  // Panel de dependencias de una actividad (clic en 🔗 o en un chip PRED).
  // Va abajo, a lo ancho: así el grid conserva TODAS sus columnas de días y se
  // ven las fechas y los metrados mientras se edita (encargo de Jean). El grafo
  // se pliega para dejar solo la franja de datos editables.
  const [panelDe, setPanelDe] = useState<number | null>(null)
  const [dockGrafo, setDockGrafo] = useState(true)
  const altoDock = panelDe == null ? 0 : dockGrafo ? ALTO_DOCK : ALTO_DOCK_MIN
  // El dock se alinea con el CONTENIDO, no con la ventana: si arrancara en 0
  // se metería debajo del menú lateral. Se mide la caja del módulo (y se
  // vuelve a medir cuando el menú se pliega o despliega, que la cambia).
  const cajaRef = useRef<HTMLDivElement>(null)
  const [caja, setCaja] = useState({ left: 0, width: 0 })
  useEffect(() => {
    const el = cajaRef.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      setCaja(c => (c.left === r.left && c.width === r.width ? c : { left: r.left, width: r.width }))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [])
  // Ayuda del módulo: vive en un modal («?») y no al pie, para no comerle
  // pantalla a la cuadrícula (encargo de Jean).
  const [ayuda, setAyuda] = useState(false)
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; error?: boolean } | null>(null)
  // Mostrar relaciones: al pasar el mouse por una actividad vinculada se
  // resalta su cadena (azul = antecesoras, verde = sucesoras) sin hacer clic.
  const [mostrarRel, setMostrarRel] = useState(true)
  const [hoverDe, setHoverDe] = useState<number | null>(null)
  // Inmovilizar el bloque de columnas de la izquierda (la fila de fechas queda
  // fija siempre; esto congela además RESP…DESPUÉS DE al desplazarse a la derecha).
  const [fijarCols, setFijarCols] = useState(false)
  // Selección múltiple para encadenar de un golpe (el Ctrl+F2 de Project).
  const [sel, setSel] = useState<number[]>([])
  const toggleSel = (id: number) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  // Encontrar entre muchas: con 100 partidas la cuadrícula deja de ser
  // navegable a ojo. Buscador + filtros + contraer, todo en cliente sobre lo
  // que ya trae el grid (que solo carga lo que cruza la ventana de fechas).
  const [busca, setBusca] = useState('')
  const [fSup, setFSup] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [soloRest, setSoloRest] = useState(false)
  const [soloRevisar, setSoloRevisar] = useState(false)
  const [compacto, setCompacto] = useState(false)
  // Partidas compactadas y proyectos contraídos: viven aquí (no en el grupo)
  // para que «Contraer todo» pueda actuar sobre todos de una vez.
  const [compactas, setCompactas] = useState<Set<number>>(new Set())
  const [contraidos, setContraidos] = useState<Set<string>>(new Set())
  // Una actividad CERRADA se resume en una barra; el planner puede abrirla para
  // corregir un día (los errores de captura aparecen después). Abrir el detalle
  // es una MIRADA momentánea, no un estado que haya que ir deshaciendo fila por
  // fila: solo una abierta a la vez, y tocar cualquier otra fila —o Esc— la
  // vuelve a unir sola.
  const [abierta, setAbierta] = useState<number | null>(null)
  const verDetalle = (id: number | null) => setAbierta(v => (v === id ? null : id))
  useEffect(() => {
    if (abierta == null) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierta])
  const toggleCompacta = (pid: number) => setCompactas(prev => {
    const s = new Set(prev)
    if (s.has(pid)) s.delete(pid); else s.add(pid)
    return s
  })
  const toggleContraido = (k: string) => setContraidos(prev => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k); else s.add(k)
    return s
  })

  // Supervisores del padrón: el «responsable» de una actividad es uno de ellos
  // (misma clave que usa la agenda de la app de campo).
  const sups = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores-lista'],
    queryFn: () => api('/api/supervisores'),
  })
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
  // POST upsertea: mismo par (sucesora, antecesora) solo actualiza tipo y lag.
  const crearDep = useMutation({
    mutationFn: ({ suc, pred, lag, tipo }: { suc: number; pred: number; lag?: number; tipo?: TipoDep }) =>
      api(`/ev/programacion/actividades/${suc}/dependencias`, {
        method: 'POST',
        body: JSON.stringify({ predecesora_id: pred, lag_dias: lag ?? 0, tipo: tipo ?? 'FS' }),
      }),
    onSuccess: (j: unknown, vars) => {
      const r = j as { id?: number; movidas?: number[] }
      const cascada = r.movidas?.length ? ` · la cascada movió ${r.movidas.length} actividad(es)` : ''
      setToast({
        msg: vars.lag != null || vars.tipo != null
          ? `✓ Vínculo actualizado (${vars.tipo ?? 'FS'}${vars.lag ? (vars.lag > 0 ? `+${vars.lag}` : vars.lag) : ''})${cascada}`
          : `✓ Vinculada (FS)${cascada}`,
        undo: vars.lag == null && vars.tipo == null && r.id
          ? () => { borrarDep.mutate(r.id!); setToast(null) } : undefined,
      })
      invalidar()
    },
    onError: (e: Error) => setToast({ msg: e.message, error: true }),
  })
  // Edición rápida desde el dock de dependencias: metrado / fechas / plazo /
  // responsable.
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
  // Encadenar una secuencia ORDENADA de un solo POST (las etapas de una
  // partida son el caso masivo: habilitado → encofrado → vaciado → desencofrado).
  const encadenar = useMutation({
    mutationFn: ({ ids, tipo, lag }: { ids: number[]; tipo?: TipoDep; lag?: number }) =>
      api('/ev/programacion/dependencias/encadenar', {
        method: 'POST', body: JSON.stringify({ ids, tipo: tipo ?? 'FS', lag_dias: lag ?? 0 }),
      }),
    onSuccess: (j: unknown) => {
      const r = j as { vinculos?: number; omitidos?: unknown[]; movidas?: number[] }
      const om = r.omitidos?.length ? ` · ${r.omitidos.length} omitido(s) por ciclo` : ''
      setToast({ msg: `⛓ ${r.vinculos ?? 0} vínculo(s) creados${om}${r.movidas?.length ? ` · la cascada movió ${r.movidas.length}` : ''}` })
      setSel([]); invalidar()
    },
    onError: (e: Error) => setToast({ msg: e.message, error: true }),
  })
  // Columna DESPUÉS DE escrita a mano: se calcula el diff contra lo que había
  // (altas/cambios por upsert, bajas por DELETE) y se manda todo junto.
  const guardarDeps = useMutation({
    mutationFn: async ({ a, txt }: { a: ActGrid; txt: string }) => {
      const nuevas = parseDeps(txt)
      if (nuevas === null) throw new Error('No se entiende: usa 12 · 12FS+2 · 8;12SS-1 (sin repetir el mismo número)')
      if (nuevas.some(dep => dep.pred === a.id)) throw new Error('Una actividad no puede depender de sí misma')
      const antes = a.predecesoras ?? []
      const quitar = antes.filter(p => !nuevas.some(dep => dep.pred === p.id))
      const poner = nuevas.filter(dep => {
        const y = antes.find(p => p.id === dep.pred)
        return !y || (y.tipo ?? 'FS') !== dep.tipo || (y.lag_dias ?? 0) !== dep.lag
      })
      for (const p of quitar) await api(`/ev/programacion/dependencias/${p.dep_id}`, { method: 'DELETE' })
      const movidas = new Set<number>()
      for (const dep of poner) {
        const j = await api<{ movidas?: number[] }>(`/ev/programacion/actividades/${a.id}/dependencias`, {
          method: 'POST',
          body: JSON.stringify({ predecesora_id: dep.pred, tipo: dep.tipo, lag_dias: dep.lag }),
        })
        for (const m of j?.movidas ?? []) movidas.add(m)
      }
      return { n: poner.length, q: quitar.length, movidas: movidas.size }
    },
    onSuccess: (r) => {
      setToast({
        msg: `✓ Vínculos: ${r.n} guardado(s), ${r.q} quitado(s)`
          + (r.movidas ? ` · se reprogramaron ${r.movidas} actividad(es)` : ''),
      })
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
  // Replanificar un día FUTURO del programado: la celda queda manual ✎
  // (protegida) y el API re-prorratea el saldo en los demás días.
  const guardarProg = useMutation({
    mutationFn: ({ actId, fecha, v }: { actId: number; fecha: string; v: number | null }) =>
      api(`/ev/programacion/actividades/${actId}/metrado-dias`, {
        method: 'PUT', body: JSON.stringify({ dias: { [fecha]: v } }),
      }),
    onSuccess: () => { setToast({ msg: '✓ Día replanificado — el saldo se re-prorrateó' }); invalidar() },
    onError: (e: Error) => { setToast({ msg: e.message, error: true }); invalidar() },
  })
  const mover = (dias: number) => {
    const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + dias); setDesde(iso(lunesDe(d)))
  }
  const hoy = iso(new Date())
  const d = grid.data
  const nCols = N_FIJAS + (d ? d.fechas.length : nSemanas * 7)
  const diasSemana = new Set(d?.dias_semana ?? [1, 2, 3, 4, 5, 6, 7])
  const feriados = new Set(d?.feriados ?? [])
  const laborable = (f: string) => diasSemana.has(isoDow(f)) && !feriados.has(f)

  // ── Buscador y filtros ───────────────────────────────────
  // Se normalizan tildes para que «liberacion» encuentre «Liberación».
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const q = norm(busca.trim())
  const hayFiltro = !!(q || fSup || fEstado || soloRest || soloRevisar)
  const supervisores = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of d?.grupos ?? []) {
      for (const a of g.actividades) {
        if (a.supervisor_id) m.set(a.supervisor_id, a.supervisor_nombre || a.supervisor_id)
      }
    }
    return [...m].sort((x, y) => x[1].localeCompare(y[1]))
  }, [d])
  const grupos = useMemo(() => {
    const todos = d?.grupos ?? []
    if (!hayFiltro) return todos
    return todos
      .map(g => ({ ...g, actividades: g.actividades.filter(a => {
        if (fSup && (a.supervisor_id ?? '') !== fSup) return false
        if (fEstado && a.estado !== fEstado) return false
        if (soloRest && !(a.rest_pend ?? 0)) return false
        if (soloRevisar && !porRevisar(a)) return false
        if (!q) return true
        return norm([a.titulo, a.partida_codigo, a.partida_desc, a.hito_desc,
                     a.supervisor_nombre, a.responsable, `#${a.id}`]
          .filter(Boolean).join(' ')).includes(q)
      }) }))
      .filter(g => g.actividades.length > 0)
  }, [d, q, fSup, fEstado, soloRest, soloRevisar, hayFiltro])
  const nTotal = (d?.grupos ?? []).reduce((s, g) => s + g.actividades.length, 0)
  const nVisible = grupos.reduce((s, g) => s + g.actividades.length, 0)
  const limpiarFiltros = () => { setBusca(''); setFSup(''); setFEstado(''); setSoloRest(false) }
  // Contraer todo = compactar toda partida con 2+ etapas Y contraer los proyectos.
  const contraerTodo = () => {
    const pids = new Set<number>()
    const cuenta = new Map<number, number>()
    for (const g of grupos) for (const a of g.actividades) {
      if (a.partida_id) cuenta.set(a.partida_id, (cuenta.get(a.partida_id) ?? 0) + 1)
    }
    for (const [pid, n] of cuenta) if (n > 1) pids.add(pid)
    setCompactas(pids)
    setContraidos(new Set(grupos.map(g => g.otm_id ?? '-')))
  }
  const expandirTodo = () => { setCompactas(new Set()); setContraidos(new Set()) }

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
    <div ref={cajaRef} className="space-y-3" style={{ paddingBottom: altoDock }}>
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
        <button onClick={() => { setVincular(v => v.on ? { on: false, primera: null } : { on: true, primera: null }); setPanelDe(null) }}
          title="Vincular actividades con dos clics: primero la que va PRIMERO, luego la que sigue (FS). Esc para salir."
          className={`btn font-bold ${vincular.on ? 'btn-on' : 'btn-secundario'}`}>
          🔗 Vincular
        </button>
        <button onClick={() => setFijarCols(v => !v)}
          title="Inmovilizar también RESP…DESPUÉS DE al desplazarse a la derecha (la fila de fechas queda fija siempre)"
          className={`btn font-bold ${fijarCols ? 'btn-on' : 'btn-secundario'}`}>
          ⇥ Fijar columnas
        </button>
        <button onClick={() => window.open(`/programacion/lookahead-imprimir?desde=${desde}&semanas=${nSemanas}`, '_blank')}
          title="Vista imprimible en A3 apaisado"
          className="btn btn-terciario">
          <Printer size={14} /> Exportar PDF
        </button>
        <label className="flex items-center gap-1.5 text-xs text-k-text2 px-2.5 py-2 rounded-lg border border-k-border bg-k-raised cursor-pointer select-none"
          title="Al pasar el mouse por una actividad vinculada se resalta su cadena: azul = antecesoras, verde = sucesoras">
          <input type="checkbox" checked={mostrarRel} onChange={e => setMostrarRel(e.target.checked)}
            className="accent-amber-500" />
          Mostrar relaciones
        </label>
        {/* La ayuda va en azul (= información en la paleta semántica) y no en
            gris: es la puerta de entrada del planner que abre esto por primera
            vez, y en gris se perdía entre los demás controles. */}
        <button onClick={() => setAyuda(true)} title="Cómo se usa el LookAhead"
          className="flex items-center justify-center w-8 h-8 rounded-full border font-bold
                     border-k-blue/50 text-k-blue hover:bg-k-blue/10">?</button>
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

      {/* Encontrar entre muchas actividades */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar actividad, partida, código, responsable…"
            title="Filtra las filas por título, código o descripción de la partida, etapa, responsable o #"
            className="w-[300px] bg-k-raised border border-k-border rounded-lg pl-8 pr-7 py-2 text-sm text-k-text outline-none focus:border-k-amber placeholder:text-k-text3" />
          {busca && (
            <button onClick={() => setBusca('')} title="Limpiar la búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-k-text3 hover:text-k-text text-sm">✕</button>
          )}
        </div>
        <select value={fSup} onChange={e => setFSup(e.target.value)}
          title="Ver solo las actividades de un responsable"
          className="bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text2 outline-none">
          <option value="">Todos los responsables</option>
          {supervisores.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>
        <select value={fEstado} onChange={e => setFEstado(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text2 outline-none">
          <option value="">Todos los estados</option>
          {['PROGRAMADO', 'EJECUTADO', 'NO_CUMPLIDA', 'CANCELADO'].map(e =>
            <option key={e} value={e}>{e === 'NO_CUMPLIDA' ? 'NO CUMPLIDA' : e[0] + e.slice(1).toLowerCase()}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-k-text2 px-2.5 py-2 rounded-lg border border-k-border bg-k-raised cursor-pointer select-none"
          title="Solo las actividades que todavía tienen restricciones sin liberar">
          <input type="checkbox" checked={soloRest} onChange={e => setSoloRest(e.target.checked)} className="accent-amber-500" />
          ⛔ Con restricción
        </label>
        <label className="flex items-center gap-1.5 text-xs text-k-text2 px-2.5 py-2 rounded-lg border border-k-border bg-k-raised cursor-pointer select-none"
          title="Las que hay que revisar: con metrado pero sin partida (no se puede anotar su avance y el PPC las castiga), o con la partida sin presupuesto de HH cargado">
          <input type="checkbox" checked={soloRevisar} onChange={e => setSoloRevisar(e.target.checked)} className="accent-red-500" />
          🔴 Por revisar
        </label>
        {/* Ajustes de vista: terciarios. No son acciones sobre la obra, son
            cómo se mira la tabla — no deben competir con los filtros. */}
        <button onClick={contraerTodo} title="Compactar todas las partidas por etapas y contraer los proyectos"
          className="btn btn-sm btn-terciario">
          ⊟ Contraer todo
        </button>
        <button onClick={expandirTodo} title="Volver a mostrar todas las etapas y proyectos"
          className="btn btn-sm btn-terciario">
          ⊞ Expandir todo
        </button>
        <button onClick={() => setCompacto(v => !v)}
          title="Filas de una sola línea: el código de la partida y la etapa pasan al tooltip. Cabe el doble de actividades."
          className={`btn btn-sm font-bold ${compacto ? 'btn-on' : 'btn-terciario'}`}>
          ☰ Compacto
        </button>
        <span className="text-[11px] text-k-text3">
          {hayFiltro
            ? <><b className="text-k-amber">{nVisible}</b> de {nTotal} actividades</>
            : <>{nTotal} actividades en el rango</>}
        </span>
        {hayFiltro && (
          <button onClick={limpiarFiltros}
            className="text-[11px] px-2 py-1 rounded-lg border border-amber-500/40 text-k-amber hover:bg-amber-500/10">
            Quitar filtros
          </button>
        )}
      </div>

      {sel.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold text-k-blue bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
          ☑ {sel.length} seleccionada(s) — se encadenan en el orden en que las marcaste:
          <span className="font-mono text-k-text2">{sel.map(i => `#${i}`).join(' → ')}</span>
          {(['FS', 'SS', 'FF'] as TipoDep[]).map(t => (
            <button key={t} disabled={sel.length < 2 || encadenar.isPending}
              onClick={() => encadenar.mutate({ ids: sel, tipo: t })}
              title={t === 'FS' ? 'Fin → Inicio: cada una arranca al terminar la anterior'
                : t === 'SS' ? 'Inicio → Inicio: arrancan juntas'
                : 'Fin → Fin: terminan juntas'}
              className="px-2 py-0.5 rounded border border-blue-500/40 hover:bg-blue-500/15 disabled:opacity-40">
              ⛓ {t}
            </button>
          ))}
          <button onClick={() => setSel([])}
            className="ml-auto text-[11px] px-2 py-0.5 rounded border border-k-border text-k-text3 hover:bg-k-raised">Limpiar</button>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-k-border"
        style={{ maxHeight: `calc(100vh - ${250 + altoDock}px)` }}>
        <table className="border-collapse w-max min-w-full">
          <thead>
            <tr style={{ height: H_SEM }}>
              <th className={`${thBase} text-center`} rowSpan={2}
                style={{ ...stick(0, true), ...thSticky(0, 40) }}
                title="Número de la actividad — es el que se teclea en DESPUÉS DE para vincular">#</th>
              <th className={`${thBase} text-left`} rowSpan={2}
                style={{ ...stick(1, true), ...thSticky(0, 40) }}>ACTIVIDADES</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(2, fijarCols), ...thSticky(0, 40) }}>RESP</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(3, fijarCols), ...thSticky(0, 40) }}>METRADO</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(4, fijarCols), ...thSticky(0, 40) }}>UND</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(5, fijarCols), ...thSticky(0, 40) }}
                title="Duración en días hábiles (medio día = 0.5). Al escribirla se recalcula la F.Fin conservando el inicio.">PLAZO</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(6, fijarCols), ...thSticky(0, 40) }}>F. Inic</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(7, fijarCols), ...thSticky(0, 40) }}>F. Fin</th>
              <th className={thBase} rowSpan={2} style={{ ...stick(8, fijarCols), ...thSticky(0, 40) }}
                title="Antecesoras, como en Project: 12 · 12FS+2 · 8;12SS-1. Doble clic para escribirlas.">DESPUÉS DE</th>
              {/* La cabecera de semanas era rosa —que en la paleta significa
                  «problema»— y no lo es. Neutra; la semana en curso se
                  distingue por el peso del texto, no por el color. */}
              {(d?.semanas ?? []).map((s, i) => (
                <th key={s.lunes} colSpan={7} style={thSticky(0, 20)}
                  className={`border-b border-k-border border-r-2 border-r-k-border2 px-1 py-1
                    text-[10px] uppercase tracking-wide bg-k-raised ${
                    i === 0 ? 'font-bold text-k-text' : 'font-medium text-k-text3'}`}>
                  {i === 0 ? 'Esta semana' : `Semana +${i}`} · {fmtDia(s.lunes)} — {fmtDia(s.domingo)}
                </th>
              ))}
            </tr>
            <tr>
              {(d?.fechas ?? []).map((f, i) => (
                <th key={f} style={{
                  ...thSticky(H_SEM, 20),
                  // Mismo borde que las celdas, para que la línea de hoy arranque
                  // en la cabecera y baje entera.
                  ...(f === hoy ? { borderLeft: '3px solid rgb(var(--k-green))' } : {}),
                }}
                  title={f === hoy ? 'Hoy' : feriados.has(f) ? 'Feriado / día no laborable' : !laborable(f) ? 'Día no laborable (calendario)' : ''}
                  className={`border-b border-k-border/60 px-0.5 py-0.5 text-[9px] font-bold min-w-[44px]
                    ${(i + 1) % 7 === 0 ? 'border-r-2 border-r-k-border2' : ''} ${
                  f === hoy ? 'bg-k-green/15 text-k-green'
                    : !laborable(f) ? 'bg-k-border/60 text-k-text2 line-through'
                    : 'bg-k-raised text-k-text2'}`}>
                  {DIAS_1[i % 7]}<br />{fmtCorta(f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <GrupoOTM key={g.otm_id ?? '-'} grupo={g} fechas={d!.fechas} hoy={hoy}
                laborable={laborable} onEditar={onEditar} cadena={cadena}
                fijar={fijarCols} sel={sel} onSel={toggleSel}
                compacto={compacto}
                abierta={abierta} onAbrir={verDetalle}
                compactas={compactas} onCompactar={toggleCompacta}
                contraido={contraidos.has(g.otm_id ?? '-')}
                onContraer={() => toggleContraido(g.otm_id ?? '-')}
                onEncadenar={ids => encadenar.mutate({ ids })}
                onDeps={(a, txt) => guardarDeps.mutate({ a, txt })}
                onCampo={(id, patch) => editarAct.mutate({ id, patch })}
                onCadena={id => { setCadenaDe(v => (v === id ? null : id)); setPanelDe(v => (v === id ? null : id)) }}
                vincular={vincular} onPick={pick}
                onPanel={id => { setPanelDe(id); setCadenaDe(id) }}
                onHover={setHoverDe}
                onReal={(actId, fecha, v) => guardarReal.mutate({ actId, fecha, v })}
                onProg={(actId, fecha, v) => guardarProg.mutate({ actId, fecha, v })} />
            ))}
            {/* La pantalla vacía es la primera que ve un planner nuevo: en vez
                de un «Sin actividades» que no lleva a ningún lado, explica qué
                es esto, cuál es el primer paso y trae el botón que lo hace. */}
            {grupos.length === 0 && !grid.isLoading && (
              <tr><td colSpan={nCols} className="px-4 py-10">
                {hayFiltro ? (
                  <p className="text-center text-k-text3 text-sm">
                    Ninguna de las {nTotal} actividades del rango coincide con el filtro.{' '}
                    <button onClick={limpiarFiltros} className="text-k-amber underline">Quitar filtros</button>
                  </p>
                ) : (
                  <div className="max-w-md mx-auto text-center space-y-3">
                    <p className="text-base font-bold text-k-text">Todavía no hay nada programado</p>
                    <p className="text-sm text-k-text2 leading-relaxed">
                      El LookAhead es el plan de las próximas semanas: eliges partidas del
                      presupuesto, les pones <b>fechas</b> y el <b>metrado</b> que se compromete, y el
                      sistema reparte solo ese metrado entre los días de trabajo.
                    </p>
                    {onProgramar && (
                      <button onClick={onProgramar} className="btn btn-primario mx-auto">
                        ＋ Programar por partidas
                      </button>
                    )}
                    <p className="text-[11px] text-k-text3">
                      ¿Estás mirando otras semanas? El LookAhead solo trae lo que cruza el rango
                      visible — prueba «Hoy» o amplía a 6 semanas.
                    </p>
                  </div>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div style={{ bottom: altoDock + 16 }}   // el toast sube por encima del dock
          className={`fixed right-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl ${
          toast.error ? 'border-red-500/50 bg-red-950 text-red-200' : 'border-k-border bg-k-surface text-k-text'}`}>
          {toast.msg}
          {toast.undo && (
            <button onClick={toast.undo}
              className="text-xs font-bold px-2 py-1 rounded border border-k-border text-k-amber hover:bg-k-raised">Deshacer</button>
          )}
          <button onClick={() => setToast(null)} className="text-k-text3 hover:text-k-text">✕</button>
        </div>
      )}

      {ayuda && <AyudaLookahead onCerrar={() => setAyuda(false)} />}

      {panelDe != null && d && (
        <PanelDeps actId={panelDe} data={d}
          grafo={dockGrafo} onGrafo={() => setDockGrafo(v => !v)}
          onCerrar={() => { setPanelDe(null); setCadenaDe(null) }}
          onIr={id => { setPanelDe(id); setCadenaDe(id) }}
          caja={caja} sups={sups.data ?? []}
          onDeps={(a, txt) => guardarDeps.mutate({ a, txt })}
          onGuardarAct={(id, patch) => editarAct.mutate({ id, patch })} />
      )}
    </div>
  )
}

// ── Dock «Dependencias» (grafo estilo Panel Maestro, elección de Jean) ──
// Va ABAJO y a lo ancho, no como cajón lateral: el cajón de 360px tapaba los
// últimos días del LookAhead, y Jean necesita ver las fechas y los metrados
// mientras edita. Vertical se paga más barato (unas filas) que horizontal
// (columnas de días enteras).
//   Franja fija  → la actividad en foco con TODO lo editable en una línea:
//                  metrado, F.Inicio, F.Fin, plazo y responsable.
//   Grafo        → ● ANTECESORAS (azul) → actividad (ámbar) → ● SUCESORAS
//                  (verde), de izquierda a derecha como una red CPM.
//   DESPUÉS DE   → una sola barra con la sintaxis de Project («12; 8FF-1»):
//                  crea, cambia y quita varios vínculos de un tirón. Sustituye
//                  al submódulo de botones FS/SS/FF que estaba a la derecha.
// Clic en cualquier tarjeta del grafo = traer esa actividad a la franja (los
// campos no se repiten en dos sitios). «⌄ Solo datos» pliega el grafo.
// Enter o salir del campo guarda; el API re-prorratea y corre la cascada.

// Los tres tipos de vínculo están explicados en obra (no en jerga de Project)
// en el modal de ayuda «?» → «Vincular actividades».

/** El vínculo que ata el nodo con el de al lado, solo para rotularlo. */
interface DepVinc { tipo: TipoDep; lag: number }
interface Nodo { id: number; titulo: string; a?: ActGrid; dep: DepVinc | null }

// Campo editable con commit al salir (mismo patrón no-controlado de CeldaDia).
/** Celda de la cuadrícula editable in-situ: doble clic (o Enter) escribe,
 *  Enter guarda, Esc cancela. Es lo que el planner pidió para no tener que
 *  abrir un panel por cada dato. */
function CeldaEdit({ valor, texto, tipo, onCommit, titulo, clase, placeholder }: {
  /** valor CRUDO que se edita (ISO para fechas) */
  valor: string
  /** cómo se ve cuando no se está editando (por defecto, el propio valor) */
  texto?: string
  tipo: 'text' | 'date'
  onCommit: (v: string) => void
  titulo?: string; clase?: string; placeholder?: string
}) {
  const [edit, setEdit] = useState(false)
  const visible = texto ?? valor
  if (!edit) {
    return (
      <div onDoubleClick={() => setEdit(true)} title={titulo ?? 'Doble clic para editar'}
        className={`cursor-text hover:bg-k-raised/70 rounded px-0.5 min-h-[15px] ${clase ?? ''}`}>
        {visible || <span className="text-k-text3">{placeholder ?? '—'}</span>}
      </div>
    )
  }
  return (
    <input autoFocus type={tipo} defaultValue={valor}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setEdit(false) }
      }}
      onBlur={e => {
        setEdit(false)
        const v = e.target.value.trim()
        if (v !== valor) onCommit(v)
      }}
      className="w-full bg-k-void border border-k-amber rounded px-1 py-0.5 text-[11px] text-k-text outline-none" />
  )
}

function CampoAct({ etiqueta, tipo, valor, onCommit, ancho }: {
  etiqueta: string; tipo: 'text' | 'date'; valor: string
  onCommit: (v: string) => void
  /** clase de ancho del input; en la franja del dock cada dato pide el suyo */
  ancho?: string
}) {
  return (
    <label className="flex items-center gap-1 flex-shrink-0
                      text-[9px] uppercase font-bold text-k-text3 tracking-wide">
      {etiqueta}
      <input key={valor} type={tipo} defaultValue={valor}
        inputMode={tipo === 'text' ? 'decimal' : undefined}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onBlur={e => { const v = e.target.value.trim(); if (v !== valor) onCommit(v) }}
        className={`${ancho ?? 'w-20'} bg-k-void border border-k-border rounded-lg px-1.5 py-1
                    text-[11px] normal-case tracking-normal text-k-text outline-none focus:border-k-amber`} />
    </label>
  )
}

function PanelDeps({ actId, data, grafo, caja, sups, onGrafo, onCerrar, onIr, onDeps, onGuardarAct }: {
  actId: number; data: GridResp
  grafo: boolean
  /** izquierda y ancho del contenido: el dock no se mete debajo del menú */
  caja: { left: number; width: number }
  sups: { id: string; nombre: string }[]
  onGrafo: () => void
  onCerrar: () => void; onIr: (id: number) => void
  onDeps: (a: ActGrid, txt: string) => void
  onGuardarAct: (id: number, patch: Record<string, unknown>) => void
}) {
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
      dep: { lag: p.lag_dias, tipo: (p.tipo ?? 'FS') as TipoDep },
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
        dep: dp ? { lag: dp.lag_dias, tipo: (dp.tipo ?? 'FS') as TipoDep } : null,
      }
    }))
    cur = ids.length === 1 ? porId.get(ids[0]) : undefined
  }

  // ── Días del rango de la actividad en foco ───────────────────
  // Mismo ciclo que los chips del modal: normal → ∅ salto → ◐ medio día.
  // Se manda el par completo (el API lo trata como "el planner tocó los días"
  // y re-prorratea el metrado entre los hábiles que quedan).
  const dias: string[] = []
  {
    const d = new Date(focal.fecha + 'T12:00:00')
    const fin = new Date(focal.fecha_fin + 'T12:00:00')
    while (d <= fin && dias.length < 60) { dias.push(iso(d)); d.setDate(d.getDate() + 1) }
  }
  const saltos = new Set(focal.dias_salto ?? [])
  const medios = new Set(focal.dias_medio ?? [])
  const diasSemana = new Set(data.dias_semana ?? [1, 2, 3, 4, 5, 6, 7])
  const feriados = new Set(data.feriados ?? [])
  const laborable = (f: string) => diasSemana.has(isoDow(f)) && !feriados.has(f)
  const ciclarDia = (f: string) => {
    const s = [...saltos]; const m = [...medios]
    if (saltos.has(f)) {                       // salto → medio día
      onGuardarAct(focal.id, { dias_salto: s.filter(x => x !== f), dias_medio: [...m, f].sort() })
    } else if (medios.has(f)) {                // medio día → normal
      onGuardarAct(focal.id, { dias_salto: s, dias_medio: m.filter(x => x !== f) })
    } else {                                   // normal → salto
      onGuardarAct(focal.id, { dias_salto: [...s, f].sort(), dias_medio: m })
    }
  }

  // Tarjeta del grafo. Clic = traer esa actividad al foco: sus datos y sus
  // vínculos pasan a la franja de arriba, así nada se edita en dos sitios.
  const Tarjeta = ({ n, clr }: { n: Nodo; clr: 'azul' | 'verde' }) => {
    const base = clr === 'azul'
      ? 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20'
      : 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20'
    return (
      <div onClick={() => n.a && onIr(n.id)}
        title={n.a
          ? `#${n.id} · clic para traerla a la franja de arriba y editarla`
          : 'Actividad fuera del rango visible del grid'}
        className={`rounded-lg border px-2.5 py-1.5 ${base} ${n.a ? 'cursor-pointer' : 'opacity-60'}`}>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-k-text3 flex-shrink-0">#{n.id}</span>
          <span className="text-[11px] text-k-text truncate flex-1">{n.titulo}</span>
        </div>
        <p className="text-[9px] text-k-text3">
          {n.dep?.tipo ?? 'FS'}{n.dep?.lag ? (n.dep.lag > 0 ? `+${n.dep.lag}` : n.dep.lag) : ''}
          {n.a ? ` · ${fmtCorta(n.a.fecha)} → ${fmtCorta(n.a.fecha_fin)}` : ''}
        </p>
      </div>
    )
  }
  // Una columna del grafo horizontal (las actividades en paralelo se apilan).
  const Columna = ({ nodos, clr }: { nodos: Nodo[]; clr: 'azul' | 'verde' }) => (
    <div className="flex flex-col justify-center gap-1 w-[168px] flex-shrink-0">
      {nodos.map(n => <Tarjeta key={n.id} n={n} clr={clr} />)}
    </div>
  )
  const Flecha = ({ clr }: { clr: 'azul' | 'verde' }) => (
    <div className={`flex items-center text-sm flex-shrink-0 ${clr === 'azul' ? 'text-k-blue' : 'text-green-400'}`}>→</div>
  )

  return (
    <div className="fixed bottom-0 z-40 bg-k-surface border-t border-l border-r border-k-border
                    rounded-t-xl shadow-2xl flex flex-col"
      style={{ height: grafo ? ALTO_DOCK : ALTO_DOCK_MIN, left: caja.left, width: caja.width }}>

      {/* ── Franja 1: la actividad en foco, TODA editable en una sola línea ──
          Es lo mínimo indispensable para programar (metrado, fechas, plazo,
          responsable y vínculos) sin tapar ni una columna de días del grid. */}
      <div className="flex items-center gap-2.5 px-3 overflow-x-auto flex-shrink-0 border-b border-k-border"
        style={{ height: ALTO_FRANJA }}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[focal.estado] ?? 'bg-zinc-500'}`}
          title={focal.estado} />
        {/* La ETAPA (hito) es lo que dice qué parte de la partida se está
            programando — sin ella dos filas de la misma partida se confunden. */}
        <div className="w-[210px] flex-shrink-0">
          <p className="text-[12px] font-bold text-k-text truncate" title={focal.titulo}>{focal.titulo}</p>
          <p className="text-[9px] truncate"
            title={focal.partida_desc ? `📌 ${focal.partida_codigo} — ${focal.partida_desc}` : undefined}>
            <span className="text-k-text3 font-mono">
              #{focal.id}{focal.partida_codigo ? ` · 📌 ${focal.partida_codigo}` : ''}
            </span>
            {focal.hito_desc && (
              <span className="text-k-wbs"
                title="Etapa (hito) de la partida: su avance alimenta ese hito en el % de Valor Ganado">
                {' '}◆ {focal.hito_desc}{focal.hito_peso != null ? ` (${Math.round(focal.hito_peso * 100)}%)` : ''}
              </span>
            )}
          </p>
        </div>
        <CampoAct etiqueta={focal.und ? `Metrado (${focal.und})` : 'Metrado'} tipo="text" ancho="w-20"
          valor={focal.metrado_prog != null ? String(focal.metrado_prog) : ''}
          onCommit={v => {
            if (v === '') { onGuardarAct(focal.id, { metrado_prog: null }); return }
            const m = Number(v)
            if (Number.isFinite(m) && m >= 0) onGuardarAct(focal.id, { metrado_prog: m })
          }} />
        <CampoAct etiqueta="F. Inicio" tipo="date" ancho="w-[126px]" valor={focal.fecha}
          onCommit={v => { if (v) onGuardarAct(focal.id, { fecha: v }) }} />
        <CampoAct etiqueta="F. Fin" tipo="date" ancho="w-[126px]" valor={focal.fecha_fin}
          onCommit={v => { if (v) onGuardarAct(focal.id, { fecha_fin: v }) }} />
        {/* El plazo manda sobre el fin: escribirlo recalcula F.Fin con el
            calendario del proyecto (0034). */}
        <CampoAct etiqueta="Plazo (d)" tipo="text" ancho="w-14"
          valor={focal.plazo_dias != null ? String(focal.plazo_dias) : ''}
          onCommit={v => {
            const p = Number(v)
            if (v !== '' && Number.isFinite(p) && p > 0) onGuardarAct(focal.id, { plazo_dias: p })
          }} />
        {/* Responsable = el SUPERVISOR a cargo, elegido del padrón (encargo de
            Jean: no un nombre suelto tecleado a mano). Es el mismo campo que
            usa la agenda de la app de campo, así que escribirlo aquí le pone
            la actividad en el teléfono. */}
        <label className="flex items-center gap-1 flex-shrink-0 text-[9px] uppercase font-bold text-k-text3 tracking-wide">
          Supervisor
          <select value={focal.supervisor_id ?? ''}
            onChange={e => onGuardarAct(focal.id, { supervisor_id: e.target.value || null })}
            title="Supervisor a cargo: le aparece la actividad en su agenda de campo"
            className="w-40 bg-k-void border border-k-border rounded-lg px-1.5 py-1
                       text-[11px] normal-case tracking-normal text-k-text outline-none focus:border-k-amber">
            <option value="">— sin asignar —</option>
            {sups.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        {/* Vínculos con la sintaxis de Project: varios de un tirón, con tipo y
            lag firmado. Sustituye a los botones FS/SS/FF que estaban aparte. */}
        <label className="flex items-center gap-1 flex-shrink-0 text-[9px] uppercase font-bold text-k-text3 tracking-wide">
          Después de
          <input key={`d${focal.id}:${fmtDeps(focal.predecesoras)}`}
            defaultValue={fmtDeps(focal.predecesoras)}
            placeholder="12; 8FF-1"
            title={'Antecesoras como en Project, separadas por ; —\n'
              + '12 → después de terminar la 12 (FS)\n'
              + '12FS+2 → 2 días hábiles después de terminar la 12\n'
              + '8SS-1 → arranca 1 día ANTES de que arranque la 8 (traslape)\n'
              + '8FF → no termina antes que la 8\n'
              + 'Borrar un número quita ese vínculo. Enter guarda.'}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (v !== fmtDeps(focal.predecesoras)) onDeps(focal, v)
            }}
            className="w-40 bg-k-void border border-k-border rounded-lg px-1.5 py-1 font-mono
                       text-[11px] normal-case tracking-normal text-k-text outline-none focus:border-k-amber" />
        </label>
        <span className="text-[10px] text-k-text3 flex-shrink-0"
          title="Cuántas actividades dependen de esta">
          → <b className="text-green-400">{focal.sucesoras?.length ?? 0}</b> suces.
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0 pl-2">
          <button onClick={onGrafo}
            title={grafo ? 'Plegar el grafo y dejar solo esta franja de datos' : 'Ver el grafo de dependencias'}
            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised">
            {grafo ? '⌄ Solo datos' : '⌃ Ver grafo'}
          </button>
          <button onClick={onCerrar} title="Cerrar (Esc)" className="text-k-text3 hover:text-k-text px-1">✕</button>
        </div>
      </div>

      {/* ── Franja 2: los días del rango ──────────────────────────────
          Estaban solo dentro del modal de la actividad; aquí se editan en el
          mismo sitio que las fechas y el metrado (encargo de Jean). Clic cicla
          se trabaja → ∅ salto → ◐ medio día, y el API re-prorratea al vuelo. */}
      <div className="flex items-center gap-1.5 px-3 overflow-x-auto flex-shrink-0 border-b border-k-border"
        style={{ height: ALTO_CHIPS }}>
        <span className="text-[9px] uppercase font-bold text-k-text3 tracking-wide flex-shrink-0"
          title="Clic en un día: se trabaja → ∅ salto (peso 0) → ◐ medio día (peso 0.5). El metrado se reparte solo entre lo que queda.">
          Días del rango
        </span>
        {dias.length <= 1 ? (
          <span className="text-[10px] text-k-text3">Un solo día: no hay nada que saltar.</span>
        ) : dias.map(f => {
          const salto = saltos.has(f)
          const medio = medios.has(f)
          const habil = laborable(f)
          return (
            <button key={f} onClick={() => ciclarDia(f)}
              title={!habil ? 'Día no laborable del calendario del proyecto (ya no recibe metrado)'
                : salto ? 'Salto ∅: no se trabaja (clic → medio día)'
                : medio ? 'Medio día ◐: pesa 0.5 (clic → normal)'
                : 'Se trabaja completo (clic → salto)'}
              className={`text-[10px] px-1.5 py-1 rounded border font-mono flex-shrink-0 ${
                salto ? 'border-red-500/40 bg-red-500/15 text-k-red line-through'
                : medio ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                : !habil ? 'border-k-border bg-k-border/50 text-k-text3 line-through'
                : 'border-k-border bg-k-raised text-k-text2 hover:brightness-125'}`}>
              {medio ? '◐ ' : ''}{DIAS_1[isoDow(f) - 1]} {f.slice(8, 10)}
            </button>
          )
        })}
      </div>

      {grafo && (
        <div className="flex-1 flex min-h-0">
          {/* ── Grafo horizontal: se lee como una red CPM, antecesoras a la
              izquierda y sucesoras a la derecha. Es SOLO vista y navegación:
              los vínculos se escriben arriba, en DESPUÉS DE. ── */}
          <div className="flex-1 overflow-auto px-3 py-2">
            <div className="flex items-stretch gap-1.5 w-max min-w-full h-full">
              {nivelesUp.length === 0 && (
                <div className="flex items-center w-[168px] flex-shrink-0 text-[10px] text-k-text3">
                  Sin antecesoras: puede arrancar cuando se quiera.
                </div>
              )}
              {nivelesUp.map((nivel, i) => (
                <Fragment key={`u${i}`}>
                  <Columna nodos={nivel} clr="azul" />
                  <Flecha clr="azul" />
                </Fragment>
              ))}
              <div className="flex flex-col justify-center w-[180px] flex-shrink-0">
                <div className="rounded-lg border-2 border-amber-400/70 bg-amber-500/15 px-2.5 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[9px] text-k-amber/70 flex-shrink-0">#{focal.id}</span>
                    <p className="text-[11px] font-bold text-k-amber truncate">{focal.titulo}</p>
                  </div>
                  <p className="text-[9px] text-k-text3">
                    {fmtCorta(focal.fecha)} → {fmtCorta(focal.fecha_fin)}
                    {focal.metrado_prog != null ? ` · ${focal.metrado_prog}${focal.und ? ` ${focal.und}` : ''}` : ''}
                  </p>
                </div>
              </div>
              {nivelesDown.map((nivel, i) => (
                <Fragment key={`d${i}`}>
                  <Flecha clr="verde" />
                  <Columna nodos={nivel} clr="verde" />
                </Fragment>
              ))}
              {nivelesDown.length === 0 && (
                <div className="flex items-center w-[168px] flex-shrink-0 text-[10px] text-k-text3 pl-2">
                  Nada depende de esta actividad.
                </div>
              )}
            </div>
          </div>

        </div>
      )}
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

interface PropsFila {
  fijar: boolean
  compacto: boolean
  sel: number[]; onSel: (id: number) => void
  onEncadenar: (ids: number[]) => void
  onDeps: (a: ActGrid, txt: string) => void
  onCampo: (id: number, patch: Record<string, unknown>) => void
  /** la ÚNICA actividad cerrada que está abierta en detalle (null = ninguna) */
  abierta: number | null
  /** con su id alterna; con null cierra la que hubiera */
  onAbrir: (id: number | null) => void
}

function GrupoOTM({ grupo, fechas, hoy, laborable, cadena, onCadena, onEditar, onReal, onProg, vincular, onPick, onPanel, onHover, compactas, onCompactar, contraido, onContraer, onEncadenar, ...fp }: {
  grupo: GridResp['grupos'][number]; fechas: string[]; hoy: string
  laborable: (f: string) => boolean
  cadena: { focal: number; azules: Set<number>; verdes: Set<number> } | null
  onCadena: (id: number) => void
  onEditar: (a: ActGrid) => void
  onReal: (actId: number, fecha: string, v: number | null) => void
  onProg: (actId: number, fecha: string, v: number | null) => void
  vincular: Vincular; onPick: (id: number) => void; onPanel: (id: number) => void
  onHover: (id: number | null) => void
  // Partidas compactadas (▸) y proyecto contraído: el estado vive en el padre
  // para que «Contraer todo» pueda actuar sobre todos de una vez.
  compactas: Set<number>; onCompactar: (pid: number) => void
  contraido: boolean; onContraer: () => void
} & PropsFila) {
  const toggle = onCompactar
  const items = agruparPorPartida(grupo.actividades)
  const idxCadena = new Map<number, number>()
  for (const it of items) if (it.tipo === 'partida') idxCadena.set(it.pid, idxCadena.size)
  return (
    <>
      <tr>
        {/* Nivel 1 de la jerarquía: proyecto. La franja de color a la izquierda
            y la negrita lo separan del nivel 2 (partida, violeta) sin que haya
            que contar sangrías. */}
        <td colSpan={N_FIJAS + fechas.length} onClick={onContraer}
          style={{ boxShadow: 'inset 3px 0 0 rgb(var(--k-blue))' }}
          title={contraido ? 'Clic para desplegar este proyecto' : 'Clic para contraer este proyecto entero'}
          className="border-b border-k-border px-2 py-1.5 text-[11px] font-bold bg-k-blue/10 text-k-blue cursor-pointer hover:bg-k-blue/20">
          {/* El `sticky` va en el CONTENIDO, no en la celda: una celda con
              colSpan ya ocupa todo el ancho, así que pegarla a left:0 no hace
              nada y el texto se iba con el scroll horizontal. */}
          <div style={ROTULO}>
            <span className="text-k-text2">{contraido ? '▸' : '▾'}</span>{' '}
            {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
            {contraido && (
              <span className="text-k-text3 font-normal"> · {grupo.actividades.length} actividades ocultas</span>
            )}
          </div>
        </td>
      </tr>
      {!contraido && items.map(it => {
        if (it.tipo === 'suelta') {
          return <FilaActividad key={it.a.id} a={it.a} fechas={fechas} hoy={hoy}
            laborable={laborable} cadena={cadena} onCadena={onCadena}
            onEditar={onEditar} onReal={onReal} onProg={onProg}
            vincular={vincular} onPick={onPick} onPanel={onPanel} onHover={onHover} {...fp} />
        }
        const color = PALETA_CADENA[(idxCadena.get(it.pid) ?? 0) % PALETA_CADENA.length]
        const compacta = compactas.has(it.pid)
        const a0 = it.acts[0]
        if (compacta) {
          return <FilaPartidaCompacta key={`p${it.pid}`} acts={it.acts} color={color}
            fechas={fechas} hoy={hoy} laborable={laborable} onToggle={() => toggle(it.pid)}
            fijar={fp.fijar} compacto={fp.compacto} />
        }
        return (
          <Fragment key={`p${it.pid}`}>
            <tr>
              {/* Nivel 2: partida. Franja del color de su cadena. */}
              <td colSpan={N_FIJAS + fechas.length}
                className="border-b border-k-border px-2 py-1 text-[10px] font-bold"
                style={{ boxShadow: `inset 3px 0 0 ${color}`, background: `${color}14` }}>
                <div style={ROTULO}>
                  <span onClick={() => toggle(it.pid)} className="cursor-pointer hover:opacity-70"
                    title="Partida desplegada por etapas (hitos) — clic para compactarla en una sola fila">
                    <span className="text-k-text2">▾</span>{' '}
                    <span style={{ color }}>●</span>{' '}
                    <span className="text-k-text">{a0.partida_codigo} — {a0.partida_desc}</span>{' '}
                    <span className="text-k-text3 font-normal">· {it.acts.length} etapas</span>
                  </span>
                  {/* Un clic encadena las etapas en su orden constructivo: es el
                      80% de los vínculos que crea el planner. */}
                  {it.acts.length > 1 && (
                    <button onClick={() => onEncadenar(it.acts.map(a => a.id))}
                      title={`Encadenar las ${it.acts.length} etapas en secuencia FS: ${it.acts.map(a => `#${a.id}`).join(' → ')}`}
                      className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded border border-k-border bg-k-surface text-k-text2 hover:bg-k-raised">
                      ⛓ Encadenar las {it.acts.length} etapas
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {it.acts.map(a => (
              <FilaActividad key={a.id} a={a} fechas={fechas} hoy={hoy}
                laborable={laborable} cadena={cadena} onCadena={onCadena}
                onEditar={onEditar} onReal={onReal} onProg={onProg} color={color}
                vincular={vincular} onPick={onPick} onPanel={onPanel} onHover={onHover} {...fp} />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

// Fila única de una partida COMPACTADA: agrega el programado y el real de
// todas sus etapas por día (solo lectura — para editar, despliega con ▸).
function FilaPartidaCompacta({ acts, color, fechas, hoy, laborable, onToggle, fijar, compacto }: {
  acts: ActGrid[]; color: string; fechas: string[]; hoy: string
  laborable: (f: string) => boolean; onToggle: () => void
  fijar: boolean; compacto: boolean
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
  const plazoTot = acts.reduce((s, a) => s + (a.plazo_dias ?? 0), 0)
  const runsAgg = runsDeFila(fechas, f => (progAgg[f] ?? 0) > 0 || realAgg[f] != null)
  return (
    <tr>
      <td className={`${tdFijo} text-center font-mono text-[9px] text-k-text3`} style={stick(0, true)}>—</td>
      <td onClick={onToggle}
        className={`${tdFijo} cursor-pointer hover:bg-k-raised align-top`}
        style={{ ...stick(1, true), borderLeft: `3px solid ${color}` }}
        title={'Partida compactada: la fila suma el programado y el real de todas sus etapas.\nClic para desplegar las etapas (y poder editar los avances).'}>
        <div className="flex items-center gap-1.5">
          <span className="text-k-text2">▸</span>
          <span style={{ color }}>●</span>
          <span className="text-k-text leading-tight font-bold">{a0.partida_codigo} — {a0.partida_desc}</span>
        </div>
        {!compacto && (
          <div className="text-[9px] text-k-text3 pl-3.5">
            ◆ {acts.length} etapas compactadas · {ejecutadas}/{acts.length} ✓
          </div>
        )}
      </td>
      <td className={`${tdFijo} text-center text-k-text2`} style={stick(2, fijar)}>
        {a0.supervisor_nombre?.split(' ')[0] || a0.responsable || '—'}
      </td>
      <td className={`${tdFijo} text-center align-middle`} style={stick(3, fijar)}
        title="Σ metrado meta de las etapas · Σ real anotado">
        <div className="font-mono font-bold text-k-text">{totalMeta > 0 ? num(totalMeta) : '—'}</div>
        {totalMeta > 0 && (
          <div className="text-[9px] text-k-text3">Σ etapas · saldo {num(Math.max(totalMeta - totalReal, 0))}</div>
        )}
      </td>
      <td className={`${tdFijo} text-center text-k-text2`} style={stick(4, fijar)}>{a0.und ?? '—'}</td>
      <td className={`${tdFijo} text-center font-mono tabular-nums text-[10px] text-k-text2`} style={stick(5, fijar)}
        title="Σ del plazo de las etapas (no es la duración de la partida si se traslapan)">
        {plazoTot > 0 ? `Σ ${num(plazoTot)}` : '—'}
      </td>
      <td className={`${tdFijo} text-center font-mono tabular-nums text-[10px] text-k-text2`} style={stick(6, fijar)}>{fmtCorta(fIni)}</td>
      <td className={`${tdFijo} text-center font-mono tabular-nums text-[10px] text-k-text2`} style={stick(7, fijar)}>{fmtCorta(fFin)}</td>
      <td className={`${tdFijo} text-center font-mono text-[9px] text-k-text2`} style={stick(8, fijar)}
        title={conFS ? 'Las etapas están encadenadas (despliega para verlas)' : 'Sin antecesoras'}>
        {conFS ? '⛓' : '—'}
      </td>
      {fechas.map((f, i) => (
        <CeldaDia key={f} prog={progAgg[f]} real={realAgg[f]}
          esSalto={false} esMedio={false} laborable={laborable(f)}
          run={runsAgg[f]} esHoy={f === hoy} finSemana={(i + 1) % 7 === 0}
          editable={false} onRegistrar={() => {}} />
      ))}
    </tr>
  )
}

function FilaActividad({ a, fechas, hoy, laborable, cadena, onCadena, onEditar, onReal, onProg, color, vincular, onPick, onPanel, onHover, fijar, compacto, sel, onSel, onDeps, onCampo, abierta, onAbrir }: {
  a: ActGrid; fechas: string[]; hoy: string
  laborable: (f: string) => boolean
  cadena: { focal: number; azules: Set<number>; verdes: Set<number> } | null
  onCadena: (id: number) => void
  onEditar: (a: ActGrid) => void
  onReal: (actId: number, fecha: string, v: number | null) => void
  onProg: (actId: number, fecha: string, v: number | null) => void
  color?: string
  vincular: Vincular; onPick: (id: number) => void; onPanel: (id: number) => void
  onHover: (id: number | null) => void
} & Omit<PropsFila, 'onEncadenar'>) {
        const editable = a.estado !== 'CANCELADO'
        const expandida = abierta === a.id
        const saltos = new Set(a.dias_salto ?? [])
        const medios = new Set(a.dias_medio ?? [])
        const manuales = new Set(a.prog_manual ?? [])
        // Los días seguidos con dato se dibujan como una barra: la fila es la
        // única que ve la secuencia completa, así que el cálculo va aquí.
        const lleno = (f: string) => !saltos.has(f) && ((a.prog[f] ?? 0) > 0 || a.real[f] != null)
        const runs = runsDeFila(fechas, lleno)
        // ── Cerrada = una sola barra con el veredicto ──────────────
        // Lo que ya no espera captura es historia y se lee mejor como una pieza
        // limpia con su total (estilo Project); lo que sigue abierto se queda
        // en detalle, que es donde se trabaja y donde hace falta ver qué pasó
        // cada día. Cierra por dos caminos: se registraron TODOS los días del
        // plan, o el real ya alcanzó el meta (los días que quedaban sobran).
        const meta = a.metrado_prog ?? 0
        const hecho = a.acum_real ?? 0
        const diasPlan = fechas.filter(f => !saltos.has(f) && (a.prog[f] ?? 0) > 0)
        const todoRegistrado = diasPlan.length > 0 && diasPlan.every(f => a.real[f] != null)
        // La barra resume TODA la actividad, así que solo aparece si toda la
        // actividad está a la vista: si se sale del rango, el total del resumen
        // incluiría días que no se ven y el veredicto sería una media verdad.
        const dentroRango = fechas.length > 0
          && a.fecha >= fechas[0] && a.fecha_fin <= fechas[fechas.length - 1]
        const cerrada = meta > 0 && dentroRango && (todoRegistrado || hecho >= meta - 0.0005)
        // El veredicto es lo que el planner busca de un vistazo: cumplí, me
        // sobró metrado o me faltó. Verde con el saldo a favor, rojo con el
        // saldo en contra — un total solo no dice si el día fue bueno.
        const saldo = hecho - meta
        const enContra = cerrada && saldo < -0.0005
        const verBarra = cerrada && !expandida
        const tramos = verBarra ? tramosDeFila(fechas, lleno) : []
        // Resaltado de cadena: focal con anillo, antecesoras azul, sucesoras
        // verde. El resto NO se atenúa (antes iba a opacity-30): con el dock
        // abierto costaba ver justo las que aún no tienen vínculo, que son las
        // que uno quiere agregar.
        const claseCadena = !cadena ? ''
          : cadena.focal === a.id ? 'ring-1 ring-inset ring-amber-500/50'
          : cadena.azules.has(a.id) ? 'bg-blue-500/10'
          : cadena.verdes.has(a.id) ? 'bg-green-500/10'
          : ''
        const esPrimera = vincular.on && vincular.primera === a.id
        const iSel = sel.indexOf(a.id)
        const revisar = motivoRevisar(a)
        return (
          <tr key={a.id} className={`${a.estado === 'CANCELADO' ? 'opacity-50' : ''} ${claseCadena} ${esPrimera ? 'bg-amber-500/15' : ''} ${
              expandida ? 'ring-1 ring-inset ring-k-green/50 bg-k-green/5' : ''}`}
            // Tocar CUALQUIER otra fila vuelve a unir la que estuviera abierta:
            // el detalle es una mirada, no un modo en el que uno se queda.
            onMouseDown={() => { if (!expandida && abierta != null) onAbrir(null) }}
            onMouseEnter={() => onHover((a.dep_total ?? 0) > 0 ? a.id : null)}
            onMouseLeave={() => onHover(null)}>
            {/* # — el identificador que se teclea en DESPUÉS DE. El clic lo
                marca para encadenar en bloque (el orden de marcado es el de
                la secuencia). */}
            {/* Fondo OPACO: con `bg-k-raised/60` las columnas de fechas se
                transparentaban por debajo al desplazarse y el # se volvía
                ilegible. El marcado de selección se pinta con un inset
                box-shadow encima, que no obliga a destapar el fondo. */}
            <td className="border border-k-border px-1 py-1 text-center align-middle cursor-pointer
                  select-none bg-k-raised hover:brightness-125"
              style={{
                ...stick(0, true), zIndex: 12,
                ...(iSel >= 0 ? { boxShadow: 'inset 0 0 0 99px rgba(59,130,246,0.25)' } : {}),
              }}
              onClick={() => onSel(a.id)}
              title={iSel >= 0
                ? `Marcada en la posición ${iSel + 1} de la secuencia — clic para desmarcar`
                : `Actividad #${a.id} — este es el número que se teclea en DESPUÉS DE.\nClic para marcarla y encadenarla con otras.\nPara saltar a ella, escribe #${a.id} en el buscador.`}>
              {iSel >= 0 && (
                <div className="font-mono text-[9px] font-bold text-k-blue leading-none">{iSel + 1}º</div>
              )}
              <span className={`font-mono text-[13px] font-bold tabular-nums ${
                iSel >= 0 ? 'text-k-blue' : 'text-k-text2'}`}>{a.id}</span>
            </td>
            <td onClick={() => (vincular.on ? onPick(a.id) : onEditar(a))}
              className={`${tdFijo} cursor-pointer hover:bg-k-raised align-top`}
              style={{ ...stick(1, true), ...(color ? { borderLeft: `3px solid ${color}` } : {}) }}
              title={vincular.on
                ? (vincular.primera == null ? 'Clic: esta actividad va PRIMERO'
                  : esPrimera ? 'Elegida como la que va primero'
                  : `Clic: esta va DESPUÉS de #${vincular.primera}`)
                : `${a.titulo}${a.partida_desc ? `\n📌 ${a.partida_codigo} — ${a.partida_desc}` : ''}${a.hito_desc ? `\n◆ Etapa: ${a.hito_desc}` : ''}\n(clic para editar: meta, fechas, saltos, antecesoras, restricciones)`}>
              <div className={`flex items-center gap-1.5${color ? ' pl-2' : ''}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
                <span className="text-k-text leading-tight">{a.titulo}</span>
                {revisar && (
                  <span title={revisar} className="text-[9px] font-bold text-k-red flex-shrink-0
                    px-1 rounded bg-red-500/15 border border-red-500/40 cursor-help">🔴</span>
                )}
                {(a.rest_pend ?? 0) > 0 && <span className="text-[9px] font-bold text-k-red flex-shrink-0">⛔{a.rest_pend}</span>}
                {(a.dep_total ?? 0) > 0 && (
                  <button onClick={e => { e.stopPropagation(); onCadena(a.id) }}
                    title={`${a.dep_total} vínculo(s) — clic para resaltar la cadena (azul = antecesoras, verde = sucesoras)`}
                    className={`text-[9px] font-bold flex-shrink-0 px-1 rounded ${
                      cadena?.focal === a.id ? 'bg-amber-500/20 text-k-amber' : 'text-k-blue hover:bg-k-raised'}`}>
                    🔗{a.dep_total}
                  </button>
                )}
                {/* Cerrada: se resume en una barra. El botón dice que hay
                    detalle debajo, para que no parezca que se perdió. */}
                {cerrada && (
                  <button onClick={e => { e.stopPropagation(); onAbrir(a.id) }}
                    title={expandida
                      ? 'Volver a la barra resumen (o toca otra fila, o pulsa Esc)'
                      : 'Ya no espera registros: se muestra como una barra con el saldo. Clic para ver y editar el detalle por día.'}
                    className={`text-[9px] font-bold flex-shrink-0 px-1 rounded hover:bg-k-raised ${
                      expandida ? 'bg-k-green/15 text-k-green ring-1 ring-k-green/40'
                        : enContra ? 'text-k-red' : 'text-k-green'}`}>
                    {expandida ? '⊟ unir' : '⊞'}
                  </button>
                )}
              </div>
              {/* En modo compacto la fila es UNA línea: el código de partida y
                  la etapa viven en el tooltip del título. */}
              {!compacto && !color && a.partida_codigo && (
                <div className="text-[9px] text-k-text3 font-mono pl-3.5 truncate max-w-[240px]">
                  📌 {a.partida_codigo}{a.partida_desc ? ` · ${a.partida_desc.slice(0, 34)}` : ''}
                </div>
              )}
              {!compacto && a.hito_desc && (
                <div className="text-[9px] text-k-wbs pl-3.5 truncate max-w-[240px]"
                  title="Etapa (hito) de la partida que programa esta actividad — su registro diario alimenta ese hito en el % EV">
                  ◆ Etapa: {a.hito_desc}{a.hito_peso != null ? ` (${Math.round(a.hito_peso * 100)}%)` : ''}
                </div>
              )}
              {!compacto && a.estado === 'NO_CUMPLIDA' && (a.causa_nc_cat || a.causa_nc) && (
                <div className="text-[9px] text-k-red/90 pl-3.5">
                  {CNC[a.causa_nc_cat ?? ''] ?? ''}{a.causa_nc ? ` — ${a.causa_nc.slice(0, 40)}` : ''}
                </div>
              )}
            </td>
            <td className={`${tdFijo} text-center text-k-text2`} style={stick(2, fijar)}>
              {a.supervisor_nombre?.split(' ')[0] || a.responsable || '—'}
            </td>
            {/* Metrado, plazo y fechas: editables in-situ (doble clic) para no
                tener que abrir un panel por cada dato. */}
            <td className={`${tdFijo} text-center align-middle`} style={stick(3, fijar)}>
              <CeldaEdit tipo="text" clase="font-mono font-bold tabular-nums text-k-text text-center"
                valor={a.metrado_prog != null ? String(a.metrado_prog) : ''}
                titulo="Metrado META de la actividad — doble clic para cambiarlo"
                onCommit={v => onCampo(a.id, { metrado_prog: v === '' ? null : Number(v) })} />
              {a.metrado_base != null && (
                <div className="text-[9px] text-k-text3" title="Metrado presupuestado de la partida · saldo por ejecutar">
                  base {num(a.metrado_base)}{a.saldo != null ? ` · saldo ${num(a.saldo)}` : ''}
                </div>
              )}
            </td>
            <td className={`${tdFijo} text-center text-k-text2`} style={stick(4, fijar)}>{a.und ?? '—'}</td>
            <td className={`${tdFijo} text-center align-middle`} style={stick(5, fijar)}>
              <CeldaEdit tipo="text" clase="font-mono text-[11px] text-k-text text-center"
                valor={a.plazo_dias != null ? String(a.plazo_dias) : ''}
                texto={a.plazo_dias != null ? `${num(a.plazo_dias)} d` : ''}
                titulo={'Plazo en días hábiles (0.5 = medio día).\nAl cambiarlo se recalcula la F.Fin conservando el inicio.'}
                onCommit={v => onCampo(a.id, { plazo_dias: Number(v.replace(',', '.')) })} />
            </td>
            <td className={`${tdFijo} text-center align-middle`} style={stick(6, fijar)}>
              <CeldaEdit tipo="date" clase="font-mono text-[10px] text-k-text2 text-center"
                valor={a.fecha} texto={fmtCorta(a.fecha)}
                titulo="F. Inicio — al moverla la barra se desplaza conservando el plazo"
                onCommit={v => v && onCampo(a.id, { fecha: v })} />
            </td>
            <td className={`${tdFijo} text-center align-middle`} style={stick(7, fijar)}>
              <CeldaEdit tipo="date" clase="font-mono text-[10px] text-k-text2 text-center"
                valor={a.fecha_fin} texto={fmtCorta(a.fecha_fin)}
                titulo="F. Fin — al escribirla se recalcula el plazo"
                onCommit={v => v && onCampo(a.id, { fecha_fin: v })} />
            </td>
            {/* DESPUÉS DE, como en Project: se teclea «12», «12FS+2», «8;12SS-1» */}
            <td className={`${tdFijo} align-middle`} style={stick(8, fijar)}>
              <CeldaEdit tipo="text" clase="font-mono text-[10px] text-k-blue text-center"
                valor={fmtDeps(a.predecesoras)} placeholder="—"
                titulo={(a.predecesoras ?? []).length
                  ? `Después de:\n${(a.predecesoras ?? []).map(p => `• ${p.titulo} (${p.tipo ?? 'FS'}${p.lag_dias ? (p.lag_dias > 0 ? `+${p.lag_dias}` : p.lag_dias) : ''}) termina ${fmtCorta(p.fecha_fin)}`).join('\n')}\n\nDoble clic para escribirlas: 12 · 12FS+2 · 8;12SS-1`
                  : 'Sin antecesoras — doble clic y escribe el # de la que va antes (12 · 12FS+2 · 8;12SS-1)'}
                onCommit={v => onDeps(a, v)} />
              {(a.predecesoras ?? []).length > 0 ? (
                <button onClick={() => onPanel(a.id)} title="Ver la cadena completa en el panel"
                  className="w-full text-[8px] text-k-text3 hover:text-k-text">ver cadena ⤢</button>
              ) : (
                // Sin antecesoras el «—» no dice nada: una actividad suelta en
                // la red es justo lo que el planner quiere detectar de un
                // vistazo. El botón abre el panel de dependencias para atarla.
                <button onClick={() => onPanel(a.id)}
                  title="Esta actividad no depende de ninguna otra: abre el panel para vincularla"
                  className="w-full text-[8px] font-bold text-k-red hover:underline">⛓ vincular</button>
              )}
            </td>
            {verBarra
              ? (() => {
                // Barra única: un <td colSpan> por tramo (el fin de semana lo
                // parte, como en Project) y el total en el más ancho. El resto
                // de días se pintan como celdas normales, así la banda del fin
                // de semana y la línea de hoy siguen bajando por la tabla.
                const enTramo = new Map<number, { largo: number; ancho: boolean }>()
                const mayor = tramos.reduce((m, t) => (t.largo > m.largo ? t : m), tramos[0])
                const dentro = new Set<number>()
                for (const t of tramos) {
                  enTramo.set(t.i, { largo: t.largo, ancho: t === mayor })
                  for (let k = t.i; k < t.i + t.largo; k++) dentro.add(k)
                }
                const und = a.und ? ` ${a.und}` : ''
                // El saldo va EN la barra: sin él, un «✓ 4200» de un meta de
                // 4000 se lee igual que uno de 4000 y se pierde justo el dato
                // que el planner busca — cuánto sobró o cuánto faltó.
                const sobra = Math.abs(saldo) > 0.0005
                const etiqueta = `${enContra ? '⚠' : '✓'} ${numCorto(hecho)}${und}`
                  + (sobra ? ` ${saldo > 0 ? '+' : '−'}${numCorto(Math.abs(saldo))}` : '')
                const dictamen = !sobra ? `Cumplida al ras: ${num(hecho)}${und}, justo lo previsto.`
                  : enContra
                    ? `Cerrada con saldo EN CONTRA: se hizo ${num(hecho)}${und} de ${num(meta)} — faltaron ${num(-saldo)}${und}.`
                    : `Cumplida con saldo A FAVOR: se hizo ${num(hecho)}${und} de ${num(meta)} — ${num(saldo)}${und} de más.`
                return fechas.map((f, i) => {
                  const t = enTramo.get(i)
                  if (t) {
                    return (
                      <td key={f} colSpan={t.largo}
                        onClick={() => onAbrir(a.id)}
                        title={`${dictamen}\nEntre el ${fmtCorta(a.fecha)} y el ${fmtCorta(a.fecha_fin)}.`
                          + '\nClic para ver y editar el detalle por día.'}
                        className="relative border-b border-k-border/50 p-0 cursor-pointer">
                        <div className={`my-0.5 mx-px min-h-[1.15rem] rounded-md overflow-hidden
                          text-white font-bold text-[10px] tabular-nums flex items-center justify-center gap-1 px-1
                          hover:brightness-110 ${enContra ? 'bg-k-red-solido' : 'bg-k-green-solido'}`}>
                          {t.ancho ? etiqueta : null}
                        </div>
                      </td>
                    )
                  }
                  if (dentro.has(i)) return null      // día absorbido por el colSpan
                  return (
                    <CeldaDia key={f} prog={undefined} real={undefined}
                      esSalto={saltos.has(f)} esMedio={false} laborable={laborable(f)}
                      editable={false} onRegistrar={() => {}}
                      esHoy={f === hoy} finSemana={(i + 1) % 7 === 0} />
                  )
                })
              })()
              : fechas.map((f, i) => (
                <CeldaDia key={f} prog={a.prog[f]} real={a.real[f]}
                  esSalto={saltos.has(f)} esMedio={medios.has(f)} laborable={laborable(f)}
                  editable={editable && !!a.partida_id && f <= hoy}
                  editableProg={editable && f > hoy} esManual={manuales.has(f)}
                  run={runs[f]} esHoy={f === hoy} finSemana={(i + 1) % 7 === 0}
                  onProgramar={v => onProg(a.id, f, v)}
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
  // Restricciones reportadas desde campo en esa semana (0032): la actividad
  // se hizo, pero algo le bajó el rendimiento. No afectan el PPC.
  const fin = useMemo(() => {
    const f = new Date(lunes + 'T12:00:00'); f.setDate(f.getDate() + 6); return iso(f)
  }, [lunes])
  const ppc = useQuery<{ restricciones: Record<string, { cat: string; detalle: string; fecha: string }[]> }>({
    queryKey: ['ppc-restricciones', lunes],
    queryFn: () => api(`/ev/programacion/ppc?proyecto_id=${PROYECTO_ID}&desde=${lunes}&hasta=${fin}`),
  })
  const restPorAct = ppc.data?.restricciones ?? {}

  const mover = (dias: number) => {
    const d = new Date(lunes + 'T12:00:00'); d.setDate(d.getDate() + dias); setLunes(iso(lunesDe(d)))
  }
  const d = grid.data
  const fechas = d?.fechas ?? []
  const hoy = iso(new Date())

  // CUMPL. AUTOMÁTICO (al cierre + SI anticipado): SI apenas lo alcanzado ≥
  // lo comprometido de la semana; NO recién cuando la semana CERRÓ sin
  // llegar; «…» mientras corre. Los estados manuales mandan.
  const cumplimiento = (a: ActGrid, comprom: number, alcanz: number) => {
    if (a.estado === 'EJECUTADO') return ['SI', 'text-k-green']
    if (a.estado === 'NO_CUMPLIDA') return ['NO', 'text-k-red']
    if (a.estado === 'CANCELADO') return ['—', 'text-k-text3']
    if (comprom <= 0) return ['…', 'text-k-amber']
    if (alcanz >= comprom - 0.0005) return ['SI', 'text-k-green']
    if (fechas.length && fechas[6] < hoy) return ['NO', 'text-k-red']
    return ['…', 'text-k-amber']
  }

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
              <th className={`${thBase} text-left min-w-[190px]`}>RESTRICCIONES</th>
            </tr>
          </thead>
          <tbody>
            {(d?.grupos ?? []).map(g => (
              <EvalGrupo key={g.otm_id ?? '-'} grupo={g} fechas={fechas} cumplimiento={cumplimiento}
                restricciones={restPorAct}
                onCausaPlanner={(actId, cat, detalle) => causaPlanner.mutate({ actId, cat, detalle })} />
            ))}
            {(d?.grupos ?? []).length === 0 && !grid.isLoading && (
              <tr><td colSpan={9 + fechas.length} className="px-4 py-6 text-center text-k-text3">Semana sin actividades programadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
        Por día: <span className="text-k-plan">programado</span> / real (<span className="text-green-300">verde</span> más,{' '}
        <span className="text-amber-300">ámbar</span> igual, <span className="text-red-300">rojo</span> menos que lo programado).
        COMPROM. = metrado comprometido de la semana · ALCANZ. = metrado real registrado (avance diario del EV).
        CUMPL. es <b>automático</b>: SI apenas lo alcanzado iguala o supera lo comprometido (aunque la semana
        siga corriendo); NO recién cuando la semana cerró sin llegar; «…» = en curso. Marcar NO CUMPLIDA a
        mano (con causa) manda sobre el cálculo. CAUSA (CAMPO) la reporta el supervisor; CAUSA (PLANNER) la
        depura oficina — en el Pareto de PPC·Causas manda la del planner y, si no existe, cuenta la de campo.
        RESTRICCIONES son las que el supervisor reportó desde campo <b>aunque la actividad sí se haya hecho</b>
        (algo le bajó el rendimiento): no afectan el PPC y tienen su propio Pareto en PPC·Causas.
      </p>
    </div>
  )
}

function EvalGrupo({ grupo, fechas, cumplimiento, restricciones, onCausaPlanner }: {
  grupo: GridResp['grupos'][number]; fechas: string[]
  cumplimiento: (a: ActGrid, comprom: number, alcanz: number) => string[]
  restricciones: Record<string, { cat: string; detalle: string; fecha: string }[]>
  onCausaPlanner: (actId: number, cat: string | null, detalle: string | null) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={9 + fechas.length} className="border border-k-border px-2 py-1 font-bold bg-blue-500/15 text-k-blue">
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => {
        const comprom = fechas.reduce((s, f) => s + (a.prog[f] ?? 0), 0)
        const alcanz = fechas.reduce((s, f) => s + (a.real[f] ?? 0), 0)
        const [cumpl, clr] = cumplimiento(a, comprom, alcanz)
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
                {(a.prog[f] ?? 0) > 0 && <div className="text-k-plan">{num(a.prog[f])}</div>}
                {a.real[f] != null && <div className={clrRealTxt(a.real[f], a.prog[f])}>{num(a.real[f])}</div>}
              </td>
            ))}
            <td className={`${tdFijo} text-center font-mono font-bold text-k-plan`}>{comprom > 0 ? num(comprom) : '—'}</td>
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
            {/* Restricciones que reportó el supervisor aunque el trabajo SÍ se hizo */}
            <td className={`${tdFijo} text-amber-300/90`}>
              {(restricciones[String(a.id)] ?? []).map((r, i) => (
                <div key={i} className="leading-tight">
                  • {r.detalle || CNC[r.cat] || r.cat}
                  {r.detalle && <span className="text-k-text3"> ({CNC[r.cat] ?? r.cat})</span>}
                </div>
              ))}
            </td>
          </tr>
        )
      })}
    </>
  )
}
