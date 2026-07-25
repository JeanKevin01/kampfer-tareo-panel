// WBSArbol.tsx — Árbol WBS completo con rollup de valores EV
// Colores por nivel (igual que Excel del ingeniero de costos) + variables del panel Kampfer
import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'

// ── Colores por nivel — tono pastel, distinguibles entre sí ───
// Theme-aware: el texto/borde salen de variables (var(--nivel-N)) que se
// oscurecen en modo claro (ver index.css); el fondo es un tinte muy tenue que
// funciona en ambos temas. Antes eran hex fijos y quedaban ilegibles en claro.
const NIVEL_COLOR: Record<number, { text: string; bg: string; border: string; bold: boolean }> = {
  1: { text: 'var(--nivel-1)', bg: 'rgba(255,123,123,0.16)', border: 'var(--nivel-1)', bold: true  },
  2: { text: 'var(--nivel-2)', bg: 'rgba(127,224,212,0.15)', border: 'var(--nivel-2)', bold: true  },
  3: { text: 'var(--nivel-3)', bg: 'rgba(214,179,255,0.14)', border: 'var(--nivel-3)', bold: false },
  4: { text: 'var(--nivel-4)', bg: 'rgba(255,201,139,0.13)', border: 'var(--nivel-4)', bold: false },
}
const NIVEL_COLOR_DEFAULT = { text: 'rgb(var(--k-text2))', bg: 'rgba(184,196,217,0.08)', border: 'rgb(var(--k-text2))', bold: false }

// Fase → variable theme-aware (pastel en oscuro, saturada en claro). El tinte
// de fondo/borde de los badges se deriva con color-mix (no se puede concatenar α
// a una var()). Fallback neutro cuando la fase no tiene color propio.
const FASE_COLOR: Record<string, string> = {
  FAB:'var(--fase-fab)', EST:'var(--fase-est)', MEC:'var(--fase-mec)', ELE:'var(--fase-ele)',
  TUB:'var(--fase-tub)', INS:'var(--fase-ins)', CIV:'var(--fase-civ)', AND:'var(--fase-and)',
  APY:'var(--fase-apy)', ING:'var(--fase-ing)', COM:'var(--fase-com)',
}
const FASE_FALLBACK = 'rgb(var(--k-text2))'
const tinte = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

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
  if (gast <= 0) return <span style={{ color:'rgb(var(--k-text3))', fontSize:11 }}>—</span>
  const v = gan/gast
  return <span style={{ color: v>=1?'var(--pf-good)': v>=0.85?'var(--pf-mid)':'var(--pf-bad)', fontWeight:600, fontFamily:'var(--mono)', fontSize:12 }}>{v.toFixed(2)}</span>
}

function WBSRow({ node, collapsed, onToggle }: { node: Nodo; collapsed: Set<string>; onToggle:(c:string)=>void }) {
  const isCollapsed = collapsed.has(node.codigo)
  const hasChildren = node.children.length > 0
  const isLeaf = node.es_hoja && !hasChildren
  const nivelStyle = isLeaf
    ? { text: FASE_COLOR[node.fase ?? ''] ?? 'rgb(var(--k-text))', bg: 'transparent', border: FASE_COLOR[node.fase ?? ''] ?? 'rgb(var(--k-text3) / 0.6)', bold: false }
    : (NIVEL_COLOR[node.nivel] ?? NIVEL_COLOR_DEFAULT)
  const indent = (node.nivel - 1) * 20

  return (
    <>
      <tr style={{ background: nivelStyle.bg, borderBottom: '0.5px solid rgb(var(--k-raised))', borderLeft: `3px solid ${nivelStyle.border}` }}>
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
            color: isLeaf ? 'rgb(var(--k-text))' : nivelStyle.text,  // ← SIEMPRE claro sobre fondo oscuro
            fontStyle: !isLeaf && node.nivel >= 2 ? 'italic' : 'normal',
            display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
          }} title={node.descripcion}>
            {node.descripcion || <span style={{ color:'rgb(var(--k-text3))', fontSize:11, fontStyle:'italic' }}>sin descripción</span>}
          </span>
        </td>
        {/* Fase badge */}
        <td style={{ padding:'7px 8px', textAlign:'center', width:90 }}>
          {node.fase && (() => {
            const c = FASE_COLOR[node.fase] ?? FASE_FALLBACK
            return (
            <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:700,
              color: c, background: tinte(c, 18), border:`0.5px solid ${tinte(c, 40)}`,
              padding:'2px 6px', borderRadius:4, letterSpacing:'.3px', whiteSpace:'nowrap' }}>
              {node.sub_fase ?? node.fase}
            </span>
            )
          })()}
        </td>
        {/* Tipo de costo (DIR/IND) — solo hojas */}
        <td style={{ padding:'7px 6px', textAlign:'center', width:54 }}>
          {isLeaf && (() => {
            const c = node.tipo_costo === 'INDIRECTO' ? 'var(--pf-mid)' : 'var(--pf-good)'
            return (
            <span style={{ fontFamily:'var(--mono)', fontSize:9, fontWeight:700,
              color: c, background: tinte(c, 16), border:`0.5px solid ${tinte(c, 36)}`,
              padding:'2px 5px', borderRadius:4 }}>
              {node.tipo_costo === 'INDIRECTO' ? 'IND' : 'DIR'}
            </span>
            )
          })()}
        </td>
        {/* Und */}
        <td style={{ padding:'7px 8px', textAlign:'center', fontSize:11, color:'rgb(var(--k-text2))', fontFamily:'var(--mono)', width:60 }}>
          {node.unidad ?? ''}
        </td>
        {/* Metrado Presup (solo hojas tienen metrado propio) */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12,
          color: isLeaf ? 'rgb(var(--k-text))' : 'rgb(var(--k-text2))', width:100 }}>
          {node.metrado_presup > 0 ? node.metrado_presup.toLocaleString('es-PE',{maximumFractionDigits:2}) : <span style={{color:'rgb(var(--k-text3))'}}>—</span>}
        </td>
        {/* HH Plan */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12,
          color: isLeaf ? 'rgb(var(--k-text2))' : 'rgb(var(--k-text))', fontWeight: isLeaf ? 400 : 500, width:100 }}>
          {node.hh_presup > 0 ? node.hh_presup.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        {/* HH Gastadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'var(--pf-bad)', width:110 }}>
          {node.r_hh_gast > 0 ? node.r_hh_gast.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{color:'rgb(var(--k-text3))'}}>—</span>}
        </td>
        {/* HH Ganadas */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'var(--pf-good)', width:110 }}>
          {node.r_hh_gan > 0 ? node.r_hh_gan.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{color:'rgb(var(--k-text3))'}}>—</span>}
        </td>
        {/* % Avance */}
        <td style={{ padding:'7px 10px', width:100 }}>
          <div style={{ position:'relative', height:16, background:'rgb(var(--k-raised))', borderRadius:8, overflow:'hidden', minWidth:64 }}>
            {node.r_pct > 0 && <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:8,
              background: node.r_pct >= 1 ? '#2DD4A8' : '#3B82F6',
              width:`${Math.min(node.r_pct*100,100)}%`, transition:'width .5s' }}/>}
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:9, fontWeight:700, color: node.r_pct > 0.5 ? '#0f1117' : 'rgb(var(--k-text2))' }}>
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
    queryFn: () => api<{ filas: Fila[] }>(`/ev/arbol?semana=${semana}${otm ? `&otm=${otm}` : ''}`),
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

  if (isLoading) return <div style={{display:'flex',alignItems:'center',gap:8,padding:'40px 0',color:'rgb(var(--k-text2))',fontSize:14}}><Loader2 size={16} className="animate-spin"/>Cargando árbol WBS...</div>
  if (isError || !data?.filas?.length) return (
    <div style={{textAlign:'center',padding:'48px 0',color:'rgb(var(--k-text2))',fontSize:14}}>
      {otm ? `Sin partidas para ${otm} — verifica que esté importada` : 'Selecciona un proyecto en el selector de arriba o importa partidas desde la pestaña Importar'}
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
              style={{fontSize:11,color:'rgb(var(--k-text2))',background:'rgb(var(--k-raised))',border:'0.5px solid rgb(var(--k-border))',
                borderRadius:6,padding:'4px 12px',cursor:'pointer'}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {[['FAB','var(--fase-fab)'],['EST','var(--fase-est)'],['MEC','var(--fase-mec)'],['ELE','var(--fase-ele)'],
            ['TUB','var(--fase-tub)'],['AND','var(--fase-and)'],['APY','var(--fase-apy)'],['CIV','var(--fase-civ)']].map(([f,c])=>(
            <span key={f} style={{fontSize:10,color:c,fontFamily:'var(--mono)',fontWeight:700}}>{f}</span>
          ))}
          <span style={{fontSize:11,color:'rgb(var(--k-text3))',marginLeft:8}}>{totalNodos} nodos · {totalHojas} actividades · Sem {semana}</span>
        </div>
      </div>

      {/* Leyenda niveles */}
      <div style={{display:'flex',gap:16,marginBottom:10,padding:'6px 10px',background:'rgb(var(--k-surface))',borderRadius:8,border:'0.5px solid rgb(var(--k-border))'}}>
        <span style={{fontSize:10,color:'rgb(var(--k-text3))',marginRight:4}}>NIVEL:</span>
        {([[1,'var(--nivel-1)','Raíz'],[2,'var(--nivel-2)','Sección'],[3,'var(--nivel-3)','Sub-sección'],[4,'var(--nivel-4)','Detalle']] as [number,string,string][]).map(([n,c,lbl])=>(
          <span key={n} style={{display:'flex',alignItems:'center',gap:4,fontSize:10}}>
            <span style={{width:10,height:10,borderRadius:2,background:c,display:'inline-block'}}/>
            <span style={{color:c}}>{n}. {lbl}</span>
          </span>
        ))}
        <span style={{display:'flex',alignItems:'center',gap:4,fontSize:10,marginLeft:4}}>
          <span style={{width:10,height:10,borderRadius:2,background:'var(--fase-est)',display:'inline-block'}}/>
          <span style={{color:'rgb(var(--k-text))'}}>Hoja (actividad)</span>
        </span>
      </div>

      {/* Tabla */}
      <div style={{overflowX:'auto',border:'0.5px solid rgb(var(--k-border))',borderRadius:12,background:'rgb(var(--k-surface))'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:'1px solid rgb(var(--k-border))',background:'rgb(var(--k-raised))'}}>
              {[['Código',200],['Descripción',null],['Fase',90],['Tipo',54],['Und',60],['Metrado',100],['HH Plan',100],['HH Gastadas',110],['HH Ganadas',110],['% Avance',100],['PF',70]].map(([h,w])=>(
                <th key={String(h)} style={{padding:'9px 8px',fontSize:10,fontWeight:700,textTransform:'uppercase',
                  letterSpacing:'.07em',color:'rgb(var(--k-text2))',textAlign: ['Metrado','HH Plan','HH Gastadas','HH Ganadas','PF'].includes(String(h)) ? 'right' : 'left',
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
            <tr style={{borderTop:'1px solid rgb(var(--k-border2))',background:'rgb(var(--k-raised))'}}>
              <td colSpan={6} style={{padding:'8px 10px',fontSize:11,color:'rgb(var(--k-text2))',fontWeight:600}}>TOTAL OTM{otm ? ` · ${otm}` : ''}</td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'rgb(var(--k-text))',fontWeight:600}}>
                {totalPlan.toLocaleString('es-PE',{maximumFractionDigits:1})}
              </td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'var(--pf-bad)',fontWeight:600}}>
                {totalGast > 0 ? totalGast.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
              </td>
              <td style={{padding:'8px 12px 8px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:'var(--pf-good)',fontWeight:600}}>
                {totalGan > 0 ? totalGan.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
              </td>
              <td style={{padding:'8px 10px',textAlign:'center',fontSize:12,fontFamily:'var(--mono)',color:'rgb(var(--k-text2))'}}>
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