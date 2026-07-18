import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Upload, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE

interface PartidaHoja {
  id:             number
  codigo:         string
  descripcion:    string
  fase:           string
  unidad:         string
  hh_presup:      number
  metrado_presup: number
}

interface Props {
  semana:      number
  selectedOtm: string
}

const FASE_CLR: Record<string, string> = {
  CIV:'#fb923c',FAB:'#818cf8',MEC:'#60a5fa',ELE:'#f59e0b',
  TUB:'#22d3ee',INS:'#a78bfa',EST:'#34d399',AND:'#4ade80',APY:'#94a3b8',
}

export default function CargaHistorica({ semana, selectedOtm }: Props) {
  const qc = useQueryClient()
  const [filas, setFilas] = useState<Record<number, { hh: string; cant: string }>>({})
  const [saved, setSaved] = useState(false)

  /* ── Partidas de el proyecto ──────────────────────────────────── */
  const { data: partidas, isLoading } = useQuery<PartidaHoja[]>({
    queryKey: ['partidas-otm-hist', selectedOtm],
    queryFn:  async () => {
      if (!selectedOtm) return []
      const r = await fetch(`${API}/api/partidas-otm/${encodeURIComponent(selectedOtm)}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: !!selectedOtm,
    staleTime: 60_000,
  })

  /* ── Histórico existente → precargar ─────────────────────── */
  const { data: historico } = useQuery<any[]>({
    queryKey: ['historico', selectedOtm, semana],
    queryFn:  async () => {
      if (!selectedOtm) return []
      const r = await fetch(`${API}/ev/historico/lista?otm_id=${selectedOtm}&semana=${semana}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: !!selectedOtm,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!historico) return
    const next: Record<number, { hh: string; cant: string }> = {}
    historico.forEach((h: any) => {
      next[h.partida_id] = {
        hh:   h.hh_gastadas_acum        ? String(h.hh_gastadas_acum)        : '',
        cant: h.cantidad_ejecutada_acum  ? String(h.cantidad_ejecutada_acum) : '',
      }
    })
    setFilas(next)
  }, [historico])

  const set = (pid: number, campo: 'hh' | 'cant', val: string) =>
    setFilas(p => ({ ...p, [pid]: { ...(p[pid] || { hh:'', cant:'' }), [campo]: val } }))

  /* ── Guardar ─────────────────────────────────────────────── */
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(filas)
        .filter(([, v]) => v.hh !== '' || v.cant !== '')
        .map(([pid, v]) => ({
          partida_id:             Number(pid),
          hh_gastadas_acum:       v.hh   === '' ? 0 : parseFloat(v.hh.replace(',', '.')),
          cantidad_ejecutada_acum: v.cant === '' ? 0 : parseFloat(v.cant.replace(',', '.')),
        }))
      if (!payload.length) throw new Error('No hay datos')
      const r = await fetch(`${API}/ev/historico/cargar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ otm_id: selectedOtm, semana, filas: payload }),
      })
      if (!r.ok) throw new Error()
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['historico'] })
      qc.invalidateQueries({ queryKey: ['ev-arbol'] })
      qc.invalidateQueries({ queryKey: ['ev-isp'] })
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    },
  })

  /* ── Totales ─────────────────────────────────────────────── */
  let totHH = 0, totCant = 0
  if (partidas) partidas.forEach(p => {
    const f = filas[p.id]
    if (!f) return
    totHH   += f.hh   ? parseFloat(f.hh.replace(',', '.'))   || 0 : 0
    totCant += f.cant ? parseFloat(f.cant.replace(',', '.')) || 0 : 0
  })

  /* ── Agrupar por fase ────────────────────────────────────── */
  const byFase: Record<string, PartidaHoja[]> = {}
  if (partidas) partidas.forEach(p => {
    if (!byFase[p.fase]) byFase[p.fase] = []
    byFase[p.fase].push(p)
  })
  const [colFase, setColFase] = useState<Record<string, boolean>>({})

  if (!selectedOtm) return (
    <div className="flex flex-col items-center gap-3 p-10 text-k-text3">
      <AlertTriangle size={28} className="opacity-40" />
      <p className="text-sm">Selecciona un proyecto para cargar datos históricos.</p>
    </div>
  )

  if (isLoading) return <div className="text-k-text3 text-sm p-4">Cargando partidas…</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-k-border bg-k-raised">
        <div>
          <div className="text-xs text-k-text3 uppercase tracking-widest">OTM</div>
          <div className="text-base font-bold text-k-text">{selectedOtm}</div>
        </div>
        <div>
          <div className="text-xs text-k-text3 uppercase tracking-widest">Semana de corte</div>
          <div className="text-base font-bold text-k-amber">Semana {semana}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 size={15} /> Guardado
            </span>
          )}
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-k-amber text-black disabled:opacity-50">
            <Save size={15} />
            {saveMut.isPending ? 'Guardando…' : 'Guardar histórico'}
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-k-text">
        <Upload size={14} className="text-k-amber flex-shrink-0 mt-0.5" />
        <span>
          Ingresa los valores <strong>acumulados</strong> hasta la semana {semana}.
          El EV calculará el PF y % de avance desde estos datos.
          Si la semana ya tiene datos, se mostrarán precargados.
        </span>
      </div>

      {/* Tabla por fase */}
      {Object.entries(byFase).map(([fase, ps]) => {
        const isOpen = colFase[fase] !== false  // default abierto
        const clr    = FASE_CLR[fase] || '#94a3b8'
        return (
          <div key={fase} className="rounded-xl border border-k-border overflow-hidden">
            <button
              onClick={() => setColFase(p => ({ ...p, [fase]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-k-raised hover:bg-white/[.02] transition-colors">
              <span style={{ padding:'2px 8px', borderRadius:5, fontSize:9, fontWeight:800,
                background:clr+'20', border:`1px solid ${clr}40`, color:clr }}>
                {fase}
              </span>
              <span className="font-semibold text-sm text-k-text">{ps.length} partidas</span>
              <ChevronDown size={14} className={`ml-auto text-k-text3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #252f45', background:'#1c2436' }}>
                    {['Código','Descripción','Unidad','M. Presup','HH Presup'].map(h => (
                      <th key={h} style={{ textAlign: h==='Descripción'?'left':'center',
                        padding:'8px 10px', color:'#4e5a72', fontWeight:700, fontSize:10,
                        textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                    <th style={{ textAlign:'right', padding:'8px 10px', color:'#f59e0b',
                      fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:1,
                      background:'rgba(245,158,11,.05)' }}>
                      HH Gastadas Acum
                    </th>
                    <th style={{ textAlign:'right', padding:'8px 10px', color:'#10b981',
                      fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:1,
                      background:'rgba(16,185,129,.05)' }}>
                      Cant Ejecutada Acum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ps.map(p => {
                    const f = filas[p.id] || { hh:'', cant:'' }
                    return (
                      <tr key={p.id} style={{ borderBottom:'1px solid #1a2133' }}>
                        <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:11,
                          fontWeight:600, color:'#f59e0b' }}>{p.codigo}</td>
                        <td style={{ padding:'9px 10px', color:'#e8edf5' }}>{p.descripcion}</td>
                        <td style={{ textAlign:'center', padding:'9px 10px', color:'#4e5a72' }}>{p.unidad}</td>
                        <td style={{ textAlign:'center', padding:'9px 10px', fontFamily:'monospace', color:'#8a96ad' }}>
                          {p.metrado_presup?.toLocaleString('es-PE') ?? '—'}
                        </td>
                        <td style={{ textAlign:'center', padding:'9px 10px', fontFamily:'monospace', color:'#8a96ad' }}>
                          {p.hh_presup?.toLocaleString('es-PE') ?? '—'}
                        </td>
                        <td style={{ padding:'5px 8px', background:'rgba(245,158,11,.03)' }}>
                          <input type="number" step="0.5" min="0" placeholder="0"
                            value={f.hh} onChange={e => set(p.id, 'hh', e.target.value)}
                            style={{ width:'100%', padding:'6px 8px', textAlign:'right',
                              background:'#1c2436', color:'#e8edf5',
                              border:'1px solid #252f45', borderRadius:6,
                              fontSize:12, outline:'none', fontFamily:'monospace' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                            onBlur={e  => (e.currentTarget.style.borderColor = '#252f45')}
                          />
                        </td>
                        <td style={{ padding:'5px 8px', background:'rgba(16,185,129,.03)' }}>
                          <input type="number" step="0.01" min="0" placeholder="0"
                            value={f.cant} onChange={e => set(p.id, 'cant', e.target.value)}
                            style={{ width:'100%', padding:'6px 8px', textAlign:'right',
                              background:'#1c2436', color:'#e8edf5',
                              border:'1px solid #252f45', borderRadius:6,
                              fontSize:12, outline:'none', fontFamily:'monospace' }}
                            onFocus={e => (e.currentTarget.style.borderColor = '#10b981')}
                            onBlur={e  => (e.currentTarget.style.borderColor = '#252f45')}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {/* Totales */}
      <div className="flex gap-8 justify-end px-2 text-sm font-mono">
        <span className="text-k-text3">Total HH: <span className="font-bold text-amber-400">{totHH.toFixed(1)}</span></span>
        <span className="text-k-text3">Total Cant: <span className="font-bold text-emerald-400">{totCant.toFixed(2)}</span></span>
      </div>
    </div>
  )
}