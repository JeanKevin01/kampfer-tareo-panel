// Tendencia del PPC por mínimos cuadrados.
//
// Para el dueño de la empresa el dato no es el porcentaje de una semana suelta
// sino hacia dónde va: un 68% subiendo desde 50% y un 68% cayendo desde 85% se
// gestionan al revés.
//
// Solo entran las semanas CON veredicto. Una semana sin nada comprometido no es
// un 0%, es una semana sin dato, y meterla como cero inventaría una caída que
// nadie tuvo.

export interface Tendencia {
  /** Índice de la primera y última semana con dato, y su valor en la recta. */
  desde: number
  hasta: number
  yDesde: number
  yHasta: number
  /** Puntos porcentuales por semana (redondeado): +3 = sube 3 puntos por semana. */
  puntosPorSemana: number
}

/** `ppcs` en orden cronológico; `null` = semana sin veredicto. */
export function tendenciaPPC(ppcs: (number | null | undefined)[]): Tendencia | null {
  const pts: [number, number][] = []
  ppcs.forEach((v, i) => { if (v != null) pts.push([i, v]) })
  // Con menos de tres puntos una recta no es una tendencia, es unir dos puntos.
  if (pts.length < 3) return null
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  if (den === 0) return null
  const m = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / den
  const b = my - m * mx
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const desde = pts[0][0], hasta = pts[pts.length - 1][0]
  return {
    desde, hasta,
    yDesde: clamp(m * desde + b),
    yHasta: clamp(m * hasta + b),
    puntosPorSemana: Math.round(m * 100),
  }
}
