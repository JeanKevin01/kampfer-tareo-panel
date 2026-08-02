// Color por empresa para las barras de trabajo de terceros en el LookAhead.
//
// POR QUÉ SOLO CUATRO COLORES
// El panel ya tiene cuatro tonos con SIGNIFICADO reservado: ámbar = lo previsto,
// verde = hecho y conforme, rojo = problema, azul = información / avance real.
// Un quinto color de identidad tendría que salir de esos cuatro, y entonces una
// barra «empresa X» se leería como «actividad cumplida» o «actividad con
// problema». La paleta de abajo son los cuatro tonos que quedan libres y que
// además pasan la validación de daltonismo contra el fondo oscuro y el claro
// (peor par ΔE 7.9 deutan / 16.9 visión normal — dentro de la banda que exige
// codificación secundaria, ver más abajo).
//
// LA CODIFICACIÓN SECUNDARIA
// El nombre de la empresa va ESCRITO dentro de la barra, siempre. El color
// acelera la lectura, no la sostiene: quien no distinga dos tonos sigue leyendo
// el nombre. Por eso la 5ª empresa en adelante puede caer a gris sin perder
// información — y por eso existe el filtro por empresa, que es la forma seria de
// aislar una cuando hay muchas.
//
// ASIGNACIÓN ESTABLE
// El color sale de la posición de la empresa en `GET /ev/programacion/empresas`,
// que viene ordenado por primera aparición. Una empresa nueva entra al final y
// no repinta a las demás; si el orden fuera por frecuencia, la barra cambiaría
// de color sola.

export interface EmpresaUsada { empresa: string; n: number; ultima?: string; orden?: number }

/** Los cuatro tonos libres, en orden fijo. NO ampliar sin volver a validar:
 *  cualquier quinto tono invade la semántica (ámbar/verde/rojo/azul). */
export const COLOR_EMPRESA = [
  { barra: '#8b7cf5', texto: '#ffffff', nombre: 'violeta' },
  { barra: '#1f9cb8', texto: '#ffffff', nombre: 'cian' },
  { barra: '#d4548a', texto: '#ffffff', nombre: 'rosa' },
  { barra: '#8a8f2e', texto: '#ffffff', nombre: 'oliva' },
] as const

/** La 5ª empresa en adelante. Gris deliberado: sin color propio, pero con su
 *  nombre en la barra igual que las demás. */
export const COLOR_EMPRESA_OTRAS = { barra: '#6b7280', texto: '#ffffff', nombre: 'gris' }

/** Índice → color. `orden` es la posición en el catálogo (primera aparición). */
export function colorDeOrden(orden: number | undefined | null) {
  if (orden == null || orden < 0 || orden >= COLOR_EMPRESA.length) return COLOR_EMPRESA_OTRAS
  return COLOR_EMPRESA[orden]
}

/** Mapa empresa → color, listo para el grid. Las que no tienen empresa escrita
 *  no entran: su barra usa el gris de «otras». */
export function mapaColores(empresas: EmpresaUsada[] | undefined) {
  const m = new Map<string, typeof COLOR_EMPRESA_OTRAS | (typeof COLOR_EMPRESA)[number]>()
  ;(empresas ?? []).forEach((e, i) => m.set(e.empresa, colorDeOrden(e.orden ?? i)))
  return m
}
