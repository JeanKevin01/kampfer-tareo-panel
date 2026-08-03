// ── Lectura de hojas Excel subidas por el usuario ────────────
//
// POR QUÉ EXISTE ESTO
// `XLSX.utils.sheet_to_json(hoja)` da por hecho que la cabecera es la FILA 1.
// Las plantillas que reparte el panel no son así: llevan encima el título, el
// bloque «CÓMO LLENARLA» y, en algunas, una banda de grupos — la cabecera real
// cae en la fila 14, 15 o 16 según la plantilla. Resultado: el usuario llenaba
// la plantilla tal como se le indicaba y al subirla TODAS las filas salían con
// «CODIGO vacío» (309 de 309, reportado por Jean el 2026-08-02).
//
// El arreglo no es restar un offset fijo: la fila depende de cuántas líneas de
// instrucciones tenga cada plantilla y volvería a romperse al editarlas. Se
// BUSCA la cabecera por sus nombres de columna. De paso, esto acepta los
// archivos que el usuario arma a mano con una fila de título encima, que antes
// también fallaban.
import * as XLSX from 'xlsx'

/** Quita lo que no sea ASCII. Con NFD la tilde queda suelta y se cae aquí. */
const soloAscii = (s: string) =>
  Array.from(s).filter(c => c.charCodeAt(0) < 128).join('')

/** MAYÚSCULAS, sin tildes, espacios → _ . Mismo criterio que `_norm` del API. */
export const normClave = (v: unknown): string =>
  soloAscii(String(v ?? '').normalize('NFD')).trim().toUpperCase().replace(/\s+/g, '_')

/** Marca de la fila de EJEMPLO que las plantillas dibujan en el margen. */
const MARCA_EJEMPLO = '▸'

/** Clave bajo la que cada fila lleva su número real de fila en Excel. */
export const FILA_EXCEL = '__fila_excel'

/** Hasta dónde se busca la cabecera. La más profunda hoy cae en la 16. */
const MAX_BUSQUEDA = 40

/**
 * Localiza la fila de cabecera de la hoja y devuelve sus filas de datos.
 *
 * @param claves nombres de columna que identifican la cabecera (los que el
 *        importador va a leer). Basta con que aparezcan 2 para reconocerla.
 * @returns `filas` con las claves tal cual las escribió Excel; cada una lleva su
 *          número de fila REAL de Excel en `FILA_EXCEL`, y `filaCabecera` es la
 *          de la cabecera. Los importadores lo usan para señalar el error en la
 *          fila que el usuario ve en su pantalla — que no es el índice del
 *          array en cuanto haya una fila en blanco o un ejemplo descartado.
 */
export function leerHoja(
  ws: XLSX.WorkSheet, claves: string[],
): { filas: Record<string, unknown>[]; filaCabecera: number } {
  const buscadas = new Set(claves.map(normClave))
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true })

  let mejor = 0
  let mejorAciertos = 0
  for (let r = 0; r < Math.min(aoa.length, MAX_BUSQUEDA); r++) {
    const fila = aoa[r] ?? []
    const aciertos = fila.filter(v => buscadas.has(normClave(v))).length
    // `>` y no `>=`: ante empate gana la primera. La banda de grupos de la
    // plantilla de partidas («IDENTIFICACIÓN», «MEDICIÓN») va justo encima de
    // la cabecera real y no acierta ninguna clave, así que no compite.
    if (aciertos > mejorAciertos) { mejorAciertos = aciertos; mejor = r }
  }
  // Con menos de 2 coincidencias no se reconoció nada: se vuelve al
  // comportamiento de siempre (fila 1) en vez de inventar un corte y devolver
  // basura en silencio.
  if (mejorAciertos < 2) mejor = 0

  // Las filas se arman a mano en vez de con `sheet_to_json(range)` para poder
  // conservar el número de fila REAL: en cuanto se descarta una (ejemplo o fila
  // en blanco), el índice del array deja de coincidir con lo que ve el usuario
  // y el error acaba señalando una fila que está bien.
  const cabecera = (aoa[mejor] ?? []).map(v => String(v ?? '').trim())
  const filas: Record<string, unknown>[] = []
  for (let r = mejor + 1; r < aoa.length; r++) {
    const cruda = aoa[r] ?? []
    // La fila de ejemplo de la plantilla va marcada con ▸ en el margen. Las
    // instrucciones piden borrarla, pero si se queda no debe colarse como un
    // dato real: es lo que pasaría, y encima con pinta de dato bueno.
    if (cruda.some(v => String(v ?? '').trim() === MARCA_EJEMPLO)) continue
    if (!cruda.some(v => String(v ?? '').trim() !== '')) continue      // fila vacía
    const fila: Record<string, unknown> = { [FILA_EXCEL]: r + 1 }
    cabecera.forEach((clave, i) => {
      if (clave) fila[clave] = cruda[i] ?? ''
    })
    filas.push(fila)
  }
  return { filas, filaCabecera: mejor + 1 }
}

/**
 * La hoja de la que hay que leer: la que se llama `nombre` o, si no está, la
 * primera que NO sea una hoja de apoyo de la plantilla.
 */
export function hojaDeDatos(wb: XLSX.WorkBook, nombre?: string): XLSX.WorkSheet | null {
  if (nombre && wb.Sheets[nombre]) return wb.Sheets[nombre]
  const apoyo = new Set(['INSTRUCCIONES', 'CATALOGOS', 'LEYENDA', 'COMO FUNCIONA'].map(normClave))
  const util = wb.SheetNames.find(n => !apoyo.has(normClave(n)))
  return util ? wb.Sheets[util] : (wb.Sheets[wb.SheetNames[0]] ?? null)
}
