// Color por PERSONA en la hoja semanal de HH.
//
// EL PROBLEMA QUE RESUELVE
// Con la jerarquía OTM → partida → personal, quien excede su jornada aparece
// una vez por cada partida y proyecto donde estuvo. Pintar todas esas celdas
// del mismo ámbar de alerta dice «aquí hay cuatro problemas» pero no deja
// seguir a UNA persona entre partidas: cuatro trabajadores en conflicto el
// mismo día se ven como una mancha naranja continua. El color deja de
// significar «alerta» —de eso ya se encarga el ⚠— y pasa a significar QUIÉN.
//
// POR QUÉ CINCO Y NO SEIS
// Se validaron ambas opciones (dE76 sobre CIELAB, simulando deuteranopia,
// protanopia y tritanopia con las matrices de Viénot 1999):
//   · 6 tonos → peor par dE 8.8 en protanopia
//   · 5 tonos → peor par dE 15.7 en protanopia
// El sexto tono casi duplica la probabilidad de confusión de todos los demás,
// y los conflictos simultáneos de una semana rara vez pasan de cuatro. La
// sexta persona en adelante cae a gris, igual que la quinta empresa.
//
// CODIFICACIÓN SECUNDARIA (obligatoria a este nivel de separación)
// El color nunca va solo: el nombre del trabajador está escrito en su fila, y
// el mismo color aparece como punto junto a ese nombre. Quien no distinga dos
// tonos sigue leyendo el nombre y siguiendo el punto.
//
// ASIGNACIÓN ESTABLE
// El color sale del orden alfabético de los `trab_id` en conflicto, NO de la
// magnitud del exceso: si dependiera del ranking, corregir a una persona
// repintaría a todas las demás.
import { COLOR_EMPRESA } from '@/lib/empresas'

export interface ColorPersona { color: string; nombre: string }

export const COLOR_PERSONA: readonly ColorPersona[] = [
  // Los cuatro tonos ya validados del sistema (ver lib/empresas.ts)…
  ...COLOR_EMPRESA.map(c => ({ color: c.barra, nombre: c.nombre })),
  // …más el terracota, que separa por luminosidad justo donde el oliva y el
  // rosa se acercan en visión protán.
  { color: '#c2410c', nombre: 'terracota' },
]

/** De la sexta persona en adelante. Gris deliberado: sin color propio, pero
 *  con su nombre y su ⚠ como todas. */
export const COLOR_PERSONA_OTRAS: ColorPersona = { color: '#6b7280', nombre: 'gris' }

/** trab_id → color, estable dentro de la semana. `ids` se ordena aquí mismo
 *  para que el orden de llegada de los avisos no cambie los colores. */
export function mapaColorPersona(ids: Iterable<string>): Map<string, ColorPersona> {
  const unicos = [...new Set(ids)].sort()
  return new Map(unicos.map((id, i) => [
    id, i < COLOR_PERSONA.length ? COLOR_PERSONA[i] : COLOR_PERSONA_OTRAS,
  ]))
}

/** El mismo color en versión fondo: legible detrás de un número en los dos temas. */
export const fondoDe = (c: string, alpha = 0.22) => `${c}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
