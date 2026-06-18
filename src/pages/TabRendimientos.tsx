import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, User, BarChart2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'https://api.apps1.astraera.space'

interface PartidaRend {
  partida_id:    number
  codigo:        string
  descripcion:   string
  fase:          string
  unidad:        string
  hh_total:      number
  cant_acum:     number
  hh_ganadas:    number | null
  pf_promedio?:  number | null
  pf?:           number | null
  n_trabajadores?: number
  dias?:         number
  dias_trabajados?: number
}

interface RendTrabajador {
  trabajador_id:    string
  nombre:           string
  cargo:            string
  partidas:         PartidaRend[]
  hh_total_global:  number
}

interface RendCuadrilla {
  supervisor_id: string
  nombre:        string
  partidas:      PartidaRend[]
}

interface Props {
  semana:      number
  selectedOtm: string
  supervisores: { id: string; nombre: string }[]
  trabajadores: { id: string; nombre: string; cargo: string }[]
}

const FASE_COLORS: Record<string, string> = {
  CIV:'#fb923c',FAB:'#818cf8',MEC:'#60a5fa',ELE:'#f59e0b',
  TUB:'#22d3ee',INS:'#a78bfa',EST:'#34d399',AND:'#4ade80',APY:'#94a3b8',
}

const pfChip = (pf: number | null | undefined) => {
  if (pf == null) return null
  const color = pf >= 1 ? '#10b981' : pf >= 0.8 ? '#f59e0b' : '#ef4444'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12,
      background: color + '20', border: `1px solid ${color}40`,
      color, fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
    }}>
      {pf.toFixed(2)}
    </span>
  )
}

export default function TabRendimientos({ semana, selectedOtm, supervisores, trabajadores }: Props) {
  const [vista, setVista] = useState<'cuadrilla' | 'persona'>('cuadrilla')
  const [trabId, setTrabId] = useState('')
  const [desde,  setDesde]  = useState('')
  const [hasta,  setHasta]  = useState('')

  // Query cuadrillas
  const cuadrQuery = useQuery<RendCuadrilla[]>({
    queryKey: ['rend-cuadrilla', semana, selectedOtm],
    queryFn:  async () => {
      const p = new URLSearchParams({ semana: String(semana) })
      const r = await fetch(`${API}/ev/rendimiento-cuadrillas?${p}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: vista === 'cuadrilla',
    staleTime: 60_000,
  })

  // Query trabajador
  const trabQuery = useQuery<RendTrabajador>({
    queryKey: ['rend-trab', trabId, desde, hasta],
    queryFn:  async () => {
      const p = new URLSearchParams({ trabajador_id: trabId })
      if (desde) p.set('desde', desde)
      if (hasta) p.set('hasta', hasta)
      const r = await fetch(`${API}/ev/rendimiento-trabajador?${p}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: vista === 'persona' && !!trabId,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {([['cuadrilla', Users, 'Por cuadrilla'], ['persona', User, 'Por persona']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setVista(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${vista === id
                ? 'bg-k-amber text-black'
                : 'bg-k-raised border border-k-border text-k-text2 hover:text-k-text'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── VISTA: CUADRILLA ── */}
      {vista === 'cuadrilla' && (
        <div>
          {cuadrQuery.isLoading && (
            <div className="text-k-text3 text-sm p-4">Cargando rendimientos semana {semana}…</div>
          )}
          {cuadrQuery.data?.length === 0 && (
            <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
              Sin datos de tareo por partida en la semana {semana}.
              <br/><span className="text-xs">El nuevo flujo de la app registra partidas por trabajador.</span>
            </div>
          )}
          {cuadrQuery.data && cuadrQuery.data.map(sup => (
            <div key={sup.supervisor_id} className="mb-5 rounded-xl border border-k-border overflow-hidden">
              <div className="bg-k-raised px-4 py-3 flex items-center gap-3">
                <Users size={14} className="text-k-amber" />
                <span className="font-semibold text-sm">{sup.nombre}</span>
                <span className="text-xs text-k-text3">{sup.partidas.length} partidas · sem {semana}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1c2436' }}>
                    {['Fase','Código','Descripción','HH Gastadas','Cant. Acum.','HH Ganadas','PF','Workers','Días']
                      .map(h => (
                        <th key={h} style={{
                          padding: '7px 12px', textAlign: h==='Descripción'?'left':'center',
                          fontSize: 10, color: '#4e5a72', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: 1,
                          borderBottom: '1px solid #252f45',
                        }}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {sup.partidas.map((p, i) => {
                    const color = FASE_COLORS[p.fase] || '#94a3b8'
                    return (
                      <tr key={p.partida_id}
                          style={{ borderBottom: i < sup.partidas.length - 1 ? '1px solid #1c2436' : 'none' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{
                            padding:'2px 6px',borderRadius:4,fontSize:9,fontWeight:800,
                            background:color+'20',border:`1px solid ${color}40`,color,
                          }}>{p.fase}</span>
                        </td>
                        <td style={{ padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:11,color:'#f59e0b' }}>{p.codigo}</td>
                        <td style={{ padding:'8px 12px',fontSize:12,color:'#e8edf5',maxWidth:200,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                          {p.descripcion}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#f59e0b',fontWeight:600}}>{p.hh_total.toFixed(1)}</td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#8a96ad'}}>{p.cant_acum > 0 ? p.cant_acum.toFixed(2) : '—'}</td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#10b981'}}>
                          {p.hh_ganadas != null ? p.hh_ganadas.toFixed(1) : '—'}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center'}}>
                          {pfChip(p.pf ?? null)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:11,color:'#8a96ad'}}>{p.n_trabajadores ?? '—'}</td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:11,color:'#4e5a72'}}>{p.dias ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── VISTA: PERSONA ── */}
      {vista === 'persona' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-k-border bg-k-raised">
            <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 200 }}>
              <label className="text-xs font-semibold text-k-text3 uppercase tracking-widest">Trabajador</label>
              <select
                value={trabId}
                onChange={e => setTrabId(e.target.value)}
                className="bg-k-surface border border-k-border rounded-lg px-3 py-2 text-sm text-k-text">
                <option value="">— Selecciona —</option>
                {trabajadores.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.id})</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-k-text3 uppercase tracking-widest">Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="bg-k-surface border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-k-text3 uppercase tracking-widest">Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="bg-k-surface border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
            </div>
          </div>

          {!trabId && (
            <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
              Selecciona un trabajador para ver su historial de rendimiento por partida
            </div>
          )}

          {trabQuery.isLoading && (
            <div className="text-k-text3 text-sm p-4">Cargando historial…</div>
          )}

          {trabQuery.data && (
            <div className="rounded-xl border border-k-border overflow-hidden">
              {/* Header trabajador */}
              <div className="bg-k-raised px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <User size={14} className="text-k-amber" />
                  <div>
                    <span className="font-semibold text-sm">{trabQuery.data.nombre}</span>
                    <span className="text-xs text-k-text3 ml-2">{trabQuery.data.cargo}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-k-text3">
                  <BarChart2 size={12} />
                  <span className="font-mono font-semibold text-k-amber">
                    {trabQuery.data.hh_total_global.toFixed(1)} HH total
                  </span>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1c2436' }}>
                    {['Fase','Código','Descripción','HH Total','Cant. Acum.','HH Ganadas','PF Prom.','Días'].map(h => (
                      <th key={h} style={{
                        padding: '7px 12px', textAlign: h==='Descripción'?'left':'center',
                        fontSize: 10, color: '#4e5a72', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 1,
                        borderBottom: '1px solid #252f45',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trabQuery.data.partidas.map((p, i) => {
                    const color = FASE_COLORS[p.fase] || '#94a3b8'
                    return (
                      <tr key={p.partida_id}
                          style={{ borderBottom: i < trabQuery.data!.partidas.length-1 ? '1px solid #1c2436':'none' }}>
                        <td style={{ padding:'8px 12px',textAlign:'center' }}>
                          <span style={{ padding:'2px 6px',borderRadius:4,fontSize:9,fontWeight:800,
                            background:color+'20',border:`1px solid ${color}40`,color }}>
                            {p.fase}
                          </span>
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:11,color:'#f59e0b'}}>{p.codigo}</td>
                        <td style={{padding:'8px 12px',fontSize:12,color:'#e8edf5',maxWidth:180,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {p.descripcion}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#f59e0b',fontWeight:600}}>
                          {p.hh_total.toFixed(1)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#8a96ad'}}>
                          {p.cant_acum > 0 ? p.cant_acum.toFixed(2) : '—'}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:12,color:'#10b981'}}>
                          {p.hh_ganadas != null ? p.hh_ganadas.toFixed(1) : '—'}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center'}}>
                          {pfChip(p.pf_promedio ?? null)}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'center',fontFamily:'monospace',
                          fontSize:11,color:'#4e5a72'}}>
                          {p.dias_trabajados ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}