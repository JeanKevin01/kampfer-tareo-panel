// WBSArbol.tsx — Vista de árbol WBS completo con rollup de valores EV
import { useState, useMemo, useCallback } from 'react'
import { useQuery }  from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

const FASE_COLOR: Record<string, string> = {
  FAB:'#1D9E75', EST:'#3B82F6', MEC:'#D85A30', ELE:'#BA7517',
  TUB:'#7F77DD', INS:'#D4537E', CIV:'#888780', AND:'#0F8C6A',
  APY:'#639922', ING:'#D97706', COM:'#7C3ABD',
}

interface Fila {
  id: number; codigo: string; otm_id: string; fase: string|null; sub_fase: string|null
  descripcion: string; unidad: string|null; hh_presup: number
  nivel: number; parent_codigo: string|null; es_hoja: boolean
  hh_ganadas_acum: number; hh_gastadas_acum: number; pct_avance: number; pf_acum: number
}
interface Nodo extends Fila {
  children: Nodo[]
  // rollup (calculado desde hijos para padres)
  r_hh_gan: number; r_hh_gast: number; r_pct: number; r_pf: number
}

function pct(v: number) { return (v*100).toFixed(1)+'%' }
function hh(v: number)  { return v > 0 ? v.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—' }
function pff(v: number, gast: number) {
  if (gast <= 0) return '—'
  const f = v/gast
  return <span style={{ color: f >= 1 ? '#10b981' : f >= 0.85 ? '#f59e0b' : '#ef4444', fontWeight:600 }}>{f.toFixed(2)}</span>
}

function buildTree(filas: Fila[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const f of filas) {
    map.set(f.codigo, { ...f, children: [], r_hh_gan:0, r_hh_gast:0, r_pct:0, r_pf:0 })
  }
  const roots: Nodo[] = []
  for (const node of map.values()) {
    if (node.parent_codigo && map.has(node.parent_codigo)) {
      map.get(node.parent_codigo)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sort = (ns: Nodo[]) => { ns.sort((a,b) => a.codigo.localeCompare(b.codigo)); ns.forEach(n => sort(n.children)) }
  sort(roots)
  // Rollup bottom-up
  const rollup = (n: Nodo) => {
    if (n.children.length === 0) {
      n.r_hh_gan  = n.hh_ganadas_acum
      n.r_hh_gast = n.hh_gastadas_acum
    } else {
      n.children.forEach(rollup)
      n.r_hh_gan  = n.children.reduce((s,c) => s + c.r_hh_gan,  0)
      n.r_hh_gast = n.children.reduce((s,c) => s + c.r_hh_gast, 0)
    }
    n.r_pct = n.hh_presup > 0 ? n.r_hh_gan / n.hh_presup : 0
    n.r_pf  = n.r_hh_gast > 0 ? n.r_hh_gan / n.r_hh_gast : 0
  }
  roots.forEach(rollup)
  return roots
}

function WBSRow({ node, collapsed, onToggle, depth }: {
  node: Nodo; collapsed: Set<string>; onToggle:(c:string)=>void; depth: number
}) {
  const isCollapsed = collapsed.has(node.codigo)
  const hasChildren = node.children.length > 0
  const color = node.fase ? (FASE_COLOR[node.fase] ?? '#888') : undefined
  const esPadre = !node.es_hoja && hasChildren
  const bg = esPadre ? 'rgba(255,255,255,0.03)' : 'transparent'
  const indent = depth * 18

  return (
    <>
      <tr style={{ background: bg, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {/* Código */}
        <td style={{ padding:'7px 8px 7px', whiteSpace:'nowrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, paddingLeft: indent }}>
            {hasChildren ? (
              <button onClick={() => onToggle(node.codigo)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-tertiary)', padding:0, display:'flex', lineHeight:1 }}>
                {isCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}
              </button>
            ) : <span style={{ width:17 }}/>}
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11,
              color: esPadre ? 'var(--color-text-secondary)' : (color ?? 'var(--color-text-tertiary)'),
              fontWeight: esPadre ? 500 : 400 }}>
              {node.codigo}
            </span>
          </div>
        </td>
        {/* Descripción */}
        <td style={{ padding:'7px 8px', maxWidth:320 }}>
          <span style={{ fontSize: esPadre ? 13 : 12, fontWeight: esPadre ? 500 : 400,
            color: esPadre ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
            title={node.descripcion}>
            {node.descripcion}
          </span>
        </td>
        {/* Fase */}
        <td style={{ padding:'7px 8px', textAlign:'center' }}>
          {node.fase && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
              color: color, background: color+'22', border:`0.5px solid ${color}55`,
              padding:'1px 6px', borderRadius:4 }}>
              {node.sub_fase ?? node.fase}
            </span>
          )}
        </td>
        {/* Und */}
        <td style={{ padding:'7px 8px', textAlign:'center', fontSize:11,
          color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>
          {node.unidad ?? '—'}
        </td>
        {/* HH Plan */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--font-mono)',
          fontSize:12, fontWeight: esPadre ? 500 : 400, color:'var(--color-text-secondary)' }}>
          {hh(node.hh_presup)}
        </td>
        {/* HH Gastadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--font-mono)',
          fontSize:12, color:'#ef4444' }}>
          {hh(node.r_hh_gast)}
        </td>
        {/* HH Ganadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--font-mono)',
          fontSize:12, color:'#10b981' }}>
          {hh(node.r_hh_gan)}
        </td>
        {/* % Avance */}
        <td style={{ padding:'7px 8px', textAlign:'center' }}>
          <div style={{ position:'relative', height:14, minWidth:64,
            background:'var(--color-border-tertiary)', borderRadius:7, overflow:'hidden' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:7,
              background: node.r_pct >= 1 ? '#10b981' : '#3b82f6',
              width: `${Math.min(node.r_pct * 100, 100)}%`, transition:'width .5s' }}/>
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:9, fontWeight:700,
              color: node.r_pct > 0.5 ? '#fff' : 'var(--color-text-secondary)' }}>
              {pct(node.r_pct)}
            </span>
          </div>
        </td>
        {/* PF */}
        <td style={{ padding:'7px 8px', textAlign:'center', fontSize:12 }}>
          {pff(node.r_hh_gan, node.r_hh_gast)}
        </td>
      </tr>
      {/* Hijos */}
      {!isCollapsed && node.children.map(child => (
        <WBSRow key={child.codigo} node={child} collapsed={collapsed}
          onToggle={onToggle} depth={depth+1} />
      ))}
    </>
  )
}

export default function WBSArbol({ otm, semana }: { otm: string; semana: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<{ filas: Fila[] }>({
    queryKey: ['ev-arbol', otm, semana],
    queryFn: () => fetch(`${API}/ev/arbol?semana=${semana}${otm ? `&otm=${otm}` : ''}`).then(r => r.json()),
    enabled: semana > 0,
  })

  const tree = useMemo(() => buildTree(data?.filas ?? []), [data])

  const toggle = useCallback((c: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      return next
    })
  }, [])

  const expandAll  = () => setCollapsed(new Set())
  const collapseAll = () => {
    const parents = new Set((data?.filas ?? []).filter(f => !f.es_hoja).map(f => f.codigo))
    setCollapsed(parents)
  }

  if (isLoading) return (
    <div className="flex items-center gap-2 py-10 text-k-text3 text-sm">
      <Loader2 size={14} className="animate-spin"/> Cargando árbol WBS...
    </div>
  )

  if (!data?.filas?.length) return (
    <div className="text-center py-12 text-k-text3 text-sm">
      {otm ? `Sin partidas para ${otm}` : 'Selecciona una OTM o importa partidas primero'}
    </div>
  )

  const totalPlan  = tree.reduce((s, n) => s + n.hh_presup, 0)
  const totalGast  = tree.reduce((s, n) => s + n.r_hh_gast, 0)
  const totalGan   = tree.reduce((s, n) => s + n.r_hh_gan,  0)

  return (
    <div>
      {/* Controles */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={expandAll} style={{ fontSize:11, color:'var(--color-text-secondary)',
            background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-secondary)',
            borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
            Expandir todo
          </button>
          <button onClick={collapseAll} style={{ fontSize:11, color:'var(--color-text-secondary)',
            background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-secondary)',
            borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
            Colapsar todo
          </button>
        </div>
        <span style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>
          {data.filas.length} nodos · {data.filas.filter(f=>f.es_hoja).length} actividades · Sem {semana}
        </span>
      </div>

      {/* Tabla */}
      <div style={{ overflowX:'auto', border:'0.5px solid var(--color-border-tertiary)', borderRadius:12 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'0.5px solid var(--color-border-secondary)',
              background:'var(--color-background-secondary)' }}>
              {['Código','Descripción','Fase','Und','HH Plan','HH Gastadas','HH Ganadas','% Avance','PF'].map((h,i) => (
                <th key={h} style={{ padding:'8px 8px', fontSize:10, fontWeight:500,
                  textTransform:'uppercase', letterSpacing:'.06em',
                  color:'var(--color-text-tertiary)', textAlign: i>=4 ? 'right' as const : 'left' as const,
                  whiteSpace:'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tree.map(node => (
              <WBSRow key={node.codigo} node={node} collapsed={collapsed}
                onToggle={toggle} depth={0} />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:'1px solid var(--color-border-secondary)',
              background:'var(--color-background-secondary)', fontWeight:500 }}>
              <td colSpan={4} style={{ padding:'8px 8px', fontSize:11, color:'var(--color-text-secondary)' }}>
                Total OTM
              </td>
              <td style={{ padding:'8px 12px 8px 8px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12 }}>
                {hh(totalPlan)}
              </td>
              <td style={{ padding:'8px 12px 8px 8px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12, color:'#ef4444' }}>
                {hh(totalGast)}
              </td>
              <td style={{ padding:'8px 12px 8px 8px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12, color:'#10b981' }}>
                {hh(totalGan)}
              </td>
              <td style={{ padding:'8px 8px', textAlign:'center', fontFamily:'var(--font-mono)', fontSize:11 }}>
                {totalPlan > 0 ? pct(totalGan/totalPlan) : '—'}
              </td>
              <td style={{ padding:'8px 8px', textAlign:'center', fontSize:12 }}>
                {pff(totalGan, totalGast)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}