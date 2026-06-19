// TabISP.tsx — Informe Semanal de Producción (ISP) estilo Fluor
// Replica ResPorSubFase + Productividades + Resumen Ejecutivo
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

const FASE_COLOR: Record<string,string> = {
  FAB:'#2DD4A8',EST:'#60A5FA',MEC:'#FB923C',ELE:'#FACC15',
  TUB:'#A78BFA',INS:'#F472B6',CIV:'#94A3B8',AND:'#34D399',
  APY:'#86EFAC',ING:'#FCD34D',COM:'#C4B5FD',
}

interface SemInfo  { semana:number; label:string; inicio:string; fin:string; label_full:string }
interface SemDato  { hh_gan_acum:number; hh_gan_sem:number; hh_gast_acum:number; hh_gast_sem:number; pf_acum:number; pf_sem:number; pct_avance:number; cant_acum:number }
interface PartidaISP {
  partida_id:number; codigo:string; otm_id:string; descripcion:string
  unidad:string|null; fase:string|null; hh_presup:number; metrado_presup:number
  metrado_proyec:number; factor_conv:number; es_hoja:boolean
  semanas: Record<number, SemDato>
}

function pfColor(pf:number, gast:number) {
  if (gast <= 0) return { color:'#4e5a72', text:'—' }
  const c = pf >= 1 ? '#2DD4A8' : pf >= 0.85 ? '#FACC15' : '#FF6B6B'
  return { color: c, text: pf.toFixed(2) }
}

function FilaPartida({ p, semanas, semanaActual }: { p:PartidaISP; semanas:SemInfo[]; semanaActual:number }) {
  const [exp, setExp] = useState(false)
  const fc = FASE_COLOR[p.fase?.split('.')[0] ?? ''] ?? '#888780'
  const dat = p.semanas[semanaActual]
  const pf  = pfColor(dat?.pf_acum ?? 0, dat?.hh_gast_acum ?? 0)

  const filas = [
    { key:'cant',   label:'Cant Ejecutada',  unit: p.unidad ?? '—',  color:'#94A3B8', fn: (d:SemDato) => ({ per: d.cant_acum - (p.semanas[semanas.find(s=>s.semana<semanas[0]?.semana)?.semana??0]?.cant_acum??0), acum: d.cant_acum }) },
    { key:'hhgast', label:'HH Gastadas',     unit:'HH', color:'#FF6B6B',   fn: (d:SemDato) => ({ per: d.hh_gast_sem, acum: d.hh_gast_acum }) },
    { key:'hhgan',  label:'HH Ganadas',      unit:'HH', color:'#2DD4A8',   fn: (d:SemDato) => ({ per: d.hh_gan_sem,  acum: d.hh_gan_acum  }) },
    { key:'pf',     label:'P.F.',            unit:'',   color:'',          fn: (d:SemDato) => ({ per: d.pf_sem, acum: d.pf_acum }) },
    { key:'pct',    label:'% Avance',        unit:'',   color:'#60A5FA',   fn: (d:SemDato) => ({ per: d.pct_avance - (p.semanas[semanas.find((s,i)=>semanas[i-1]?.semana===s.semana-1)?semanas.indexOf(semanas.find(s2=>s2.semana===s.semana-1)!):-1]?.semana??0)?.pct_avance??0, acum: d.pct_avance }) },
  ]

  const fmt = (v:number, key:string) => {
    if (!isFinite(v) || isNaN(v)) return '—'
    if (key === 'pct') return (v*100).toFixed(1)+'%'
    if (key === 'pf')  return pfColor(v, 1).text
    return v > 0 ? v.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'
  }
  const fmtColor = (v:number, key:string) => {
    if (key === 'pf') return pfColor(v,1).color
    return undefined
  }

  return (
    <>
      {/* Fila encabezado de la partida */}
      <tr style={{ background: fc+'12', borderLeft:`3px solid ${fc}`, borderBottom:`0.5px solid ${fc}30` }}
          className="cursor-pointer" onClick={() => setExp(!exp)}>
        <td className="py-2 px-3" style={{ width:24 }}>
          {exp ? <ChevronDown size={12} style={{color:fc}}/> : <ChevronRight size={12} style={{color:fc}}/>}
        </td>
        <td className="py-2 px-2" style={{ whiteSpace:'nowrap' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:700, color:fc }}>{p.codigo}</span>
        </td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-2">
            <span style={{ fontSize:12, fontWeight:600, color:'#e8edf5' }}>{p.descripcion}</span>
            <span style={{ fontSize:10, color:'#4e5a72', fontFamily:'var(--mono)' }}>{p.unidad}</span>
            {p.factor_conv > 0 && (
              <span style={{ fontSize:9, color:'#4e5a72', background:'#1c2436', border:'0.5px solid #252f45', padding:'1px 5px', borderRadius:4 }}>
                FC {p.factor_conv.toFixed(3)} HH/{p.unidad}
              </span>
            )}
          </div>
        </td>
        {/* Presupuestado */}
        <td className="py-2 px-3 text-right" style={{ fontFamily:'var(--mono)', fontSize:11, color:'#94A3B8' }}>
          {p.metrado_presup > 0 ? p.metrado_presup.toLocaleString('es-PE',{maximumFractionDigits:2}) : '—'}
        </td>
        <td className="py-2 px-3 text-right" style={{ fontFamily:'var(--mono)', fontSize:11, color:'#94A3B8' }}>
          {p.hh_presup > 0 ? p.hh_presup.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        {/* Actual semana */}
        <td className="py-2 px-3 text-right" style={{ fontFamily:'var(--mono)', fontSize:11, color:'#2DD4A8' }}>
          {dat ? dat.hh_gan_acum.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        <td className="py-2 px-3 text-right" style={{ fontFamily:'var(--mono)', fontSize:11, color:'#FF6B6B' }}>
          {dat ? dat.hh_gast_acum.toLocaleString('es-PE',{maximumFractionDigits:1}) : '—'}
        </td>
        <td className="py-2 px-3 text-center" style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: pf.color }}>
          {pf.text}
        </td>
        <td className="py-2 px-3 text-center" style={{ fontSize:11, color:'#60A5FA' }}>
          {dat ? (dat.pct_avance*100).toFixed(1)+'%' : '—'}
        </td>
      </tr>

      {/* Tabla expandida por semana */}
      {exp && (
        <tr>
          <td colSpan={9} style={{ padding:0, background:'#0d1220' }}>
            <div style={{ overflowX:'auto', borderTop:'0.5px solid #1c2436' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#141926', borderBottom:'0.5px solid #252f45' }}>
                    <th style={{ padding:'6px 12px', textAlign:'left', color:'#4e5a72', fontWeight:600, fontSize:10, whiteSpace:'nowrap', minWidth:130 }}>Métrica</th>
                    {semanas.map(s => (
                      <th key={s.semana} colSpan={2} style={{ padding:'6px 8px', textAlign:'center', color: s.semana===semanaActual?'#f59e0b':'#4e5a72', fontWeight:600, fontSize:10, borderLeft:'0.5px solid #1c2436', minWidth:120 }}>
                        {s.label}
                        {s.semana===semanaActual && <span style={{fontSize:8,display:'block',color:'#f59e0b99'}}>Actual</span>}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background:'#0d1220', borderBottom:'0.5px solid #1c2436' }}>
                    <th style={{ padding:'3px 12px' }}/>
                    {semanas.map(s => (
                      <>
                        <th key={`${s.semana}-per`} style={{ padding:'3px 6px', textAlign:'right', color:'#4e5a72', fontSize:9, fontWeight:500, borderLeft:'0.5px solid #1c2436' }}>Período</th>
                        <th key={`${s.semana}-acum`} style={{ padding:'3px 6px', textAlign:'right', color:'#4e5a72', fontSize:9, fontWeight:500 }}>Acumul.</th>
                      </>
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
                          <><td key={`${s.semana}-p`} style={{ padding:'5px 6px', textAlign:'right', color:'#252f45', borderLeft:'0.5px solid #1c2436' }}>—</td>
                            <td key={`${s.semana}-a`} style={{ padding:'5px 6px', textAlign:'right', color:'#252f45' }}>—</td></>
                        )
                        const vals = fila.fn(d)
                        const perV = vals.per
                        const acumV = vals.acum
                        const color = fila.key==='pf' ? pfColor(acumV,1).color : (fila.color || '#8a96ad')
                        return (
                          <>
                            <td key={`${s.semana}-p`} style={{ padding:'5px 6px', textAlign:'right', fontFamily:'var(--mono)', color: acumV>0?color:'#4e5a72', borderLeft:'0.5px solid #1c2436', background: s.semana===semanaActual?'#1c2436':'transparent' }}>
                              {fmt(perV, fila.key)}
                            </td>
                            <td key={`${s.semana}-a`} style={{ padding:'5px 6px', textAlign:'right', fontFamily:'var(--mono)', color: acumV>0?color:'#4e5a72', fontWeight: acumV>0 ? 600 : 400, background: s.semana===semanaActual?'#1c2436':'transparent' }}>
                              {fmt(acumV, fila.key)}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function TabISP({ semana, otm }: { semana: number; otm?: string }) {
  const [grupFase, setGrupFase] = useState<string|null>(null)

  const { data, isLoading, error } = useQuery<{semanas:SemInfo[]; partidas:PartidaISP[]}>({
    queryKey: ['ev-isp', otm],
    queryFn: async () => {
      const r = await fetch(`${API}/ev/isp${otm?`?otm=${otm}`:''}`)
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail ? JSON.stringify(j.detail) : `Error ${r.status}`)
      }
      return r.json()
    },
    staleTime: 2 * 60_000,
    retry: 1,
  })

  const semanas   = data?.semanas ?? []
  const partidas  = (data?.partidas ?? []).filter(p => p.es_hoja)

  // Resumen por fase para semana actual
  const resFases = useMemo(() => {
    const map: Record<string,{fase:string; hh_presup:number; hh_gan:number; hh_gast:number; partidas:number}> = {}
    partidas.forEach(p => {
      const f = (p.fase ?? '').split('.')[0] || 'SIN'
      if (!map[f]) map[f] = { fase:f, hh_presup:0, hh_gan:0, hh_gast:0, partidas:0 }
      map[f].hh_presup += p.hh_presup
      map[f].partidas++
      const d = p.semanas[semana]
      if (d) { map[f].hh_gan += d.hh_gan_acum; map[f].hh_gast += d.hh_gast_acum }
    })
    return Object.values(map).sort((a,b) => b.hh_presup-a.hh_presup)
  }, [partidas, semana])

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
  if (!partidas.length) return (
    <div className="text-center py-12 text-k-text3 text-sm">
      Sin partidas importadas. Ve a la pestaña <strong>Importar</strong> para cargar el presupuesto.
    </div>
  )

  const fasesUnicas = [...new Set(partidas.map(p=>(p.fase??'').split('.')[0]).filter(Boolean))]
  const partidasFilt = grupFase ? partidas.filter(p=>(p.fase??'').split('.')[0]===grupFase) : partidas

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

      {/* Resumen por Fase */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-k-raised border-b border-k-border">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Resumen por disciplina — Sem {semana}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize:12, borderCollapse:'collapse' }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised/50">
                {['Disciplina','Descripción','Partidas','HH Plan','HH Ganadas','HH Gastadas','PF Acum','% Avance'].map(h => (
                  <th key={h} className="py-2 px-3 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resFases.map(f => {
                const pf = pfColor(f.hh_gan, f.hh_gast)
                const pct = f.hh_presup > 0 ? f.hh_gan/f.hh_presup : 0
                const c = FASE_COLOR[f.fase] ?? '#888780'
                return (
                  <tr key={f.fase} className="border-b border-k-border cursor-pointer hover:bg-k-raised/30"
                      style={{ borderLeft:`3px solid ${c}` }}
                      onClick={() => setGrupFase(grupFase===f.fase ? null : f.fase)}>
                    <td className="py-2 px-3">
                      <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, color:c }}>{f.fase}</span>
                      {grupFase===f.fase && <span className="ml-2 text-[9px] text-k-amber">filtrado</span>}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-k-text2">{f.fase}</td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-k-text3">{f.partidas}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-text3">{f.hh_presup.toLocaleString('es-PE',{maximumFractionDigits:0})}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-green">{f.hh_gan>0?f.hh_gan.toLocaleString('es-PE',{maximumFractionDigits:1}):'—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-k-red">{f.hh_gast>0?f.hh_gast.toLocaleString('es-PE',{maximumFractionDigits:1}):'—'}</td>
                    <td className="py-2 px-3 text-center font-mono text-[12px] font-bold" style={{ color:pf.color }}>{pf.text}</td>
                    <td className="py-2 px-3 text-center text-[11px] text-k-blue">{(pct*100).toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filtro de fase */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-k-text3">Filtrar disciplina:</span>
        <button onClick={()=>setGrupFase(null)} className={`text-[11px] px-3 py-1 rounded-lg border transition-colors ${!grupFase?'bg-k-amber text-black border-k-amber':'bg-k-raised border-k-border text-k-text2 hover:border-k-border2'}`}>
          Todas
        </button>
        {fasesUnicas.map(f => {
          const c = FASE_COLOR[f]??'#888780'
          return (
            <button key={f} onClick={()=>setGrupFase(grupFase===f?null:f)}
              className={`text-[11px] px-3 py-1 rounded-lg border transition-colors`}
              style={{
                background: grupFase===f ? c+'22' : '#1c2436',
                borderColor: grupFase===f ? c : '#252f45',
                color: grupFase===f ? c : '#8a96ad',
                fontWeight: grupFase===f ? 700 : 400,
              }}>
              {f}
            </button>
          )
        })}
        <span className="text-[10px] text-k-text3 ml-2">{partidasFilt.length} actividades · Click en fila de disciplina o en botón para filtrar</span>
      </div>

      {/* Tabla ISP principal (ResPorSubFase) */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center justify-between">
          <div>
            <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Informe Semanal de Producción — ResPorSubFase</h3>
            <p className="text-[10px] text-k-text3 mt-0.5">Haz clic en una fila para ver la tendencia semana a semana · PF: verde ≥1.0 · ámbar 0.85–1.0 · rojo &lt;0.85</p>
          </div>
          <span className="text-[11px] font-mono text-k-text3">{semanas.length} semanas · {partidasFilt.length} actividades</span>
        </div>
        <div className="overflow-x-auto">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised">
                <th style={{ width:24 }}/>
                <th className="py-2 px-2 text-left text-[10px] font-bold text-k-text3 uppercase" style={{ width:120 }}>Código</th>
                <th className="py-2 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Descripción · FC</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ width:90 }}>Met. Presup</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ width:90 }}>HH Presup</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-green uppercase" style={{ width:90 }}>HH Gan Acum</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-red uppercase" style={{ width:90 }}>HH Gast Acum</th>
                <th className="py-2 px-3 text-center text-[10px] font-bold text-k-text3 uppercase" style={{ width:70 }}>PF Acum</th>
                <th className="py-2 px-3 text-center text-[10px] font-bold text-k-blue uppercase" style={{ width:80 }}>% Avance</th>
              </tr>
            </thead>
            <tbody>
              {partidasFilt.map(p => (
                <FilaPartida key={p.partida_id} p={p} semanas={semanas} semanaActual={semana}/>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}