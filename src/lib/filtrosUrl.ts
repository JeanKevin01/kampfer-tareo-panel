// Filtros guardados en la URL (?emp=OPEMIP&estado=PROGRAMADO…).
//
// Dos cosas que no se podían hacer antes:
//  1. Volver donde estabas. Recargar o ir y venir de una pestaña reseteaba
//     todos los filtros, así que el planner los volvía a poner cada vez.
//  2. MANDAR la vista. «Mira las 4 filas que dependen de OPEMIP» se explicaba
//     por chat («entra, filtra por empresa, elige…»); ahora es un enlace.
//
// Mismo patrón que `useTab`: vive fuera de los componentes porque el lint del
// repo (react-refresh) solo deja exportar componentes desde archivos de
// componentes, y escribe con `replace` para no llenar el historial del
// navegador — cambiar un filtro no es navegar.
//
// El valor por defecto NO se escribe: la URL solo lleva lo que está puesto, así
// que un enlace sin parámetros es «sin filtros» y se lee de un vistazo.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Filtro de texto (o de opción) en la URL. */
export function useParamTexto(clave: string, porDefecto = ''): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams()
  const valor = params.get(clave) ?? porDefecto
  const set = useCallback((v: string) => setParams(p => {
    const n = new URLSearchParams(p)
    if (!v || v === porDefecto) n.delete(clave); else n.set(clave, v)
    return n
  }, { replace: true }), [clave, porDefecto, setParams])
  return [valor, set]
}

/** Casilla en la URL: presente = marcada. */
export function useParamBool(clave: string): [boolean, (v: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const valor = params.get(clave) === '1'
  const set = useCallback((v: boolean) => setParams(p => {
    const n = new URLSearchParams(p)
    if (v) n.set(clave, '1'); else n.delete(clave)
    return n
  }, { replace: true }), [clave, setParams])
  return [valor, set]
}

/** Número en la URL, con su valor por defecto fuera de la barra de direcciones. */
export function useParamNum(clave: string, porDefecto: number): [number, (v: number) => void] {
  const [texto, setTexto] = useParamTexto(clave, String(porDefecto))
  const n = Number(texto)
  const set = useCallback((v: number) => setTexto(String(v)), [setTexto])
  return [Number.isFinite(n) ? n : porDefecto, set]
}
