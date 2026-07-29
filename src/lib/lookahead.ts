// Helpers compartidos de las grillas tipo Excel del LookAhead (Programación)
// y del tab «Avance diario» del Valor Ganado — un solo semáforo, un solo
// formato de celda en todo el sistema.

export const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const DIAS_1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
export const fmtCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
export const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''))

/** El mismo número recortado para que quepa en una casilla de día (44 px):
 *  un decimal, y entero a partir de 1000 — `3333.33` se pisaba con el día de
 *  al lado. El valor exacto sigue en el tooltip y al editar la celda. */
export const numCorto = (v: number) => {
  if (Math.abs(v) >= 1000) return String(Math.round(v))
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// ISO weekday del string YYYY-MM-DD sin depender de la zona horaria local
export const isoDow = (f: string) => {
  const d = new Date(f + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}

// Color del avance real vs el programado congelado del día (línea base):
// más = verde · igual = ámbar · menos = rojo
/** El mismo semáforo pero SIN relleno, para cuando el dato va suelto sobre el
 *  fondo de la tabla (la evaluación semanal lista prog y real en dos líneas).
 *  Antes se sacaba el `bg-` de clrReal con un regex — y al volverse blanca la
 *  tinta de la barra, eso dejaba texto blanco sobre fondo blanco. */
export const clrRealTxt = (real: number | undefined, prog: number | undefined) => {
  if (real == null) return ''
  const p = prog ?? 0
  if (real > p + 0.0005) return 'text-k-green font-bold'
  if (real >= p - 0.0005) return 'text-k-alerta font-bold'
  return 'text-k-red font-bold'
}

// Colores base de la celda (bg tailwind ↔ rgba para el gradiente de medio día)
// El día pintado: relleno SÓLIDO con el texto en blanco, no un tinte al 20%
// sobre el fondo. Con el tinte la barra se confundía con la cuadrícula y había
// que buscarla; sólida se ve de un vistazo desde el otro lado del escritorio,
// que es de lo que se trata. «celeste» = PROGRAMADO = lo previsto.
export const NIVEL_TXT: Record<string, string> = {
  verde: 'text-white font-bold', ambar: 'text-white font-bold',
  rojo: 'text-white font-bold', celeste: 'text-white font-bold', gris: '',
}
export const NIVEL_BG: Record<string, string> = {
  verde: 'bg-k-green-solido', ambar: 'bg-k-alerta-solido', rojo: 'bg-k-red-solido',
  // «gris» = día en el que no se trabaja. Banda continua por toda la columna:
  // es lo que hace que la semana se lea como semana y no como 14 días iguales.
  celeste: 'bg-k-plan-solido', gris: 'bg-k-border',
}
export const NIVEL_RGBA: Record<string, string> = {
  verde: 'rgb(var(--k-green-solido))', ambar: 'rgb(var(--k-alerta-solido))',
  rojo: 'rgb(var(--k-red-solido))', celeste: 'rgb(var(--k-plan-solido))',
  gris: 'rgb(var(--k-border))',
}
// ── Barras: días seguidos de una actividad se dibujan como UNA pieza ──
// Antes cada día era un cuadrito con borde y había que juntar «40 40 40» con
// la vista para saber cuánto dura la actividad. Uniendo los días seguidos
// (esquinas redondeadas en los extremos, sin borde entre medio) aparece la
// forma que cualquiera reconoce. Un día vacío, un feriado o un salto ∅ cortan
// la barra — que es exactamente lo que pasa en obra.
export type Run = 'ini' | 'medio' | 'fin' | 'solo' | null

/** Los mismos días seguidos, pero como TRAMOS: {desde, largo} sobre el índice
 *  de `fechas`. Lo usa la barra única de una actividad cumplida, que pinta un
 *  <td colSpan> por tramo en vez de una celda por día. Un fin de semana o un
 *  salto parten la barra en dos tramos, como en Project. */
export function tramosDeFila(fechas: string[], lleno: (f: string) => boolean) {
  const out: { i: number; largo: number }[] = []
  for (let i = 0; i < fechas.length; i++) {
    if (!lleno(fechas[i])) continue
    const ini = i
    while (i + 1 < fechas.length && lleno(fechas[i + 1])) i++
    out.push({ i: ini, largo: i - ini + 1 })
  }
  return out
}

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

// Las sub-filas se ven como 58.1, 58.2 (0038), así que el vínculo también tiene
// que hablar ese idioma: escrito «59» nadie sabe a qué frente apunta. `numeros`
// traduce id → número visible en las dos direcciones; se acepta cualquiera de
// los dos al teclear, porque el id sigue siendo válido y está en los tooltips.
export type MapaNumeros = Map<number, string>

export interface FilaNumerable { id: number; padre_id?: number | null; fecha: string }

/** id → número visible del LookAhead: `46` en una fila raíz, `46.1` en la
 *  primera de sus sub-filas. Se calcula sobre TODAS las filas del rango, nunca
 *  sobre las filtradas: si ocultar las terminadas renumerara, el 58.4 del que
 *  se habló en la reunión pasaría a ser otro. */
export function numerosDeGrid(acts: FilaNumerable[]): MapaNumeros {
  const m: MapaNumeros = new Map()
  const visibles = new Set(acts.map(a => a.id))
  const hijos = new Map<number, FilaNumerable[]>()
  for (const a of acts) {
    m.set(a.id, String(a.id))
    // Sub-fila cuyo padre quedó fuera del rango: se queda con su id, que es lo
    // único que la identifica sin él.
    if (a.padre_id && visibles.has(a.padre_id)) {
      hijos.set(a.padre_id, [...(hijos.get(a.padre_id) ?? []), a])
    }
  }
  for (const [pid, hs] of hijos) {
    hs.sort((x, y) => (x.fecha === y.fecha ? x.id - y.id : x.fecha < y.fecha ? -1 : 1))
    hs.forEach((h, i) => m.set(h.id, `${pid}.${i + 1}`))
  }
  return m
}

/** Devuelve null si algo no parsea: no se adivina, se le avisa al planner. */
export function parseDeps(txt: string, numeros?: MapaNumeros): DepEdit[] | null {
  const porNumero = new Map<string, number>()
  for (const [id, n] of numeros ?? []) porNumero.set(n, id)
  const out: DepEdit[] = []
  for (const trozo of txt.split(/[;,]/)) {
    const t = trozo.trim().toUpperCase().replace(/\s+/g, '')
    if (!t) continue
    const m = /^#?(\d+(?:\.\d+)*)(FS|SS|FF)?([+-]\d+)?D?$/.exec(t)
    if (!m) return null
    // «58.1» es el número visible de una sub-fila; «59» es su id de siempre.
    const pred = porNumero.get(m[1]) ?? (m[1].includes('.') ? 0 : Number(m[1]))
    if (!pred || out.some(d => d.pred === pred)) return null
    out.push({ pred, tipo: (m[2] as TipoDep) ?? 'FS', lag: Number(m[3] ?? 0) })
  }
  return out
}

/** El inverso: FS con lag 0 se escribe solo con el número (como en Project). */
export function fmtDeps(preds: DepVista[] | undefined, numeros?: MapaNumeros): string {
  return (preds ?? []).map(p => {
    const lag = p.lag_dias ? (p.lag_dias > 0 ? `+${p.lag_dias}` : String(p.lag_dias)) : ''
    const tipo = p.tipo && p.tipo !== 'FS' ? p.tipo : (lag ? 'FS' : '')
    return `${numeros?.get(p.id) ?? p.id}${tipo}${lag}`
  }).join(';')
}
