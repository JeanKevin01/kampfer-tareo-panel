// Mensaje legible de un fallo del API.
//
// Vive en lib/ y no junto a <EstadoQuery> porque exportar helpers desde un
// archivo de componentes rompe react-refresh (convención del repo).
import { ApiError } from './api'

/** Prefiere el `detail` real del backend: el API se toma la molestia de
 *  escribirlos accionables («No hay periodos: crea el primero en la página
 *  Costos/Periodos») y descartarlos es desperdiciar ese trabajo. */
export function mensajeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'Tu usuario no tiene permiso para ver esto.'
    if (e.status === 404) return e.detail || 'No encontrado'
    return e.detail || `Error ${e.status}`
  }
  if (e instanceof Error) return e.message
  return 'No se pudo contactar al servidor'
}
