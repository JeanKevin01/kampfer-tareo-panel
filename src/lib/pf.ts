// ============================================================
// Plausibilidad del Factor de Productividad (PF / CPI).
//
// Por qué existe (auditoría 2026-08-06):
// el semáforo era `pf >= 1 ? verde : rojo`. Tiene suelo pero NO TECHO, así que
// un PF de 80,74 salía tan verde como uno de 1,02. Y un PF de 80 no es
// productividad: significa «gané 80 horas por cada hora trabajada», que es
// físicamente imposible. Es la firma de AVANCE REGISTRADO SIN TAREO.
//
// Es la doctrina §8.2 del plan aplicada al PF. La pregunta obligatoria ante
// cualquier indicador es «¿cómo lo subiría yo sin trabajar?»; para el PF la
// respuesta es inmediata —registrar avance y no tarear— y hasta ahora no había
// ninguna defensa: el color premiaba el error.
//
// ⚠️ UMBRALES PROVISIONALES ⚠️
// Los cuatro números de abajo son un marcador de posición, NO un resultado.
// El plan (§12.2, T7) prohíbe explícitamente adoptar umbrales de la literatura:
// se calibran con las primeras 4-6 semanas reales de obra. Hasta entonces, la
// banda está deliberadamente ancha: prefiere callar a dar un falso positivo.
// Al calibrar, cambiar SOLO estas constantes — no hay umbrales sueltos por las
// páginas, y esa es la gracia de que vivan aquí.
// ============================================================

/** Por debajo: se gasta más de lo ganado. Desvío real, no error de captura. */
export const PF_MIN_SANO = 0.95
/** Por encima: sigue siendo plausible (obra eficiente, buen presupuesto). */
export const PF_MAX_SANO = 1.25
/** A partir de aquí deja de ser creíble como productividad. */
export const PF_IMPLAUSIBLE = 1.5
/** Bajo esto, el desvío es grave. */
export const PF_MALO = 0.85

export type NivelPF = 'sano' | 'alto' | 'bajo' | 'malo' | 'implausible' | 'sin-dato'

export function nivelPF(pf: number | null | undefined): NivelPF {
  if (pf === null || pf === undefined || !isFinite(pf) || pf === 0) return 'sin-dato'
  if (pf >= PF_IMPLAUSIBLE) return 'implausible'
  if (pf > PF_MAX_SANO)     return 'alto'
  if (pf >= PF_MIN_SANO)    return 'sano'
  if (pf >= PF_MALO)        return 'bajo'
  return 'malo'
}

/** Clases de color por nivel. Nota deliberada: `implausible` NO es verde.
 *  Un número que no puede ser cierto no se premia; se manda a revisar. */
export const CLASE_PF: Record<NivelPF, { texto: string; fondo: string; borde: string }> = {
  sano:        { texto: 'text-k-green', fondo: 'bg-green-500/10', borde: 'border-green-500/20' },
  alto:        { texto: 'text-k-green', fondo: 'bg-green-500/10', borde: 'border-green-500/20' },
  bajo:        { texto: 'text-k-alerta', fondo: 'bg-amber-500/10', borde: 'border-amber-500/25' },
  malo:        { texto: 'text-k-red',   fondo: 'bg-red-500/10',   borde: 'border-red-500/20' },
  implausible: { texto: 'text-k-text3', fondo: 'bg-k-raised',     borde: 'border-k-alerta/40' },
  'sin-dato':  { texto: 'text-k-text3', fondo: 'bg-k-raised',     borde: 'border-k-border' },
}

/** Aviso para el usuario, o null si el número es creíble. */
export function avisoPF(pf: number | null | undefined): string | null {
  if (nivelPF(pf) !== 'implausible') return null
  return 'Revisar: un PF así suele significar avance registrado sin su tareo, '
       + 'no productividad real. Comprobar las HH del periodo antes de publicarlo.'
}
