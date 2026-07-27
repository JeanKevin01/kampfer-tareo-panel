// Pestaña activa de una página, guardada en la URL (?tab=…).
//
// Vive fuera del componente porque el lint del repo (react-refresh) solo deja
// exportar componentes desde los archivos de componentes.
import type { LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export interface TabDef { id: string; label: string; icon?: LucideIcon }

/** Que la pestaña viaje en la URL permite que los enlaces viejos del menú
 *  redirijan a su pestaña (/importar → /trabajadores?tab=importar) y que se
 *  pueda compartir una vista concreta. */
export function useTab(tabs: TabDef[], porDefecto?: string) {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tab') ?? ''
  const activo = tabs.some(t => t.id === pedido) ? pedido : (porDefecto ?? tabs[0].id)
  // replace: cambiar de pestaña no debe llenar el historial del navegador.
  const setTab = (id: string) => setParams(p => {
    const n = new URLSearchParams(p)
    n.set('tab', id)
    return n
  }, { replace: true })
  return [activo, setTab] as const
}
