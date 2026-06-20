// Helpers compartidos para las vistas jerárquicas WBS (ISP / Partidas / Avances /
// Configuración / Control Diario) — mismo esquema de niveles y colores en todas.

export const NIVEL_COLOR: Record<number, { text: string; bg: string; border: string; bold: boolean }> = {
    1: { text:'#FF9B9B', bg:'rgba(255,123,123,0.16)', border:'#FF9B9B', bold:true  }, // Raíz
    2: { text:'#7FE0D4', bg:'rgba(127,224,212,0.15)', border:'#7FE0D4', bold:true  }, // Sección
    3: { text:'#D6B3FF', bg:'rgba(214,179,255,0.14)', border:'#D6B3FF', bold:false }, // Sub-sección
    4: { text:'#FFC98B', bg:'rgba(255,201,139,0.13)', border:'#FFC98B', bold:false }, // Detalle
  }
  export const NIVEL_DEFAULT = { text:'#B8C4D9', bg:'rgba(184,196,217,0.08)', border:'#B8C4D9', bold:false }
  
  export const NIVEL_LABELS: [number, string, string][] = [
    [1,'#FF9B9B','Raíz'], [2,'#7FE0D4','Sección'], [3,'#D6B3FF','Sub-sección'], [4,'#FFC98B','Detalle'],
  ]
  
  export const FASE_COLOR: Record<string,string> = {
    FAB:'#2DD4A8', EST:'#60A5FA', MEC:'#FB923C', ELE:'#FACC15',
    TUB:'#A78BFA', INS:'#F472B6', CIV:'#94A3B8', AND:'#34D399',
    APY:'#86EFAC', ING:'#FCD34D', COM:'#C4B5FD', MON:'#E879F9', TRA:'#7FE3A0',
  }
  
  export const faseColor = (fase?: string | null) =>
    FASE_COLOR[(fase ?? '').split('.')[0]] ?? '#94A3B8'
  
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
  