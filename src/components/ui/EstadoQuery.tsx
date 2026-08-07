// ============================================================
// EstadoQuery — los CUATRO estados de una consulta al API, explícitos.
//
// Por qué existe (auditoría 2026-08-06, hallazgo A):
// el panel venía escribiendo `const { data: filas = [] } = useQuery(...)`. Ese
// valor por defecto borra la diferencia entre «la lista está vacía» y «no pude
// leer la lista», y a partir de ahí la UI afirmaba cosas falsas: «Sin conflictos
// pendientes ✓» cuando el endpoint daba 403, o «registra avances semanales
// primero» cuando el endpoint daba 500 y los avances ya existían.
//
// Los cuatro estados NO son tres. El cuarto —precondición— es el que dejaba la
// pantalla del Resultado Operativo completamente muda: con `enabled: false` la
// consulta no corre, así que no hay carga, ni error, ni datos, y todas las ramas
// son falsas a la vez.
//
//   cargando      · la consulta está en vuelo
//   error         · el API respondió mal (403, 500, red caída) → SE DICE
//   precondición  · la consulta ni siquiera corrió porque falta algo antes
//   vacío / datos · la consulta respondió, y entonces sí se puede afirmar
//
// Regla: un ✓ o cualquier afirmación en positivo solo puede vivir en `vacio`.
// Si aparece en cualquier otra rama, se está afirmando sin haber mirado.
// ============================================================
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'

import { mensajeError } from '@/lib/errores'

interface Props<T> {
  q: UseQueryResult<T>
  /** Qué decir cuando la consulta SÍ respondió y de verdad no hay nada.
   *  Es el único sitio donde puede ir un ✓. */
  vacio?: ReactNode
  /** `true` cuando de verdad no hay nada. Por defecto: array vacío. */
  esVacio?: (data: T) => boolean
  /** Qué falta antes de poder consultar (p. ej. «crea un periodo»). Si viene,
   *  gana sobre todo lo demás: la consulta está deshabilitada a propósito. */
  precondicion?: ReactNode
  /** Texto de la fase de carga. */
  cargando?: string
  /** Versión de una sola línea, para bloques de texto sin tarjeta. */
  linea?: boolean
  children: (data: T) => ReactNode
}

const vacioPorDefecto = (d: unknown) =>
  Array.isArray(d) ? d.length === 0 : d === null || d === undefined

export function EstadoQuery<T>({
  q, vacio, esVacio, precondicion, cargando = 'Cargando…', linea, children,
}: Props<T>) {
  if (precondicion) {
    return linea
      ? <p className="text-xs text-k-text3">{precondicion}</p>
      : <div className="bg-k-raised border border-k-border rounded-xl p-6 text-center
                        text-k-text3 text-sm">{precondicion}</div>
  }

  if (q.isPending) {
    return linea
      ? <p className="text-xs text-k-text3">{cargando}</p>
      : <p className="text-k-text3 text-sm flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {cargando}
        </p>
  }

  if (q.isError) {
    const msg = mensajeError(q.error)
    return linea
      ? (
        <p className="text-xs text-k-red flex items-center gap-1.5">
          <AlertTriangle size={12} className="flex-shrink-0" />
          No se pudo comprobar: {msg}
          <button onClick={() => void q.refetch()}
            className="underline underline-offset-2 hover:text-k-text2">reintentar</button>
        </p>
      )
      : (
        <div className="bg-k-surface border border-k-red/25 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-k-red flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-k-red">No se pudo cargar</p>
            <p className="text-xs text-k-text3 mt-0.5">{msg}</p>
          </div>
          <button onClick={() => void q.refetch()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-k-raised
                       border border-k-border text-k-text2 text-xs hover:border-k-border2">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )
  }

  const data = q.data as T
  const estaVacio = esVacio ? esVacio(data) : vacioPorDefecto(data)
  if (vacio && estaVacio) {
    return linea ? <p className="text-xs text-k-text3">{vacio}</p> : <>{vacio}</>
  }

  return <>{children(data)}</>
}
