// TabISP.tsx — Informe Semanal de Producción (ISP) estilo Fluor
// Árbol jerárquico con rollup (mismo esquema visual que el WBS) + detalle semanal
import { useState, useMemo, useCallback, Fragment as Frag } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react'

import { api } from '@/lib/api'
import { FASE_COLOR } from '@/lib/wbs'

// Colores por nivel WBS (igual que WBSArbol) — Raíz/Sección/Sub-sección/Detalle
// (alphas más suaves que los de lib/wbs.ts a propósito: fondo de tabla densa)
const NIVEL_COLOR: Record<number, { text:string; bg:string; border:string; bold:boolean }> = {
  1: { text:'#FF9B9B', bg:'rgba(255,123,123,0.16)', border:'#FF9B9B', bold:true  }, // raíz
  2: { text:'#7FE0D4', bg:'rgba(127,224,212,0.15)', border:'#7FE0D4', bold:true  }, // sección
  3: { text:'#D6B3FF', bg:'rgba(214,179,255,0.14)', border:'#D6B3FF', bold:false }, // sub-sección
  4: { text:'#FFC98B', bg:'rgba(255,201,139,0.13)', border:'#FFC98B', bold:false }, // detalle
}
const NIVEL_DEFAULT = { text:'#B8C4D9', bg:'rgba(184,196,217,0.08)', border:'#B8C4D9', bold:false }

interface SemInfo  { semana:number; label:string; inicio:string; fin:string; label_full:string }
interface SemDato  { hh_gan_acum:number; hh_gan_sem:number; hh_gast_acum:number; hh_gast_sem:number; pf_acum:number; pf_sem:number; pct_avance:number; cant_acum:number }
interface PartidaISP {
  partida_id:number; codigo:string; otm_id:string; descripcion:string
  unidad:string|null; fase:string|null; hh_presup:number; metrado_presup:number
  metrado_proyec:number; factor_conv:number; es_hoja:boolean
  nivel:number; parent_codigo:string|null
  semanas: Record<number, SemDato>
}
interface NodoISP extends PartidaISP {
  children: NodoISP[]
  rSem: Record<number, SemDato>   // semanas con rollup (hojas = propias)
  rHHPresup: number
  rMetPresup: number
}

function pfColor(pf:number, gast:number) {
  if (gast <= 0) return { color:'#4e5a72', text:'—' }
  const c = pf >= 1 ? '#2DD4A8' : pf >= 0.85 ? '#FACC15' : '#FF6B6B'
  return { color: c, text: pf.toFixed(2) }
}

// ── Construcción del árbol con rollup de cada semana ────────────────
function buildTreeISP(partidas: PartidaISP[], semanas: SemInfo[]): NodoISP[] {
  const map = new Map<string, NodoISP>()
  partidas.forEach(p => map.set(p.codigo, { ...p, children:[], rSem:{}, rHHPresup:0, rMetPresup:0 }))
  const roots: NodoISP[] = []
  map.forEach(n => {
    if (n.parent_codigo && map.has(n.parent_codigo)) map.get(n.parent_codigo)!.children.push(n)
    else roots.push(n)
  })
  const sort = (ns: NodoISP[]) => { ns.sort((a,b)=>a.codigo.localeCompare(b.codigo)); ns.forEach(x=>sort(x.children)) }
  sort(roots)
  const rollup = (n: NodoISP) => {
    if (!n.children.length) {
      n.rSem = n.semanas; n.rHHPresup = n.hh_presup; n.rMetPresup = n.metrado_presup
      return
    }
    n.children.forEach(rollup)
    n.rHHPresup  = n.children.reduce((s,c)=>s+c.rHHPresup,0)
    n.rMetPresup = n.children.reduce((s,c)=>s+c.rMetPresup,0)
    const agg: Record<number, SemDato> = {}
    semanas.forEach(({ semana:s }) => {
      let gA=0,gS=0,xA=0,xS=0,any=false
      n.children.forEach(c => {
        const d = c.rSem[s]; if (!d) return
        any=true; gA+=d.hh_gan_acum; gS+=d.hh_gan_sem; xA+=d.hh_gast_acum; xS+=d.hh_gast_sem
      })
      if (any) agg[s] = {
        hh_gan_acum:gA, hh_gan_sem:gS, hh_gast_acum:xA, hh_gast_sem:xS,
        pf_acum: xA>0?gA/xA:0, pf_sem: xS>0?gS/xS:0,
        pct_avance: n.rHHPresup>0?gA/n.rHHPresup:0, cant_acum:0,
      }
    })
    n.rSem = agg
  }
  roots.forEach(rollup)
  return roots
}

// ── Detalle semana-a-semana de una hoja (se muestra al expandirla) ──
function LeafWeekDetail({ p, semanas, semanaActual }: { p:NodoISP; semanas:SemInfo[]; semanaActual:number }) {
  const semPrev = (s:number) => p.semanas[s-1]
  const filas = [
    { key:'cant',   label:`Cant Ejecutada (${p.unidad ?? '—'})`, color:'#94A3B8', fn:(d:SemDato,s:number)=>({ per: d.cant_acum-(semPrev(s)?.cant_acum??0), acum:d.cant_acum }) },
    { key:'hhgast', label:'HH Gastadas',  color:'#FF6B6B', fn:(d:SemDato)=>({ per:d.hh_gast_sem, acum:d.hh_gast_acum }) },
    { key:'hhgan',  label:'HH Ganadas',   color:'#2DD4A8', fn:(d:SemDato)=>({ per:d.hh_gan_sem,  acum:d.hh_gan_acum  }) },
    { key:'pf',     label:'P.F.',         color:'',        fn:(d:SemDato)=>({ per:d.pf_sem, acum:d.pf_acum }) },
    { key:'pct',    label:'% Avance',     color:'#60A5FA', fn:(d:SemDato,s:number)=>({ per:d.pct_avance-(semPrev(s)?.pct_avance??0), acum:d.pct_avance }) },
  ]
  const fmt = (v:number, key:string) => {
    if (!isFinite(v) || isNaN(v)) return '—'
    if (key === 'pct') return (v*100).toFixed(1)+'%'
    if (key === 'pf')  return pfColor(v,1).text
    return v > 0 ? v.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'
  }
  return (
    <tr>
      <td colSpan={9} style={{ padding:0, background:'#0d1220' }}>
        <div style={{ overflowX:'auto', borderTop:'0.5px solid #1c2436' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#141926', borderBottom:'0.5px solid #252f45' }}>
                <th style={{ padding:'6px 12px', textAlign:'left', color:'#4e5a72', fontWeight:600, fontSize:10, whiteSpace:'nowrap', minWidth:160 }}>Métrica</th>
                {semanas.map(s => (
                  <th key={s.semana} colSpan={2} style={{ padding:'6px 8px', textAlign:'center', color: s.semana===semanaActual?'#f59e0b':'#4e5a72', fontWeight:600, fontSize:10, borderLeft:'0.5px solid #1c2436', minWidth:120 }}>
                    {s.label}{s.semana===semanaActual && <span style={{ fontSize:8, display:'block', color:'#f59e0b99' }}>Actual</span>}
                  </th>
                ))}
              </tr>
              <tr style={{ background:'#0d1220', borderBottom:'0.5px solid #1c2436' }}>
                <th style={{ padding:'3px 12px' }}/>
                {semanas.map(s => (
                  <Frag key={s.semana}>
                    <th style={{ padding:'3px 6px', textAlign:'right', color:'#4e5a72', fontSize:9, fontWeight:500, borderLeft:'0.5px solid #1c2436' }}>Período</th>
                    <th style={{ padding:'3px 6px', textAlign:'right', color:'#4e5a72', fontSize:9, fontWeight:500 }}>Acumul.</th>
                  </Frag>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(fila => (
                <tr key={fila.key} style={{ borderBottom:'0.5px solid #141926' }}>
                  <td style={{ padding:'5px 12px', color: fila.color || '#8a96ad', fontSize:11, fontWeight:500, whiteSpace:'nowrap' }}>{fila.label}</td>
                  {semanas.map(s => {
                    const d = p.semanas[s.semana]
                    if (!d) return (
                      <Frag key={s.semana}>
                        <td style={{ padding:'5px 6px', textAlign:'right', color:'#252f45', borderLeft:'0.5px solid #1c2436' }}>—</td>
                        <td style={{ padding:'5px 6px', textAlign:'right', color:'#252f45' }}>—</td>
                      </Frag>
                    )
                    const { per, acum } = fila.fn(d, s.semana)
                    const color = fila.key==='pf' ? pfColor(acum,1).color : (fila.color || '#8a96ad')
                    const bg = s.semana===semanaActual ? '#1c2436' : 'transparent'
                    return (
                      <Frag key={s.semana}>
                        <td style={{ padding:'5px 6px', textAlign:'right', fontFamily:'var(--mono)', color: acum>0?color:'#4e5a72', borderLeft:'0.5px solid #1c2436', background:bg }}>{fmt(per, fila.key)}</td>
                        <td style={{ padding:'5px 6px', textAlign:'right', fontFamily:'var(--mono)', color: acum>0?color:'#4e5a72', fontWeight: acum>0?600:400, background:bg }}>{fmt(acum, fila.key)}</td>
                      </Frag>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ── Fila del árbol (padre = colapsa hijos · hoja = abre detalle semanal) ──
function ISPRow({ node, semanas, semanaActual, collapsed, openDetail, onToggle, onDetail }:{
  node:NodoISP; semanas:SemInfo[]; semanaActual:number
  collapsed:Set<string>; openDetail:Set<string>
  onToggle:(c:string)=>void; onDetail:(c:string)=>void
}) {
  const hasChildren = node.children.length > 0
  const isLeaf = !hasChildren
  const isCollapsed = collapsed.has(node.codigo)
  const isOpen = openDetail.has(node.codigo)
  const fc = FASE_COLOR[(node.fase ?? '').split('.')[0]] ?? '#94A3B8'
  const nv = isLeaf
    ? { text: fc, bg:'transparent', border: fc, bold:false }
    : (NIVEL_COLOR[node.nivel] ?? NIVEL_DEFAULT)
  const indent = (node.nivel - 1) * 16
  const d = node.rSem[semanaActual]
  const pf = pfColor(d?.pf_acum ?? 0, d?.hh_gast_acum ?? 0)

  return (
    <>
      <tr style={{ background: nv.bg, borderBottom:'0.5px solid #1c2436', borderLeft:`3px solid ${nv.border}`, cursor:'pointer' }}
          onClick={() => isLeaf ? onDetail(node.codigo) : onToggle(node.codigo)}>
        {/* chevron */}
        <td style={{ padding:'7px 4px', width:24 }}>
          <div style={{ paddingLeft: indent, display:'flex' }}>
            {hasChildren
              ? (isCollapsed ? <ChevronRight size={13} style={{ color:nv.text }}/> : <ChevronDown size={13} style={{ color:nv.text }}/>)
              : (isOpen ? <ChevronDown size={12} style={{ color:fc }}/> : <ChevronRight size={12} style={{ color:fc }}/>)}
          </div>
        </td>
        {/* código */}
        <td style={{ padding:'7px 8px', whiteSpace:'nowrap', width:140 }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight: nv.bold?700:600, color: nv.text }}>{node.codigo}</span>
        </td>
        {/* descripción */}
        <td style={{ padding:'7px 8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize: node.nivel<=2?12.5:12, fontWeight: nv.bold?600:400, color: isLeaf?'#e8edf5':nv.text,
              fontStyle: !isLeaf && node.nivel>=2?'italic':'normal', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
              title={node.descripcion}>
              {node.descripcion || 'sin descripción'}
            </span>
            {isLeaf && node.unidad && <span style={{ fontSize:10, color:'#4e5a72', fontFamily:'var(--mono)', flexShrink:0 }}>{node.unidad}</span>}
            {isLeaf && node.factor_conv > 0 && (
              <span style={{ fontSize:9, color:'#4e5a72', background:'#1c2436', border:'0.5px solid #252f45', padding:'1px 5px', borderRadius:4, flexShrink:0 }}>
                FC {node.factor_conv.toFixed(3)}
              </span>
            )}
          </div>
        </td>
        {/* Met. Presup */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color: isLeaf?'#94A3B8':'#4e5a72', width:90 }}>
          {isLeaf && node.metrado_presup > 0 ? node.metrado_presup.toLocaleString('es-PE',{maximumFractionDigits:2}) : '—'}
        </td>
        {/* HH Presup (rollup) */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color: isLeaf?'#8a96ad':'#e8edf5', fontWeight: isLeaf?400:500, width:90 }}>
          {node.rHHPresup > 0 ? node.rHHPresup.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        {/* HH Gan Acum */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color:'#2DD4A8', width:90 }}>
          {d && d.hh_gan_acum>0 ? d.hh_gan_acum.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{ color:'#4e5a72' }}>—</span>}
        </td>
        {/* HH Gast Acum */}
        <td style={{ padding:'7px 12px 7px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color:'#FF6B6B', width:90 }}>
          {d && d.hh_gast_acum>0 ? d.hh_gast_acum.toLocaleString('es-PE',{maximumFractionDigits:1}) : <span style={{ color:'#4e5a72' }}>—</span>}
        </td>
        {/* PF Acum */}
        <td style={{ padding:'7px 10px', textAlign:'center', fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: pf.color, width:70 }}>
          {pf.text}
        </td>
        {/* % Avance */}
        <td style={{ padding:'7px 10px', width:90 }}>
          <div style={{ position:'relative', height:16, background:'#1c2436', borderRadius:8, overflow:'hidden', minWidth:60 }}>
            {(d?.pct_avance ?? 0) > 0 && <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:8,
              background:(d!.pct_avance>=1?'#2DD4A8':'#3B82F6'), width:`${Math.min(d!.pct_avance*100,100)}%`, transition:'width .4s' }}/>}
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:9, fontWeight:700, color:(d?.pct_avance ?? 0)>0.5?'#0f1117':'#8a96ad' }}>
              {((d?.pct_avance ?? 0)*100).toFixed(1)}%
            </span>
          </div>
        </td>
      </tr>

      {/* hoja expandida → detalle semanal */}
      {isLeaf && isOpen && <LeafWeekDetail p={node} semanas={semanas} semanaActual={semanaActual}/>}

      {/* padre expandido → hijos */}
      {hasChildren && !isCollapsed && node.children.map(c => (
        <ISPRow key={c.codigo} node={c} semanas={semanas} semanaActual={semanaActual}
          collapsed={collapsed} openDetail={openDetail} onToggle={onToggle} onDetail={onDetail}/>
      ))}
    </>
  )
}

// ── #5: captura de HH improductivas (oficina, semanal por proyecto, con motivo) ──
const MOTIVOS = ['Espera', 'Clima', 'Retrabajo', 'Falta de material', 'Falta de equipo', 'Otros']
interface ImprodRow { id:number; otm_id:string|null; semana:number; hh:number; motivo:string|null; nota:string|null; partida_id:number|null }

function ImproductivasCard({ semana, otm, partidas }: { semana:number; otm?:string; partidas:PartidaISP[] }) {
  const qc = useQueryClient()
  const [hh, setHh] = useState('')
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [nota, setNota] = useState('')
  const [partidaId, setPartidaId] = useState('')   // #4: atribución opcional a una partida
  const hojasPart = partidas.filter(p => p.es_hoja)
  const partLabel = (id:number|null) => {
    if (!id) return '—'
    const p = partidas.find(x => x.partida_id === id)
    return p ? p.codigo : `#${id}`
  }

  const { data: rows = [], isLoading } = useQuery<ImprodRow[]>({
    queryKey: ['ev-improd', otm, semana],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (otm) qs.set('otm', otm)
      qs.set('semana', String(semana))
      return api(`/ev/improductivas?${qs.toString()}`)
    },
  })

  const guardar = useMutation({
    mutationFn: () => api('/ev/improductivas', {
      method: 'POST',
      body: JSON.stringify({ otm_id: otm || null, semana, hh: Number(hh), motivo, nota: nota || null, partida_id: partidaId ? Number(partidaId) : null }),
    }),
    onSuccess: () => {
      setHh(''); setNota(''); setPartidaId('')
      qc.invalidateQueries({ queryKey:['ev-improd'] })
      qc.invalidateQueries({ queryKey:['ev-reporte'] })  // refresca Resumen y Resumen Ejecutivo
    },
  })

  const borrar = useMutation({
    mutationFn: (id: number) => api(`/ev/improductivas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:['ev-improd'] })
      qc.invalidateQueries({ queryKey:['ev-reporte'] })
    },
  })

  const totalSem = rows.reduce((s,r)=>s+Number(r.hh),0)

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">
          HH Improductivas — Sem {semana}{otm ? ` · ${otm}` : ' · (todos los proyectos)'}
        </h3>
        <span className="text-[11px] font-mono text-k-amber">{totalSem.toLocaleString('es-PE',{maximumFractionDigits:1})} HH</span>
      </div>
      <div className="p-4 space-y-3">
        {!otm && (
          <p className="text-[11px] text-k-amber">Selecciona un proyecto arriba para registrar las improductivas de ese proyecto.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] font-bold text-k-text3 uppercase tracking-wider block mb-1">HH</label>
            <input type="number" min={0} step="0.5" value={hh} onChange={e=>setHh(e.target.value)}
              className="w-24 bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-k-text3 uppercase tracking-wider block mb-1">Motivo</label>
            <select value={motivo} onChange={e=>setMotivo(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber">
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-k-text3 uppercase tracking-wider block mb-1">Partida (opcional)</label>
            <select value={partidaId} onChange={e=>setPartidaId(e.target.value)}
              className="max-w-[220px] bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber">
              <option value="">— Toda el proyecto —</option>
              {hojasPart.map(p => <option key={p.partida_id} value={p.partida_id}>{p.codigo} · {p.descripcion.slice(0,28)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold text-k-text3 uppercase tracking-wider block mb-1">Nota (opcional)</label>
            <input value={nota} onChange={e=>setNota(e.target.value)}
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber" />
          </div>
          <button disabled={!hh || Number(hh)<=0 || guardar.isPending} onClick={()=>guardar.mutate()}
            className="bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2 rounded-lg flex items-center gap-2">
            {guardar.isPending ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Agregar
          </button>
        </div>
        {guardar.isError && <p className="text-[11px] text-red-400">{(guardar.error as Error).message}</p>}

        {isLoading ? (
          <p className="text-k-text3 text-xs flex items-center gap-2"><Loader2 size={12} className="animate-spin"/> Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-k-text3 text-xs">Sin HH improductivas registradas esta semana.</p>
        ) : (
          <table className="w-full" style={{ fontSize:12 }}>
            <thead>
              <tr className="border-b border-k-border">
                <th className="py-1.5 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Motivo</th>
                <th className="py-1.5 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Partida</th>
                <th className="py-1.5 px-2 text-right text-[10px] font-bold text-k-text3 uppercase">HH</th>
                <th className="py-1.5 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Nota</th>
                <th className="py-1.5 px-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-k-border last:border-0">
                  <td className="py-1.5 px-2 text-k-text2">{r.motivo || '—'}</td>
                  <td className="py-1.5 px-2 font-mono text-[11px] text-k-text3">{partLabel(r.partida_id)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-k-amber">{Number(r.hh).toLocaleString('es-PE',{maximumFractionDigits:1})}</td>
                  <td className="py-1.5 px-2 text-k-text3">{r.nota || '—'}</td>
                  <td className="py-1.5 px-2 text-right">
                    <button onClick={()=>borrar.mutate(r.id)} className="text-k-text3 hover:text-k-red" title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[10px] text-k-text3">
          Son HH consumidas no asignadas a partidas: suman al total y bajan el PF del proyecto (#5).
        </p>
      </div>
    </div>
  )
}

export default function TabISP({ semana, otm }: { semana: number; otm?: string }) {
  const [grupFase, setGrupFase] = useState<string|null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openDetail, setOpenDetail] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery<{semanas:SemInfo[]; partidas:PartidaISP[]}>({
    queryKey: ['ev-isp', otm],
    queryFn: () => api(`/ev/isp${otm ? `?otm=${otm}` : ''}`),
    staleTime: 2 * 60_000,
    retry: 1,
  })

  const semanas  = useMemo(() => data?.semanas ?? [], [data])
  const todas    = useMemo(() => data?.partidas ?? [], [data])
  const hojas    = todas.filter(p => p.es_hoja)
  const tree     = useMemo(() => buildTreeISP(todas, semanas), [todas, semanas])

  const toggle = useCallback((c:string)=>setCollapsed(prev=>{ const n=new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n }),[])
  const detail = useCallback((c:string)=>setOpenDetail(prev=>{ const n=new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n }),[])

  // Resumen por fase para semana actual (sobre hojas)
  const resFases = useMemo(() => {
    const map: Record<string,{fase:string; hh_presup:number; hh_gan:number; hh_gast:number; partidas:number}> = {}
    hojas.forEach(p => {
      const f = (p.fase ?? '').split('.')[0] || 'SIN'
      if (!map[f]) map[f] = { fase:f, hh_presup:0, hh_gan:0, hh_gast:0, partidas:0 }
      map[f].hh_presup += p.hh_presup
      map[f].partidas++
      const d = p.semanas[semana]
      if (d) { map[f].hh_gan += d.hh_gan_acum; map[f].hh_gast += d.hh_gast_acum }
    })
    return Object.values(map).sort((a,b) => b.hh_presup-a.hh_presup)
  }, [hojas, semana])

  const totalGan  = resFases.reduce((s,f)=>s+f.hh_gan,0)
  const totalGast = resFases.reduce((s,f)=>s+f.hh_gast,0)
  const totalPlan = resFases.reduce((s,f)=>s+f.hh_presup,0)
  const pfProyecto = totalGast > 0 ? totalGan/totalGast : 0

  if (isLoading) return (
    <div className="flex items-center gap-2 py-10 text-k-text3 text-sm">
      <Loader2 size={14} className="animate-spin"/> Calculando ISP completo...
    </div>
  )
  if (error) return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Error calculando el ISP</p>
        <p className="text-xs mt-1 text-red-400/70 break-all">{(error as Error).message}</p>
      </div>
    </div>
  )
  if (!hojas.length) return (
    <div className="text-center py-12 text-k-text3 text-sm">
      Sin partidas importadas. Ve a la pestaña <strong>Importar</strong> para cargar el presupuesto.
    </div>
  )

  const fasesUnicas = [...new Set(hojas.map(p=>(p.fase??'').split('.')[0]).filter(Boolean))]
  // Con filtro de fase: lista plana de hojas de esa disciplina (envueltas como nodos hoja).
  const hojasFilt: NodoISP[] = grupFase
    ? hojas.filter(p=>(p.fase??'').split('.')[0]===grupFase)
        .map(p=>({ ...p, children:[], rSem:p.semanas, rHHPresup:p.hh_presup, rMetPresup:p.metrado_presup }))
    : []

  return (
    <div className="space-y-4">
      {/* KPIs ejecutivos */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'HH Plan', value: totalPlan.toLocaleString('es-PE',{maximumFractionDigits:0}), unit:'HH', color:'#94A3B8' },
          { label:'HH Ganadas', value: totalGan.toLocaleString('es-PE',{maximumFractionDigits:0}), unit:'HH', color:'#2DD4A8' },
          { label:'HH Gastadas', value: totalGast.toLocaleString('es-PE',{maximumFractionDigits:0}), unit:'HH', color:'#FF6B6B' },
          { label:'PF Proyecto', value: pfProyecto > 0 ? pfProyecto.toFixed(3) : '—', unit:'', color: pfProyecto>=1?'#2DD4A8':pfProyecto>=0.85?'#FACC15':'#FF6B6B' },
        ].map(k => (
          <div key={k.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className="font-mono text-2xl font-medium mb-1" style={{ color:k.color }}>
              {k.value}<span className="text-xs text-k-text3 ml-1">{k.unit}</span>
            </div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wider">{k.label}</div>
          </div>
        ))}
      </div>

      {/* #5: captura de HH improductivas (oficina, semanal por proyecto) */}
      <ImproductivasCard semana={semana} otm={otm} partidas={todas} />

      {/* Resumen por Fase */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-k-raised border-b border-k-border">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Resumen por disciplina — Sem {semana}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize:12, borderCollapse:'collapse' }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised/50">
                {['Disciplina','Partidas','HH Plan','HH Ganadas','HH Gastadas','PF Acum','% Avance'].map(h => (
                  <th key={h} className="py-2 px-3 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resFases.map(f => {
                const pf = pfColor(f.hh_gan, f.hh_gast)
                const pctv = f.hh_presup > 0 ? f.hh_gan/f.hh_presup : 0
                const c = FASE_COLOR[f.fase] ?? '#888780'
                return (
                  <tr key={f.fase} className="border-b border-k-border cursor-pointer hover:bg-k-raised/30"
                      style={{ borderLeft:`3px solid ${c}` }}
                      onClick={() => setGrupFase(grupFase===f.fase ? null : f.fase)}>
                    <td className="py-2 px-3">
                      <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, color:c }}>{f.fase}</span>
                      {grupFase===f.fase && <span className="ml-2 text-[9px] text-k-amber">filtrado</span>}
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-k-text3">{f.partidas}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-text3">{f.hh_presup.toLocaleString('es-PE',{maximumFractionDigits:0})}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-green">{f.hh_gan>0?f.hh_gan.toLocaleString('es-PE',{maximumFractionDigits:1}):'—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-red">{f.hh_gast>0?f.hh_gast.toLocaleString('es-PE',{maximumFractionDigits:1}):'—'}</td>
                    <td className="py-2 px-3 text-center font-mono text-[12px] font-bold" style={{ color:pf.color }}>{pf.text}</td>
                    <td className="py-2 px-3 text-center text-[11px] text-k-blue">{(pctv*100).toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filtro de fase + leyenda de niveles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-k-text3">Filtrar disciplina:</span>
        <button onClick={()=>setGrupFase(null)} className={`text-[11px] px-3 py-1 rounded-lg border transition-colors ${!grupFase?'bg-k-amber text-black border-k-amber':'bg-k-raised border-k-border text-k-text2 hover:border-k-border2'}`}>
          Árbol completo
        </button>
        {fasesUnicas.map(f => {
          const c = FASE_COLOR[f]??'#888780'
          return (
            <button key={f} onClick={()=>setGrupFase(grupFase===f?null:f)}
              className="text-[11px] px-3 py-1 rounded-lg border transition-colors"
              style={{ background: grupFase===f?c+'22':'#1c2436', borderColor: grupFase===f?c:'#252f45', color: grupFase===f?c:'#8a96ad', fontWeight: grupFase===f?700:400 }}>
              {f}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg" style={{ background:'#141926', border:'0.5px solid #252f45' }}>
        <span className="text-[10px]" style={{ color:'#4e5a72' }}>NIVEL:</span>
        {([[1,'#FF9B9B','Raíz'],[2,'#7FE0D4','Sección'],[3,'#D6B3FF','Sub-sección'],[4,'#FFC98B','Detalle']] as [number,string,string][]).map(([n,c,lbl])=>(
          <span key={n} className="flex items-center gap-1 text-[10px]">
            <span style={{ width:10, height:10, borderRadius:2, background:c }}/>
            <span style={{ color:c }}>{n}. {lbl}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px]">
          <span style={{ width:10, height:10, borderRadius:2, background:'#60A5FA' }}/>
          <span style={{ color:'#c8d0e0' }}>Hoja (clic → detalle semanal)</span>
        </span>
      </div>

      {/* Tabla ISP jerárquica */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center justify-between">
          <div>
            <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Informe Semanal de Producción — ResPorSubFase</h3>
            <p className="text-[10px] text-k-text3 mt-0.5">Clic en un nodo para desplegar · en una hoja para ver la tendencia semana a semana · PF: verde ≥1.0 · ámbar 0.85–1.0 · rojo &lt;0.85</p>
          </div>
          <span className="text-[11px] font-mono text-k-text3">{semanas.length} semanas · {hojas.length} actividades</span>
        </div>
        <div className="overflow-x-auto">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised">
                <th style={{ width:24 }}/>
                <th className="py-2 px-2 text-left text-[10px] font-bold text-k-text3 uppercase" style={{ width:140 }}>Código</th>
                <th className="py-2 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Descripción</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ width:90 }}>Met. Presup</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ width:90 }}>HH Presup</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-green uppercase" style={{ width:90 }}>HH Gan Acum</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-red uppercase" style={{ width:90 }}>HH Gast Acum</th>
                <th className="py-2 px-3 text-center text-[10px] font-bold text-k-text3 uppercase" style={{ width:70 }}>PF Acum</th>
                <th className="py-2 px-3 text-center text-[10px] font-bold text-k-blue uppercase" style={{ width:90 }}>% Avance</th>
              </tr>
            </thead>
            <tbody>
              {(grupFase ? hojasFilt : tree).map(node => (
                <ISPRow key={node.codigo} node={node} semanas={semanas} semanaActual={semana}
                  collapsed={collapsed} openDetail={openDetail} onToggle={toggle} onDetail={detail}/>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
