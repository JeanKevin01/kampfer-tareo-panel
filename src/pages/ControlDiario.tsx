import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, ChevronUp, Save, AlertTriangle,
  Users, Zap, CheckCircle2, X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'https://api.apps1.astraera.space'

interface TrabajadorAsig {
  trabajador_id:   string
  nombre:          string
  cargo:           string
  tipo:            string
  hh_registradas: number
  hh_pendientes:  number
  hh_asignadas:   number
}

interface PartidaHoja {
  id:             number
  codigo:         string
  descripcion:    string
  fase:           string
  unidad:         string
  hh_presup:      number
  metrado_presup: number
}

interface SesionPendiente {
  sesion_id:    number
  supervisor:   string
  supervisor_id: string
  otm_id:       string
  fecha:        string
  hh_turno:     number
  hh_total:     number
  hh_asignadas: number
  hh_pendientes:number
  trabajadores: TrabajadorAsig[]
  partidas:     PartidaHoja[]
}

interface Props { fecha?: string }

const FASE_CLR: Record<string, string> = {
  CIV:'#fb923c',FAB:'#818cf8',MEC:'#60a5fa',ELE:'#f59e0b',
  TUB:'#22d3ee',INS:'#a78bfa',EST:'#34d399',AND:'#4ade80',APY:'#94a3b8',
}

// asignaciones key: `${sesion_id}__${trabajador_id}__${partida_id}`
type AsigMap = Record<string, number>
type ModoMap = Record<number, 'todos' | 'individual'>

export default function ControlDiario({ fecha }: Props) {
  const qc = useQueryClient()
  const [sel, setSel]       = useState(fecha ?? new Date().toISOString().slice(0, 10))
  const [open, setOpen]     = useState<Record<number, boolean>>({})
  const [asig, setAsig]     = useState<AsigMap>({})
  const [modo, setModo]     = useState<ModoMap>({})
  const [pid1, setPid1]     = useState<Record<number, number>>({})   // partida "todos a 1"
  const [saving, setSaving] = useState<number | null>(null)
  const [toast, setToast]   = useState<string | null>(null)

  const showToast = (m: string) => {
    setToast(m); setTimeout(() => setToast(null), 3000)
  }

  const { data: sesiones, isLoading } = useQuery<SesionPendiente[]>({
    queryKey: ['sesiones-sin-asignar', sel],
    queryFn:  async () => {
      const r = await fetch(`${API}/ev/sesiones-sin-asignar?fecha=${sel}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    staleTime: 30_000,
  })

  const saveMut = useMutation({
    mutationFn: async (vars: { sesion_id: number; asignaciones: object[] }) => {
      const r = await fetch(`${API}/ev/asignar-sesion-partidas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(vars),
      })
      if (!r.ok) throw new Error()
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sesiones-sin-asignar'] })
      qc.invalidateQueries({ queryKey: ['semana-grid'] })
      qc.invalidateQueries({ queryKey: ['ev-arbol'] })
    },
  })

  /* helpers */
  const key   = (sid: number, tid: string, pid: number) => `${sid}__${tid}__${pid}`
  const getA  = (sid: number, tid: string, pid: number) => asig[key(sid, tid, pid)] ?? 0
  const setA  = (sid: number, tid: string, pid: number, v: string) => {
    const n = v === '' ? 0 : parseFloat(v.replace(',', '.'))
    setAsig(p => ({ ...p, [key(sid, tid, pid)]: isNaN(n) ? 0 : n }))
  }
  const totalAsigTrab = (sid: number, tid: string, partidas: PartidaHoja[]) =>
    partidas.reduce((s, p) => s + getA(sid, tid, p.id), 0)

  const aplicarTodos = (s: SesionPendiente) => {
    const p = pid1[s.sesion_id]; if (!p) return
    const next: AsigMap = {}
    s.trabajadores.forEach(t => { next[key(s.sesion_id, t.trabajador_id, p)] = t.hh_pendientes })
    setAsig(prev => ({ ...prev, ...next }))
  }

  const aplicarAuto = (s: SesionPendiente) => {
    const tot = s.partidas.reduce((a, p) => a + (p.hh_presup || 0), 0)
    if (!tot) return
    const next: AsigMap = {}
    s.trabajadores.forEach(t =>
      s.partidas.forEach(p => {
        const v = Math.round(t.hh_pendientes * ((p.hh_presup || 0) / tot) * 10) / 10
        next[key(s.sesion_id, t.trabajador_id, p.id)] = v
      })
    )
    setAsig(prev => ({ ...prev, ...next }))
  }

  const guardar = async (s: SesionPendiente) => {
    const asigs: object[] = []
    s.trabajadores.forEach(t =>
      s.partidas.forEach(p => {
        const hh = getA(s.sesion_id, t.trabajador_id, p.id)
        if (hh > 0) asigs.push({ trabajador_id: t.trabajador_id, partida_id: p.id, hh })
      })
    )
    if (!asigs.length) { showToast('⚠ Sin asignaciones'); return }
    setSaving(s.sesion_id)
    try {
      await saveMut.mutateAsync({ sesion_id: s.sesion_id, asignaciones: asigs })
      setOpen(p => ({ ...p, [s.sesion_id]: false }))
      setAsig(prev => {
        const next: AsigMap = {}
        Object.entries(prev).forEach(([k, v]) => {
          if (!k.startsWith(`${s.sesion_id}__`)) next[k] = v
        })
        return next
      })
      showToast(`✓ Sesión ${s.sesion_id} asignada`)
    } catch { showToast('✕ Error guardando') }
    finally { setSaving(null) }
  }

  const resumen = useMemo(() => {
    if (!sesiones) return null
    return {
      hhTotal:    sesiones.reduce((s, x) => s + x.hh_total, 0),
      hhPend:     sesiones.reduce((s, x) => s + x.hh_pendientes, 0),
      nsesiones:  sesiones.length,
    }
  }, [sesiones])

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="space-y-4">

      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-k-border bg-k-raised">
        <div>
          <label className="block text-xs text-k-text3 uppercase tracking-widest mb-1">Fecha</label>
          <input type="date" value={sel} onChange={e => setSel(e.target.value)}
            className="bg-k-surface text-k-text border border-k-border rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        {resumen && (
          <div className="ml-auto flex gap-5">
            {[
              ['HH Totales',  resumen.hhTotal.toFixed(1),  'text-k-text'],
              ['HH Pendientes', resumen.hhPend.toFixed(1), 'text-amber-400'],
              ['Sesiones',    String(resumen.nsesiones),   'text-k-text'],
            ].map(([lbl, val, cls]) => (
              <div key={lbl} className="text-center">
                <div className="text-xs text-k-text3 uppercase tracking-wider">{lbl}</div>
                <div className={`text-xl font-bold font-mono ${cls}`}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoading && <div className="text-k-text3 text-sm p-4">Cargando sesiones…</div>}

      {!isLoading && !sesiones?.length && (
        <div className="flex flex-col items-center gap-3 p-10 rounded-xl border border-k-border border-dashed text-k-text3">
          <CheckCircle2 size={32} className="opacity-40" />
          <p className="text-sm">Todas las sesiones del día están asignadas a partidas.</p>
        </div>
      )}

      {sesiones?.map(s => {
        const isOpen = open[s.sesion_id]
        const modoCur = modo[s.sesion_id] ?? 'todos'

        return (
          <div key={s.sesion_id} className="rounded-xl border border-k-border overflow-hidden bg-k-raised">

            {/* Barra */}
            <div
              onClick={() => setOpen(p => ({ ...p, [s.sesion_id]: !p[s.sesion_id] }))}
              className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-white/[.02] transition-colors"
            >
              {isOpen ? <ChevronUp size={16} className="text-k-amber" /> : <ChevronDown size={16} className="text-k-amber" />}
              <span className="font-semibold text-sm">{s.supervisor}</span>
              <span className="text-xs text-k-text3">{s.otm_id} · {s.fecha}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-k-text3">
                  <Users size={12} className="inline mr-1 align-middle" />
                  {s.trabajadores.length} trabajadores
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  s.hh_pendientes > 0
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}>
                  {s.hh_asignadas.toFixed(1)} / {s.hh_total.toFixed(1)} HH
                </span>
              </div>
            </div>

            {/* Panel expandido */}
            {isOpen && (
              <div className="px-5 pb-5 border-t border-k-border">

                {/* Selector de modo */}
                <div className="flex flex-wrap items-center gap-2 py-4">
                  {(['todos', 'individual'] as const).map(m => (
                    <button key={m}
                      onClick={() => setModo(p => ({ ...p, [s.sesion_id]: m }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        modoCur === m
                          ? 'bg-k-amber text-black border-k-amber'
                          : 'bg-transparent text-k-text2 border-k-border hover:text-k-text'
                      }`}>
                      {m === 'todos' ? 'Todos a 1 partida' : 'Asignar individual'}
                    </button>
                  ))}
                  <button onClick={() => aplicarAuto(s)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-k-border text-k-text2 hover:text-k-text transition-colors">
                    <Zap size={12} /> Auto proporcional
                  </button>
                </div>

                {/* Modo: Todos a 1 partida */}
                {modoCur === 'todos' && (
                  <div className="p-4 rounded-xl border border-k-border bg-k-surface mb-4">
                    <p className="text-xs font-semibold text-k-text mb-3">Elige la partida para toda la cuadrilla:</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {s.partidas.map(p => {
                        const sel = pid1[s.sesion_id] === p.id
                        const clr = FASE_CLR[p.fase] || '#94a3b8'
                        return (
                          <button key={p.id}
                            onClick={() => setPid1(prev => ({ ...prev, [s.sesion_id]: p.id }))}
                            style={{ borderColor: sel ? '#f59e0b' : '#252f45' }}
                            className={`text-left p-3 rounded-lg border transition-all ${sel ? 'bg-amber-500/10' : 'bg-k-raised'}`}>
                            <div className="font-mono text-xs font-bold" style={{ color: clr }}>{p.codigo}</div>
                            <div className="text-xs text-k-text mt-0.5 max-w-[180px] truncate">{p.descripcion}</div>
                            <div className="text-[10px] mt-1 uppercase" style={{ color: clr }}>{p.fase} · {p.unidad}</div>
                          </button>
                        )
                      })}
                    </div>
                    <button onClick={() => aplicarTodos(s)}
                      disabled={!pid1[s.sesion_id]}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-black disabled:bg-k-border disabled:text-k-text3 transition-colors">
                      Aplicar {s.hh_total.toFixed(1)} HH a toda la cuadrilla
                    </button>
                  </div>
                )}

                {/* Modo: Individual */}
                {modoCur === 'individual' && (
                  <div className="overflow-x-auto mb-4">
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #252f45' }}>
                          <th style={{ textAlign:'left', padding:'8px 10px', color:'#4e5a72', fontWeight:700 }}>Trabajador</th>
                          {['HH', 'Asig', 'Pend'].map(h => (
                            <th key={h} style={{ textAlign:'center', padding:'8px 6px', color:'#4e5a72', fontWeight:700 }}>{h}</th>
                          ))}
                          {s.partidas.map(p => (
                            <th key={p.id} style={{
                              textAlign:'center', padding:'8px 5px', minWidth:80,
                              color: FASE_CLR[p.fase] || '#94a3b8', fontWeight:700, fontSize:10,
                              borderLeft:'1px solid #252f45',
                            }}>
                              <div>{p.codigo}</div>
                              <div style={{ opacity:.6 }}>{p.fase}</div>
                            </th>
                          ))}
                          <th style={{ textAlign:'center', padding:'8px 6px', color:'#4e5a72', fontWeight:700 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.trabajadores.map(t => {
                          const tot = totalAsigTrab(s.sesion_id, t.trabajador_id, s.partidas)
                          const ok  = Math.abs(tot - t.hh_registradas) < 0.15
                          return (
                            <tr key={t.trabajador_id} style={{ borderBottom:'1px solid #1a2133' }}>
                              <td style={{ padding:'8px 10px' }}>
                                <div style={{ fontWeight:600, color:'#e8edf5' }}>{t.nombre}</div>
                                <div style={{ fontSize:10, color:'#4e5a72' }}>
                                  {t.cargo} ·{' '}
                                  <span style={{ color: t.tipo==='DIRECTO' ? '#10b981' : '#8a96ad', fontWeight:600 }}>
                                    {t.tipo}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign:'center', fontFamily:'monospace', fontWeight:700, color:'#e8edf5' }}>
                                {t.hh_registradas.toFixed(1)}
                              </td>
                              <td style={{ textAlign:'center', fontFamily:'monospace', color:'#8a96ad' }}>
                                {t.hh_asignadas.toFixed(1)}
                              </td>
                              <td style={{ textAlign:'center', fontFamily:'monospace', color:'#f59e0b', fontWeight:700 }}>
                                {t.hh_pendientes.toFixed(1)}
                              </td>
                              {s.partidas.map(p => (
                                <td key={p.id} style={{ padding:'3px 3px', borderLeft:'1px solid #252f45' }}>
                                  <input
                                    type="number" step="0.5" min="0" max={t.hh_registradas}
                                    value={getA(s.sesion_id, t.trabajador_id, p.id) || ''}
                                    onChange={e => setA(s.sesion_id, t.trabajador_id, p.id, e.target.value)}
                                    style={{
                                      width:'100%', padding:'5px 3px', textAlign:'center',
                                      background:'#1c2436', color:'#e8edf5',
                                      border:'1px solid #252f45', borderRadius:6,
                                      fontSize:12, outline:'none',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                                    onBlur={e  => (e.currentTarget.style.borderColor = '#252f45')}
                                  />
                                </td>
                              ))}
                              <td style={{
                                textAlign:'center', fontFamily:'monospace', fontWeight:700,
                                color: ok ? '#10b981' : '#ef4444',
                                padding:'8px 8px',
                              }}>
                                {tot.toFixed(1)}
                                {!ok && <AlertTriangle size={11} style={{ display:'inline-block', marginLeft:3, verticalAlign:'middle' }} />}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Botones */}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setOpen(p => ({ ...p, [s.sesion_id]: false }))}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs border border-k-border text-k-text2 hover:text-k-text transition-colors">
                    <X size={13} /> Cerrar
                  </button>
                  <button onClick={() => guardar(s)} disabled={saving === s.sesion_id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-k-amber text-black disabled:opacity-50 transition-opacity">
                    <Save size={14} />
                    {saving === s.sesion_id ? 'Guardando…' : 'Guardar asignación'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-sm font-semibold z-50
          bg-k-raised border border-k-border text-k-text shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}