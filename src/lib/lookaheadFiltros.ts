// Reglas de filtrado del LookAhead, fuera del componente.
//
// Viven aquí porque las usan DOS pantallas: la cuadrícula y la vista imprimible.
// Antes solo estaban en la cuadrícula, así que «Exportar PDF» salía con TODAS
// las actividades aunque la pantalla mostrara cuatro: filtrabas por OPEMIP,
// imprimías, y entregabas otra cosa. Un informe que no coincide con lo que se
// miró al decidir es peor que no tenerlo.
//
// Son funciones puras sobre datos ya cargados: no consultan nada.
import type { ActGrid } from '@/components/LookaheadGrid'

export interface FiltrosLookahead {
  q?: string
  supervisor?: string
  estado?: string
  /** nombre de empresa, o '__ext' para todo lo de terceros */
  empresa?: string
  soloRestriccion?: boolean
  soloRevisar?: boolean
  /** false = vista «Todo»: no se oculta nada por falta de trabajo */
  soloConTrabajo?: boolean
}

/** Claves con las que los filtros viajan en la URL. Una sola definición para
 *  que la cuadrícula y el enlace de impresión no se desincronicen. */
export const PARAMS_FILTRO = {
  q: 'q', supervisor: 'resp', estado: 'estado', empresa: 'emp',
  soloRestriccion: 'rest', soloRevisar: 'revisar', vista: 'vista',
} as const

export function leerFiltrosDeUrl(p: URLSearchParams): FiltrosLookahead {
  return {
    q: p.get(PARAMS_FILTRO.q) ?? '',
    supervisor: p.get(PARAMS_FILTRO.supervisor) ?? '',
    estado: p.get(PARAMS_FILTRO.estado) ?? '',
    empresa: p.get(PARAMS_FILTRO.empresa) ?? '',
    soloRestriccion: p.get(PARAMS_FILTRO.soloRestriccion) === '1',
    soloRevisar: p.get(PARAMS_FILTRO.soloRevisar) === '1',
    soloConTrabajo: p.get(PARAMS_FILTRO.vista) !== 'todo',
  }
}

/** Los filtros puestos, en palabras. Va impreso en la cabecera del PDF: quien
 *  lo recibe tiene que saber que está viendo un recorte y de qué. */
export function describirFiltros(f: FiltrosLookahead, etiquetaSup?: string): string[] {
  const out: string[] = []
  if (f.q) out.push(`busca «${f.q}»`)
  if (f.supervisor) out.push(`responsable: ${etiquetaSup || f.supervisor}`)
  if (f.estado) out.push(`estado: ${f.estado === 'NO_CUMPLIDA' ? 'no cumplida' : f.estado.toLowerCase()}`)
  if (f.empresa === '__ext') out.push('solo trabajo de terceros')
  else if (f.empresa) out.push(`empresa: ${f.empresa}`)
  if (f.soloRestriccion) out.push('solo con restricción pendiente')
  if (f.soloRevisar) out.push('solo por revisar')
  return out
}

export const hayFiltroPuesto = (f: FiltrosLookahead) =>
  !!(f.q || f.supervisor || f.estado || f.empresa || f.soloRestriccion || f.soloRevisar)

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** ¿Esta fila dice algo en la ventana visible? Ver el comentario largo de la
 *  vista inteligente en LookaheadGrid: lo que pide acción nunca se oculta, y
 *  una fila sin metrado (terceros, libre) cuenta por su barra de fechas. */
export function tieneTrabajoEn(a: ActGrid, fechas: string[], pideAccion: (a: ActGrid) => boolean) {
  if ((a.rest_pend ?? 0) > 0 || pideAccion(a)) return true
  const saltos = new Set(a.dias_salto ?? [])
  for (const f of fechas) {
    if (saltos.has(f)) continue
    if ((a.prog[f] ?? 0) > 0 || a.real[f] != null) return true
  }
  if (!a.metrado_prog && fechas.length) {
    const fin = a.fecha_fin || a.fecha
    if (a.fecha <= fechas[fechas.length - 1] && fin >= fechas[0]) return true
  }
  return false
}

/** ¿Pasa los filtros de texto/selector? No incluye la vista inteligente, que
 *  necesita las fechas y el árbol de padres. */
export function pasaFiltros(a: ActGrid, f: FiltrosLookahead, pideAccion: (a: ActGrid) => boolean) {
  if (f.supervisor && (a.supervisor_id ?? '') !== f.supervisor) return false
  if (f.estado && a.estado !== f.estado) return false
  if (f.empresa === '__ext' && !a.externa) return false
  if (f.empresa && f.empresa !== '__ext' && (a.empresa ?? '') !== f.empresa) return false
  if (f.soloRestriccion && !(a.rest_pend ?? 0)) return false
  if (f.soloRevisar && !pideAccion(a)) return false
  const q = norm((f.q ?? '').trim())
  if (!q) return true
  return norm([a.titulo, a.partida_codigo, a.partida_desc, a.hito_desc,
               a.supervisor_nombre, a.responsable, a.empresa, `#${a.id}`]
    .filter(Boolean).join(' ')).includes(q)
}
