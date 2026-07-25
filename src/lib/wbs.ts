// Helpers compartidos para las vistas jerárquicas WBS (ISP / Partidas / Avances /
// Configuración / Control Diario) — mismo esquema de niveles y colores en todas.

// Paleta theme-aware (misma que el árbol de Partidas / WBSArbol): el texto y el
// borde salen de variables var(--nivel-*) que se oscurecen en modo claro (ver
// index.css); la banda de fondo es un tinte pastel muy tenue que funciona en
// ambos temas. Así TODAS las vistas jerárquicas (Partidas, Avances,
// Configuración, ISP) se ven idénticas y legibles en claro y oscuro.
export const NIVEL_COLOR: Record<number, { text: string; bg: string; border: string; bold: boolean }> = {
  1: { text:'var(--nivel-1)', bg:'rgba(255,123,123,0.16)', border:'var(--nivel-1)', bold:true  }, // Raíz
  2: { text:'var(--nivel-2)', bg:'rgba(127,224,212,0.15)', border:'var(--nivel-2)', bold:true  }, // Sección
  3: { text:'var(--nivel-3)', bg:'rgba(214,179,255,0.14)', border:'var(--nivel-3)', bold:false }, // Sub-sección
  4: { text:'var(--nivel-4)', bg:'rgba(255,201,139,0.13)', border:'var(--nivel-4)', bold:false }, // Detalle
}
export const NIVEL_DEFAULT = { text:'rgb(var(--k-text2))', bg:'rgba(184,196,217,0.10)', border:'rgb(var(--k-text2))', bold:false }

export const NIVEL_LABELS: [number, string, string][] = [
  [1,'var(--nivel-1)','Raíz'], [2,'var(--nivel-2)','Sección'], [3,'var(--nivel-3)','Sub-sección'], [4,'var(--nivel-4)','Detalle'],
]

export const FASE_COLOR: Record<string,string> = {
  FAB:'var(--fase-fab)', EST:'var(--fase-est)', MEC:'var(--fase-mec)', ELE:'var(--fase-ele)',
  TUB:'var(--fase-tub)', INS:'var(--fase-ins)', CIV:'var(--fase-civ)', AND:'var(--fase-and)',
  APY:'var(--fase-apy)', ING:'var(--fase-ing)', COM:'var(--fase-com)', MON:'var(--fase-mon)', TRA:'var(--fase-tra)',
}

export const faseColor = (fase?: string | null) =>
  FASE_COLOR[(fase ?? '').split('.')[0]] ?? 'rgb(var(--k-text2))'

export interface WbsBase { codigo: string; parent_codigo: string | null; nivel: number }
export interface WbsNode<T> { item: T; codigo: string; nivel: number; children: WbsNode<T>[] }

// Construye el árbol a partir de codigo/parent_codigo y lo ordena por código.
export function buildWbsTree<T extends WbsBase>(items: T[]): WbsNode<T>[] {
  const map = new Map<string, WbsNode<T>>()
  items.forEach(it => map.set(it.codigo, { item: it, codigo: it.codigo, nivel: it.nivel || 1, children: [] }))
  const roots: WbsNode<T>[] = []
  map.forEach(n => {
    const parent = n.item.parent_codigo && map.get(n.item.parent_codigo)
    if (parent) parent.children.push(n)
    else roots.push(n)
  })
  const sort = (ns: WbsNode<T>[]) => { ns.sort((a,b)=>a.codigo.localeCompare(b.codigo)); ns.forEach(x=>sort(x.children)) }
  sort(roots)
  return roots
}

// Recorre el árbol en orden, devolviendo nodos visibles según el set de colapsados.
export function flattenVisible<T>(roots: WbsNode<T>[], collapsed: Set<string>): WbsNode<T>[] {
  const out: WbsNode<T>[] = []
  const walk = (n: WbsNode<T>) => {
    out.push(n)
    if (!collapsed.has(n.codigo)) n.children.forEach(walk)
  }
  roots.forEach(walk)
  return out
}

// Estilo de fila según nivel / hoja, reutilizable.
export function nivelStyle(nivel: number, esHoja: boolean, fase?: string | null) {
  if (esHoja) {
    const c = faseColor(fase)
    return { text: c, bg: 'transparent', border: c, bold: false }
  }
  return NIVEL_COLOR[nivel] ?? NIVEL_DEFAULT
}
