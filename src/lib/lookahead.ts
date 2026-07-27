// Helpers compartidos de las grillas tipo Excel del LookAhead (Programación)
// y del tab «Avance diario» del Valor Ganado — un solo semáforo, un solo
// formato de celda en todo el sistema.

export const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const DIAS_1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
export const fmtCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
export const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''))

// ISO weekday del string YYYY-MM-DD sin depender de la zona horaria local
export const isoDow = (f: string) => {
  const d = new Date(f + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}

// Color del avance real vs el programado congelado del día (línea base):
// más = verde · igual = ámbar · menos = rojo
export const clrReal = (real: number | undefined, prog: number | undefined) => {
  if (real == null) return ''
  const p = prog ?? 0
  if (real > p + 0.0005) return 'bg-green-500/25 text-green-300 font-bold'
  if (real >= p - 0.0005) return 'bg-amber-500/25 text-amber-300 font-bold'
  return 'bg-red-500/25 text-red-300 font-bold'
}

// Colores base de la celda (bg tailwind ↔ rgba para el gradiente de medio día)
// «celeste» = PROGRAMADO = lo previsto. Desde la tanda 2 sale del token
// --k-plan, que trae su propio valor para el tema claro (antes iba con un
// parche sobre .text-sky-300 en index.css).
export const NIVEL_TXT: Record<string, string> = {
  verde: 'text-green-300 font-bold', ambar: 'text-amber-300 font-bold',
  rojo: 'text-red-300 font-bold', celeste: 'text-k-plan font-medium', gris: '',
}
export const NIVEL_BG: Record<string, string> = {
  verde: 'bg-green-500/25', ambar: 'bg-amber-500/25', rojo: 'bg-red-500/25',
  // «gris» = día en el que no se trabaja. Con el token en vez de zinc-700 la
  // banda queda suave en claro y visible en oscuro, y baja por toda la
  // columna: es lo que hace que la semana se lea como semana.
  celeste: 'bg-k-plan/20', gris: 'bg-k-border/50',
}
export const NIVEL_RGBA: Record<string, string> = {
  verde: 'rgba(34,197,94,0.25)', ambar: 'rgba(245,158,11,0.25)',
  rojo: 'rgba(239,68,68,0.25)', celeste: 'rgb(var(--k-plan) / 0.20)',
  gris: 'rgb(var(--k-border) / 0.50)',
}
// ── Barras: días seguidos de una actividad se dibujan como UNA pieza ──
// Antes cada día era un cuadrito con borde y había que juntar «40 40 40» con
// la vista para saber cuánto dura la actividad. Uniendo los días seguidos
// (esquinas redondeadas en los extremos, sin borde entre medio) aparece la
// forma que cualquiera reconoce. Un día vacío, un feriado o un salto ∅ cortan
// la barra — que es exactamente lo que pasa en obra.
export type Run = 'ini' | 'medio' | 'fin' | 'solo' | null

/** Para cada fecha, qué parte de la barra es. `lleno` decide si ese día
 *  cuenta (tiene programado o real y no es un salto). */
export function runsDeFila(fechas: string[], lleno: (f: string) => boolean): Record<string, Run> {
  const out: Record<string, Run> = {}
  for (let i = 0; i < fechas.length; i++) {
    const f = fechas[i]
    if (!lleno(f)) { out[f] = null; continue }
    const antes = i > 0 && lleno(fechas[i - 1])
    const despues = i < fechas.length - 1 && lleno(fechas[i + 1])
    out[f] = antes && despues ? 'medio' : antes ? 'fin' : despues ? 'ini' : 'solo'
  }
  return out
}

export const nivelDe = (real: number | undefined, prog: number | undefined, laborable: boolean) =>
  real != null
    ? (real > (prog ?? 0) + 0.0005 ? 'verde' : real >= (prog ?? 0) - 0.0005 ? 'ambar' : 'rojo')
    : (prog ?? 0) > 0 ? 'celeste' : !laborable ? 'gris' : ''

// ── Vínculos escritos a mano, como en MS Project ─────────────
// El planner teclea «12», «12FS+2», «8;12SS-1» en la columna DESPUÉS DE en vez
// de encadenar clics. Se renderiza igual que se escribe, así que va y viene.
export type TipoDep = 'FS' | 'SS' | 'FF'
export interface DepEdit { pred: number; tipo: TipoDep; lag: number }
export interface DepVista { id: number; lag_dias: number; tipo?: string }

/** Devuelve null si algo no parsea: no se adivina, se le avisa al planner. */
export function parseDeps(txt: string): DepEdit[] | null {
  const out: DepEdit[] = []
  for (const trozo of txt.split(/[;,]/)) {
    const t = trozo.trim().toUpperCase().replace(/\s+/g, '')
    if (!t) continue
    const m = /^#?(\d+)(FS|SS|FF)?([+-]\d+)?D?$/.exec(t)
    if (!m) return null
    const pred = Number(m[1])
    if (!pred || out.some(d => d.pred === pred)) return null
    out.push({ pred, tipo: (m[2] as TipoDep) ?? 'FS', lag: Number(m[3] ?? 0) })
  }
  return out
}

/** El inverso: FS con lag 0 se escribe solo con el número (como en Project). */
export function fmtDeps(preds: DepVista[] | undefined): string {
  return (preds ?? []).map(p => {
    const lag = p.lag_dias ? (p.lag_dias > 0 ? `+${p.lag_dias}` : String(p.lag_dias)) : ''
    const tipo = p.tipo && p.tipo !== 'FS' ? p.tipo : (lag ? 'FS' : '')
    return `${p.id}${tipo}${lag}`
  }).join(';')
}
