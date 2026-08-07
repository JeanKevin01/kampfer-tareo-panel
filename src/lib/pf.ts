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

/** Contexto opcional para desambiguar el `pf = 0` que emite el API. */
export interface CtxPF {
  /** HH gastadas del mismo grupo/partida. Ver la nota de `nivelPF`. */
  hhGastadas?: number | null
}

/**
 * El API emite `pf = 0` en DOS situaciones que no son la misma cosa
 * (`_engine.py`: `round(ganadas/gastadas, 3) if gastadas > 0 else 0`):
 *
 *   a) `gastadas == 0` → no se sabe. No hay tareo contra qué medir. → sin-dato
 *   b) `gastadas > 0` y `ganadas == 0` → se quemaron HH y no se ganó ninguna.
 *      Es el PEOR caso real que existe, y la 1ª versión de este archivo lo
 *      pintaba gris «sin dato» junto con el (a) — justo el caso que la tesis
 *      necesita ver (auditoría 2026-08-06, 2ª ronda).
 *
 * Desde el PF solo no se distinguen, así que el llamante pasa `hhGastadas`
 * cuando lo tiene. Sin ese dato se sigue asumiendo (a): callar antes que
 * acusar en falso, que es la misma prudencia de la banda ancha.
 *
 * Nota: el API redondea a 3 decimales, así que un PF de 0,0004 también llega
 * como `0.0` — y con HH gastadas encima, `malo` es la lectura correcta.
 */
export function nivelPF(pf: number | null | undefined, ctx?: CtxPF): NivelPF {
  if (pf === null || pf === undefined || !isFinite(pf)) return 'sin-dato'
  if (pf === 0) return (ctx?.hhGastadas ?? 0) > 0 ? 'malo' : 'sin-dato'
  if (pf >= PF_IMPLAUSIBLE) return 'implausible'
  if (pf > PF_MAX_SANO)     return 'alto'
  if (pf >= PF_MIN_SANO)    return 'sano'
  if (pf >= PF_MALO)        return 'bajo'
  return 'malo'
}

/** Clases de color por nivel. Dos notas deliberadas:
 *  - `implausible` NO es verde: un número que no puede ser cierto no se premia.
 *  - `alto` NO es verde tampoco. Compartía color con `sano` y eso dejaba la
 *    banda 1,25–1,50 indistinguible de un PF conforme: en la práctica solo
 *    movía el techo del verde de 1,00 a 1,50, sin avisar de nada. `k-alerta`
 *    significa «mirar esto», y un PF por encima de lo típico hay que mirarlo
 *    igual que uno por debajo — el signo lo dice el propio número. */
export const CLASE_PF: Record<NivelPF, { texto: string; fondo: string; borde: string }> = {
  sano:        { texto: 'text-k-green', fondo: 'bg-green-500/10', borde: 'border-green-500/20' },
  alto:        { texto: 'text-k-alerta', fondo: 'bg-amber-500/10', borde: 'border-amber-500/25' },
  bajo:        { texto: 'text-k-alerta', fondo: 'bg-amber-500/10', borde: 'border-amber-500/25' },
  malo:        { texto: 'text-k-red',   fondo: 'bg-red-500/10',   borde: 'border-red-500/20' },
  implausible: { texto: 'text-k-text3', fondo: 'bg-k-raised',     borde: 'border-k-alerta/40' },
  'sin-dato':  { texto: 'text-k-text3', fondo: 'bg-k-raised',     borde: 'border-k-border' },
}

/** Aviso para el usuario, o null si el número no necesita explicación. */
export function avisoPF(pf: number | null | undefined, ctx?: CtxPF): string | null {
  const n = nivelPF(pf, ctx)
  if (n === 'implausible')
    return 'Revisar: un PF así suele significar avance registrado sin su tareo, '
         + 'no productividad real. Comprobar las HH del periodo antes de publicarlo.'
  if (n === 'alto')
    return `Por encima de lo típico (>${PF_MAX_SANO}). Puede ser real, pero conviene `
         + 'comprobar que el tareo de esas partidas esté completo antes de publicarlo.'
  if (n === 'malo' && pf === 0)
    return 'Se consumieron HH y no se ganó ninguna: hay tareo sin avance registrado, '
         + 'o el avance está cargado en otra partida.'
  return null
}
