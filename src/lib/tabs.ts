// Pestaña activa de una página, guardada en la URL (?tab=…).
//
// Vive fuera del componente porque el lint del repo (react-refresh) solo deja
// exportar componentes desde los archivos de componentes.
import type { LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export interface TabDef { id: string; label: string; icon?: LucideIcon }

/** Que la pestaña viaje en la URL permite que los enlaces viejos del menú
 *  redirijan a su pestaña (/importar → /trabajadores?tab=importar) y que se
 *  pueda compartir una vista concreta.
 *
 *  El id que devuelve se DERIVA de las pestañas recibidas: si la lista se
 *  declara `as const`, sale la unión de sus ids y comparar contra una pestaña
 *  que no existe es un error de compilación. Antes la página tenía que afirmar
 *  esa unión a mano con un `as`, y al añadir la pestaña «Fiabilidad» nadie
 *  actualizó la afirmación: `vista === 'fiabilidad'` quedó marcado como
 *  comparación imposible aunque la pestaña funcionaba. Con una lista anotada
 *  `TabDef[]` el id sigue siendo `string`, así que las demás páginas no cambian. */
export function useTab<T extends readonly TabDef[]>(tabs: T, porDefecto?: T[number]['id']) {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tab') ?? ''
  const activo = tabs.some(t => t.id === pedido) ? pedido : (porDefecto ?? tabs[0].id)
  // replace: cambiar de pestaña no debe llenar el historial del navegador.
  const setTab = (id: string) => setParams(p => {
    const n = new URLSearchParams(p)
    n.set('tab', id)
    return n
  }, { replace: true })
  return [activo as T[number]['id'], setTab] as const
}
