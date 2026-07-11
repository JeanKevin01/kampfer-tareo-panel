// Helpers de semana calendario (Lun-Dom) para Programación y sus vistas.

/** El lunes de la semana a la que pertenece la fecha. */
export const lunesDe = (d: Date): Date => {
  const x = new Date(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/** 'YYYY-MM-DD' en hora local (sin sorpresas de zona horaria de toISOString). */
export const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
