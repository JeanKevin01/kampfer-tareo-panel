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
export const NIVEL_TXT: Record<string, string> = {
  verde: 'text-green-300 font-bold', ambar: 'text-amber-300 font-bold',
  rojo: 'text-red-300 font-bold', celeste: 'text-sky-300 font-medium', gris: '',
}
export const NIVEL_BG: Record<string, string> = {
  verde: 'bg-green-500/25', ambar: 'bg-amber-500/25', rojo: 'bg-red-500/25',
  celeste: 'bg-sky-500/20', gris: 'bg-zinc-700/30',
}
export const NIVEL_RGBA: Record<string, string> = {
  verde: 'rgba(34,197,94,0.25)', ambar: 'rgba(245,158,11,0.25)',
  rojo: 'rgba(239,68,68,0.25)', celeste: 'rgba(14,165,233,0.20)',
  gris: 'rgba(63,63,70,0.30)',
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
