// ============================================================
// catalogos.ts — fuente ÚNICA de siglas → etiquetas legibles.
// Alineado con los CHECK reales de la BD (migraciones 0014/0015/0012).
// Regla UX: en selects y tablas se muestra "SIGLA — Nombre largo",
// nunca la sigla sola.
// ============================================================

/** Tipos de recurso de los documentos de costo (costo_documentos.tipo_recurso). */
export const RECURSOS: Record<string, string> = {
  MAT: 'Materiales',
  EQP: 'Equipos propios',
  EQT: 'Equipos de terceros',
  SUB: 'Subcontratos',
  DIR: 'Dirección de obra',
  GG: 'Gastos generales',
  MO: 'Mano de obra',
}

/** Recursos que solo entran por el ajuste de planilla (CHECK mo_solo_ajuste). */
export const RECURSOS_ALTA_MANUAL = ['MAT', 'EQP', 'EQT', 'SUB', 'DIR', 'GG']

/** Tipos de documento de costo (costo_documentos.tipo_doc). */
export const TIPOS_DOC: Record<string, string> = {
  FACTURA: 'Factura',
  OC: 'Orden de compra',
  VALE: 'Vale de almacén',
  PLANILLA_AJUSTE: 'Ajuste de planilla',
  OTRO: 'Otro documento',
}
export const TIPOS_DOC_ALTA_MANUAL = ['FACTURA', 'OC', 'VALE', 'OTRO']

/** Recursos del APU del presupuesto meta (apu_recursos.tipo). */
export const RECURSOS_APU: Record<string, string> = {
  MO: 'Mano de obra',
  MAT: 'Materiales',
  EQ: 'Equipos',
  SUB: 'Subpartidas',
}

/** Conceptos de venta estilo T OBRA (venta_ajustes.tipo). */
export const CONCEPTOS_VENTA: Record<string, string> = {
  CONTRACTUAL: 'Contractual',
  DIF_METRADO: 'Diferencia de metrado',
  NUEVAS_PARTIDAS: 'Nuevas partidas',
  POR_APROBAR: 'Por aprobar',
  REAJUSTE: 'Reajuste',
  TERCEROS: 'Terceros',
}

/** "SIGLA — Nombre largo" (o la sigla sola si no está en el diccionario). */
export const etiqueta = (dic: Record<string, string>, sigla?: string | null): string =>
  sigla ? (dic[sigla] ? `${sigla} — ${dic[sigla]}` : sigla) : '—'

/** Solo el nombre largo (para tooltips/cabeceras donde la sigla ya se ve). */
export const nombreLargo = (dic: Record<string, string>, sigla?: string | null): string =>
  (sigla && dic[sigla]) || sigla || '—'

// ── Catálogo de fases (tabla `fases` del API, GET /ev/fases) ──
export interface Fase {
  id: number
  codigo: string
  nombre: string
  descripcion?: string | null
  color?: string | null
  orden: number
  activo: boolean
}

export const etiquetaFase = (f: Pick<Fase, 'codigo' | 'nombre'>): string =>
  `${f.codigo} — ${f.nombre}`

/** Nombre de una fase a partir de su código, con fallback al código. */
export const nombreFase = (fases: Fase[] | undefined, codigo?: string | null): string => {
  if (!codigo) return '—'
  const f = (fases ?? []).find((x) => x.codigo === codigo)
  return f ? etiquetaFase(f) : codigo
}
