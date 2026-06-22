// WBSArbol.tsx — Árbol WBS completo con rollup de valores EV
// Colores por nivel (igual que Excel del ingeniero de costos) + variables del panel Kampfer
import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

// ── Colores por nivel — tono pastel, más distinguibles entre sí ───
// Panel usa tema oscuro → pasteles claros con más opacidad de fondo
const NIVEL_COLOR: Record<number, { text: string; bg: string; border: string; bold: boolean }> = {
  1: { text: '#FF9B9B', bg: 'rgba(255,123,123,0.16)', border: '#FF9B9B', bold: true  }, // coral pastel — raíz
  2: { text: '#7FE0D4', bg: 'rgba(127,224,212,0.15)', border: '#7FE0D4', bold: true  }, // menta pastel
  3: { text: '#D6B3FF', bg: 'rgba(214,179,255,0.14)', border: '#D6B3FF', bold: false }, // lila pastel
  4: { text: '#FFC98B', bg: 'rgba(255,201,139,0.13)', border: '#FFC98B', bold: false }, // durazno pastel
}
const NIVEL_COLOR_DEFAULT = { text: '#B8C4D9', bg: 'rgba(184,196,217,0.08)', border: '#B8C4D9', bold: false }

// Fase → pastel suave pero legible sobre fondo oscuro
const FASE_COLOR: Record<string, string> = {
  FAB:'#6EE7C0', EST:'#7FB2FF', MEC:'#FFB37A', ELE:'#FFE08A',
  TUB:'#C7A8FF', INS:'#FFA6C9', CIV:'#AEB9CC', AND:'#7FE3A0',
  APY:'#A8F0BF', ING:'#FFD97D', COM:'#D8C2FF',
}

interface Fila {
  id: number; codigo: string; otm_id: string; fase: string|null; sub_fase: string|null
  descripcion: string; unidad: string|null; hh_presup: number
  metrado_presup: number; metrado_proyec: number|null
  nivel: number; parent_codigo: string|null; es_hoja: boolean
  tipo_costo: string
  hh_ganadas_acum: number; hh_gastadas_acum: number; pct_avance: number; pf_acum: number
}
interface Nodo extends Fila {
  children: Nodo[]
  r_hh_gan: number; r_hh_gast: number; r_pct: number
}

function buildTree(filas: Fila[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const f of filas) map.set(f.codigo, { ...f, children: [], r_hh_gan:0, r_hh_gast:0, r_pct:0 })
  const roots: Nodo[] = []
  for (const node of map.values()) {
    if (node.parent_codigo && map.has(node.parent_codigo)) map.get(node.parent_codigo)!.children.push(node)
    else roots.push(node)
  }
  const sort = (ns: Nodo[]) => { ns.sort((a,b) => a.codigo.localeCompare(b.codigo)); ns.forEach(n => sort(n.children)) }
  sort(roots)
  const rollup = (n: Nodo) => {
    if (n.children.length === 0) { n.r_hh_gan = n.hh_ganadas_acum; n.r_hh_gast = n.hh_gastadas_acum }
    else { n.children.forEach(rollup); n.r_hh_gan = n.children.reduce((s,c)=>s+c.r_hh_gan,0); n.r_hh_gast = n.children.reduce((s,c)=>s+c.r_hh_gast,0) }
    n.r_pct = n.hh_presup > 0 ? n.r_hh_gan / n.hh_presup : 0
  }
  roots.forEach(rollup)
  return roots
}

function pfDisplay(gan: number, gast: number) {
  if (gast <= 0) return <span style={{ color:'#4e5a72', fontSize:11 }}>—</span>
  const v = gan/gast
  return <span style={{ color: v>=1?'#2DD4A8': v>=0.85?'#FACC15':'#FF6B6B', fontWeight:600, fontFamily:'var(--mono)', fontSize:12 }}>{v.toFixed(2)}</span>
}

function WBSRow({ node, collapsed, onToggle }: { node: Nodo; collapsed: Set<string>; onToggle:(c:string)=>void }) {
  const isCollapsed = collapsed.has(node.codigo)
  const hasChildren = node.children.length > 0
  const isLeaf = node.es_hoja && !hasChildren
  const nivelStyle = isLeaf
    ? { text: FASE_COLOR[node.fase ?? ''] ?? '#E2E8F0', bg: 'transparent', border: FASE_COLOR[node.fase ?? ''] ?? '#4e5a72', bold: false }
    : (NIVEL_COLOR[node.nivel] ?? NIVEL_COLOR_DEFAULT)
  const indent = (node.nivel - 1) * 20

  return (
    <>
      <tr style={{ background: nivelStyle.bg, borderBottom: '0.5px solid #1c2436', borderLeft: `3px solid ${nivelStyle.border}` }}>
        {/* Código + toggle */}
        <td style={{ padding:'7px 10px 7px 6px', whiteSpace:'nowrap', width:200 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, paddingLeft: indent }}>
            {hasChildren
              ? <button onClick={() => onToggle(node.codigo)}
                  style={{ background:'none', border:'none', cursor:'pointer', color: nivelStyle.text, padding:0, display:'flex', lineHeight:1, flexShrink:0 }}>
                  {isCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}
                </button>
              : <span style={{ display:'inline-block', width:17 }}/>
            }
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color: nivelStyle.text, fontWeight: nivelStyle.bold ? 700 : 500, letterSpacing:'.3px' }}>
              {node.codigo}
            </span>
          </div>
        </td>
        {/* Descripción */}
        <td style={{ padding:'7px 12px' }}>
          <span style={{
            fontSize: node.nivel <= 2 ? 13 : 12,
            fontWeight: nivelStyle.bold ? 600 : 400,
            color: isLeaf ? '#c8d0e0' : nivelStyle.text,  // ← SIEMPRE claro sobre fondo oscuro
            fontStyle: !isLeaf && node.nivel >= 2 ? 'italic' : 'normal',
            display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
          }} title={node.descripcion}>
            {node.descripcion || <span style={{ color:'#4e5a72', fontSize:11, fontStyle:'italic' }}>sin descripción</span>}
          </span>
        </td>
        {/* Fase badge */}
        <td style={{ padding:'7px 8px', textAlign:'center', width:90 }}>
          {node.fase && (
            <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:700,
              color: FASE_COLOR[node.fase] ?? '#AEB9CC',
              background: (FASE_COLOR[node.fase] ?? '#AEB9CC')+'2E',
              border:`0.5px solid ${(FASE_COLOR[node.fase] ?? '#AEB9CC')}66`,
              padding:'2px 6px', borderRadius:4, letterSpacing:'.3px', whiteSpace:'nowrap' }}>
              {node.sub_fase ?? node.fase}
            </span>
          )}
        </td>
        {/* Tipo de costo (DIR/IND) — solo hojas */}
        <td style={{ padding:'7px 6px', textAlign:'center', width:54 }}>
          {isLeaf && (
            <span style={{ fontFamily:'var(--mono)', fontSize:9, fontWeight:700,
              color: node.tipo_costo === 'INDIRECTO' ? '#FACC15' : '#2DD4A8',
              background: (node.tipo_costo === 'INDIRECTO' ? '#FACC15' : '#2DD4A8')+'22',
              border:`0.5px solid ${(node.tipo_costo === 'INDIRECTO' ? '#FACC15' : '#2DD4A8')}55`,
              padding:'2px 5px', borderRadius:4 }}>
              {node.tipo_costo === 'INDIRECTO' ? 'IND' : 'DIR'}
            </span>
          )}
        </td>
        {/* Und */}
        <td style={{ padding:'7px 8px', textAlign:'center', fontSize:11, color:'#8a96ad', fontFamily:'var(--mono)', width:60 }}>
          {node.unidad ?? ''}
        </td>
        {/* Metrado Presup (solo hojas tienen metrado propio) */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12,
          color: isLeaf ? '#c8d0e0' : '#8a96ad', width:100 }}>
          {node.metrado_presup > 0 ? node.metrado_presup.toLocaleString('es-PE',{maximumFractionDigits:2}) : <span style={{color:'#4e5a72'}}>—</span>}
        </td>
        {/* HH Plan */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12,
          color: isLeaf ? '#8a96ad' : '#e8edf5', fontWeight: isLeaf ? 400 : 500, width:100 }}>
          {node.hh_presup > 0 ? node.hh_presup.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        {/* HH Gastadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'#FF6B6B', width:110 }}>
          {node.r_hh_gast > 0 ? node.r_hh_gast.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{color:'#4e5a72'}}>—</span>}
        </td>
        {/* HH Ganadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'#2DD4A8', width:110 }}>
          {node.r_hh_gan > 0 ? node.r_hh_gan.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{color:'#4e5a72'}}>—</span>}
        </td>
        {/* % Avance */}
        <td style={{ padding:'7px 10px', width:100 }}>
          <div style={{ position:'relative', height:16, background:'#1c2436', borderRadius:8, overflow:'hidden', minWidth:64 }}>
            {node.r_pct > 0 && <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:8,
              background: node.r_pct >= 1 ? '#2DD4A8' : '#3B82F6',
              width:`${Math.min(node.r_pct*100,100)}%`, transition:'width .5s' }}/>}
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:9, fontWeight:700, color: node.r_pct > 0.5 ? '#0f1117' : '#8a96ad' }}>
              {(node.r_pct*100).toFixed(1)}%
            </span>
          </div>
        </td>
        {/* PF */}
        <td style={{ padding:'7px 10px', textAlign:'center', width:70 }}>
          {pfDisplay(node.r_hh_gan, node.r_hh_gast)}
        </td>
      </tr>
      {!isCollapsed && node.children.map(child => (
        <WBSRow key={child.codigo} node={child} collapsed={collapsed} onToggle={onToggle} />
      ))}
    </>
  )
}

export default function WBSArbol({ otm, semana }: { otm: string; semana: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useQuery<{ filas: Fila[] }>({
    queryKey: ['ev-arbol', otm, semana],
    queryFn: () => fetch(`${API}/ev/arbol?semana=${semana}${otm ? `&otm=${otm}` : ''}`).then(r => r.json()),
    enabled: semana > 0,
  })

  const tree = useMemo(() => buildTree(data?.filas ?? []), [data])

  const toggle = useCallback((c: string) => {
    setCollapsed(prev => { const n = new Set(prev); if(n.has(c)) n.delete(c); else n.add(c); return n })
  }, [])

  const expandAll   = () => setCollapsed(new Set())
  const collapseAll = () => {
    const padres = new Set((data?.filas ?? []).filter(f => !f.es_hoja || (data?.filas??[]).some(c=>c.parent_codigo===f.codigo)).map(f=>f.codigo))
    setCollapsed(padres)
  }

  if (isLoading) return <div style={{display:'flex',alignItems:'center',gap:8,padding:'40px 0',color:'#8a96ad',fontSize:14}}><Loader2 size={16} className="animate-spin"/>Cargando árbol WBS...</div>
  if (isError || !data?.filas?.length) return (
    <div style={{textAlign:'center',padding:'48px 0',color:'#8a96ad',fontSize:14}}>
      {otm ? `Sin partidas para ${otm} — verifica que esté importada` : 'Selecciona una OTM en el selector de arriba o importa partidas desde la pestaña Importar'}
    </div>
  )

  const totalPlan = tree.reduce((s,n)=>s+n.hh_presup,0)
  const totalGast = tree.reduce((s,n)=>s+n.r_hh_gast,0)
  const totalGan  = tree.reduce((s,n)=>s+n.r_hh_gan,0)
  const totalNodos = data.filas.length
  const totalHojas = data.filas.filter(f=>f.es_hoja).length

  return (
    <div>
      {/* Controles */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{display:'flex',gap:8}}>
          {['Expandir todo','Colapsar todo'].map((lbl,i) => (
            <button key={lbl} onClick={i===0?expandAll:collapseAll}
              style={{fontSize:11,color:'#8a96ad',background:'#1c2436',border:'0.5px solid #252f45',
                borderRadius:6,padding:'4px 12px',cursor:'pointer'}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {[['FAB','#6EE7C0'],['EST','#7FB2FF'],['MEC','#FFB37A'],['ELE','#FFE08A'],
            ['TUB','#C7A8FF'],['AND','#7FE3A0'],['APY','#A8F0BF'],['CIV','#AEB9CC']].map(([f,c])=>(
            <span key={f} style={{fontSize:10,color:c,fontFamily:'var(--mono)',fontWeight:700}}>{f}</span>
          ))}
          <span style={{fontSize:11,color:'#4e5a72',marginLeft:8}}>{totalNodos} nodos · {totalHojas} actividades · Sem {semana}</span>
        </div>
      </div>

      {/* Leyenda niveles */}
      <div style={{display:'flex',gap:16,marginBottom:10,padding:'6px 10px',background:'#141926',borderRadius:8,border:'0.5px solid #252f45'}}>
        <span style={{fontSize:10,color:'#4e5a72',marginRight:4}}>NIVEL:</span>
        {([[1,'#FF9B9B','Raíz'],[2,'#7FE0D4','Sección'],[3,'#D6B3FF','Sub-sección'],[4,'#FFC98B','Detalle']] as [number,string,string][]).map(([n,c,lbl])=>(
          <span key={n} style={{display:'flex',alignItems:'center',gap:4,fontSize:10}}>
            <span style={{width:10,height:10,borderRadius:2,background:c,display:'inline-block'}}/>
            <span style={{color:c}}>{n}. {lbl}</span>
          </span>
        ))}
        <span style={{display:'flex',alignItems:'center',gap:4,fontSize:10,marginLeft:4}}>
          <span style={{width:10,height:10,borderRadius:2,background:'#7FB2FF',display:'inline-block'}}/>
          <span style={{color:'#c8d0e0'}}>Hoja (actividad)</span>
        </span>
      </div>

      {/* Tabla */}
      <div style={{overflowX:'auto',border:'0.5px solid #252f45',borderRadius:12,background:'#141926'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:'1px solid #252f45',background:'#1c2436'}}>
              {[['Código',200],['Descripción',null],['Fase',90],['Tipo',54],['Und',60],['Metrado',100],['HH Plan',100],['HH Gastadas',110],['HH Ganadas',110],['% Avance',100],['PF',70]].map(([h,w])=>(
                <th key={String(h)} style={{padding:'9px 8px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                  letterSpacing:'.07em',color:'#8a96ad',textAlign: ['Metrado','HH Plan','HH Gastadas','HH Ganadas','PF'].includes(String(h)) ? 'right' : 'left',
                  whiteSpace:'nowrap',width: w ? w : undefined}}>
                  {String(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tree.map(node => <WBSRow key={node.codigo} node={node} collapsed={collapsed} onToggle={toggle}/>)}
          </tbody>
          <tfoot>
            <tr style={{borderTop:'1px solid #2e3a52',background:'#1c2436'}}>
              <td colSpan={6} style={{padding:'8px 10px',fontSize:11,color:'#8a96ad',fontWeight:600}}>TOTAL OTM{otm ? ` · ${otm}` : ''}</td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'#e8edf5',fontWeight:600}}>
                {totalPlan.toLocaleString('es-PE',{maximumFractionDigits:1})}
              </td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'#FF6B6B',fontWeight:600}}>
                {totalGast > 0 ? totalGast.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
              </td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'#2DD4A8',fontWeight:600}}>
                {totalGan > 0 ? totalGan.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
              </td>
              <td style={{padding:'8px 10px',textAlign:'center',fontSize:12,fontFamily:'var(--mono)',color:'#8a96ad'}}>
                {totalPlan > 0 ? (totalGan/totalPlan*100).toFixed(1)+'%' : '—'}
              </td>
              <td style={{padding:'8px 10px',textAlign:'center'}}>
                {pfDisplay(totalGan, totalGast)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}