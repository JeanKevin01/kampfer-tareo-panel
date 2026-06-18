import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'https://api.apps1.astraera.space'

const FASE_COLORS: Record<string, string> = {
  CIV:'#fb923c',FAB:'#818cf8',MEC:'#60a5fa',ELE:'#f59e0b',
  TUB:'#22d3ee',INS:'#a78bfa',EST:'#34d399',AND:'#4ade80',
  APY:'#94a3b8',ING:'#f472b6',MON:'#e879f9',
}

interface DiaCell {
  hh_gastadas:   number
  cant_ejecutada: number | null
  hh_ganadas:    number | null
  pf:            number | null
}

interface PartidaGrid {
  id:            number
  codigo:        string
  descripcion:   string
  fase:          string
  sub_fase:      string | null
  unidad:        string
  factor_conv:   number
  hh_presup:     number
  metrado_presup: number
  dias:          Record<string, DiaCell>
}

interface SemanaGrid {
  semana:   number
  otm:      string | null
  lunes:    string
  fechas:   string[]
  partidas: PartidaGrid[]
}

interface Props {
  semana:      number
  onSemana:    (s: number) => void
  selectedOtm: string
}

const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

export default function TabDiario({ semana, onSemana, selectedOtm }: Props) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})

  const { data, isLoading, error, refetch } = useQuery<SemanaGrid>({
    queryKey: ['semana-grid', semana, selectedOtm],
    queryFn: async () => {
      const p = new URLSearchParams({ semana: String(semana) })
      if (selectedOtm) p.set('otm', selectedOtm)
      const r = await fetch(`${API}/ev/semana-grid?${p}`)
      if (!r.ok) throw new Error('Error cargando grilla')
      return r.json()
    },
    enabled: !!selectedOtm,
    staleTime: 30_000,
  })

  const saveMut = useMutation({
    mutationFn: async (vars: { partida_id: number; fecha: string; cantidad_dia: number | null }) => {
      const r = await fetch(`${API}/ev/avance-diario`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(vars),
      })
      if (!r.ok) throw new Error()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semana-grid'] }),
  })

  const handleBlur = useCallback(async (partida_id: number, fecha: string, cellKey: string) => {
    const raw = pending[cellKey]
    if (raw === undefined) return
    const cantidad_dia = raw === '' ? null : parseFloat(raw.replace(',', '.'))
    if (raw !== '' && isNaN(cantidad_dia!)) return
    setSaving(p => ({ ...p, [cellKey]: true }))
    try { await saveMut.mutateAsync({ partida_id, fecha, cantidad_dia }) }
    catch { /* toast would go here */ }
    finally {
      setSaving(p => ({ ...p, [cellKey]: false }))
      setPending(p => { const n = { ...p }; delete n[cellKey]; return n })
    }
  }, [pending, saveMut])

  const pfColor = (pf: number | null) => {
    if (pf === null) return 'var(--k-text3)'
    if (pf >= 1)   return '#10b981'
    if (pf >= 0.8) return '#f59e0b'
    return '#ef4444'
  }

  const formatFecha = (fs: string) => {
    const d = new Date(fs + 'T12:00:00')
    return `${DIAS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}`
  }

  if (!selectedOtm) return (
    <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
      Selecciona una OTM en la pestaña de configuración para ver la vista diaria
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-k-text3">
            HH tareo automáticas · cant. ejecutada ingreso manual
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSemana(semana - 1)}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors"
          ><ChevronLeft size={16} /></button>
          <span className="text-sm font-mono font-semibold text-k-amber px-2">
            Sem {semana}
          </span>
          <button
            onClick={() => onSemana(semana + 1)}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors"
          ><ChevronRight size={16} /></button>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors"
          ><RefreshCw size={14} /></button>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
          Cargando semana {semana}…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
          Error cargando datos. Verifica que la OTM tenga partidas importadas.
        </div>
      )}

      {data && data.partidas.length === 0 && (
        <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
          Sin partidas con tareo diario en la semana {semana}.
          <br/>
          <span className="text-xs">Importa las partidas de la OTM e inicia tareo desde la app.</span>
        </div>
      )}

      {data && data.partidas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-k-border">
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 720 }}>
            <thead>
              <tr style={{ background: '#1c2436' }}>
                <th style={{
                  textAlign: 'left', padding: '10px 14px',
                  fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                  color: '#4e5a72', textTransform: 'uppercase',
                  borderBottom: '1px solid #252f45', minWidth: 220,
                  position: 'sticky', left: 0, background: '#1c2436', zIndex: 10,
                }}>Partida</th>
                {data.fechas.slice(0, 5).map(f => (
                  <th key={f} style={{
                    textAlign: 'center', padding: '10px 6px',
                    fontSize: 11, color: '#8a96ad',
                    borderBottom: '1px solid #252f45', minWidth: 90,
                  }}>{formatFecha(f)}</th>
                ))}
                <th style={{
                  textAlign: 'center', padding: '10px 6px',
                  fontSize: 10, color: '#4e5a72', letterSpacing: .8, textTransform: 'uppercase',
                  borderBottom: '1px solid #252f45', minWidth: 70,
                }}>SEM</th>
              </tr>
            </thead>
            <tbody>
              {data.partidas.map((p, pi) => {
                const color = FASE_COLORS[p.fase] || '#94a3b8'
                let totHH = 0, totCant = 0

                return (
                  <>
                    {/* Partida label row */}
                    <tr key={`h-${p.id}`} style={{ borderTop: pi > 0 ? '1px solid #1c2436' : 'none' }}>
                      <td colSpan={7} style={{ padding: '10px 14px 3px', background: '#141926' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 5,
                            background: color + '20', border: `1px solid ${color}40`,
                            fontSize: 9, fontWeight: 800, color, flexShrink: 0,
                            letterSpacing: .5,
                          }}>{p.fase}{p.sub_fase ? '.' + p.sub_fase : ''}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#e8edf5' }}>
                            {p.codigo}
                          </span>
                          <span style={{ fontSize: 11, color: '#8a96ad', flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.descripcion}
                          </span>
                          <span style={{ fontSize: 9, color: '#4e5a72', flexShrink: 0 }}>{p.unidad}</span>
                        </div>
                      </td>
                    </tr>

                    {/* HH Tareo row */}
                    <tr key={`hh-${p.id}`}>
                      <td style={{
                        padding: '3px 14px 3px 26px', fontSize: 10, color: '#4e5a72',
                        position: 'sticky', left: 0, background: '#141926', zIndex: 5,
                      }}>HH Tareo</td>
                      {data.fechas.slice(0, 5).map(f => {
                        const d = p.dias[f]
                        const hh = d?.hh_gastadas ?? 0
                        totHH += hh
                        return (
                          <td key={f} style={{
                            textAlign: 'center', padding: '3px 4px',
                            fontFamily: 'monospace', fontSize: 12,
                            color: hh > 0 ? '#f59e0b' : '#252f45',
                            fontWeight: hh > 0 ? 600 : 400,
                          }}>
                            {hh > 0 ? hh.toFixed(1) : '—'}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11,
                        color: totHH > 0 ? '#f59e0b' : '#252f45', fontWeight: 600 }}>
                        {totHH > 0 ? totHH.toFixed(1) : '—'}
                      </td>
                    </tr>

                    {/* Cant Ejecutada row (editable) */}
                    <tr key={`cant-${p.id}`}>
                      <td style={{
                        padding: '3px 14px 3px 26px', fontSize: 10, color: '#4e5a72',
                        position: 'sticky', left: 0, background: '#141926', zIndex: 5,
                      }}>Cant. Ejec. ({p.unidad})</td>
                      {data.fechas.slice(0, 5).map(f => {
                        const d     = p.dias[f]
                        const hh    = d?.hh_gastadas ?? 0
                        const cant  = d?.cant_ejecutada
                        const ck    = `${p.id}__${f}`
                        const val   = pending[ck] !== undefined ? pending[ck] : (cant != null ? String(cant) : '')
                        const saved = cant != null
                        if (cant != null && cant > 0) totCant += cant
                        return (
                          <td key={f} style={{ padding: '3px 4px' }}>
                            {hh > 0 ? (
                              <input
                                value={val}
                                onChange={e => setPending(prev => ({ ...prev, [ck]: e.target.value }))}
                                onBlur={() => handleBlur(p.id, f, ck)}
                                placeholder="—"
                                disabled={saving[ck]}
                                style={{
                                  width: '100%', textAlign: 'center',
                                  background: saved ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.04)',
                                  border: `1px solid ${saved ? 'rgba(16,185,129,.3)' : '#252f45'}`,
                                  borderRadius: 6, padding: '4px 4px',
                                  fontFamily: 'monospace', fontSize: 12,
                                  color: saved ? '#10b981' : '#8a96ad',
                                  outline: 'none', opacity: saving[ck] ? .5 : 1,
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                              />
                            ) : (
                              <span style={{ display:'block',textAlign:'center',fontSize:11,color:'#1c2436' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'center',fontFamily:'monospace',fontSize:11,
                        color: totCant > 0 ? '#10b981' : '#252f45', fontWeight:600 }}>
                        {totCant > 0 ? totCant.toFixed(2) : '—'}
                      </td>
                    </tr>

                    {/* PF row */}
                    <tr key={`pf-${p.id}`}>
                      <td style={{
                        padding: '3px 14px 7px 26px', fontSize: 10, color: '#4e5a72',
                        position: 'sticky', left: 0, background: '#141926', zIndex: 5,
                      }}>PF día</td>
                      {data.fechas.slice(0, 5).map(f => {
                        const d  = p.dias[f]
                        const pf = d?.pf ?? null
                        return (
                          <td key={f} style={{
                            textAlign: 'center', padding: '3px 4px 7px',
                            fontFamily: 'monospace', fontSize: 11,
                            color: pfColor(pf), fontWeight: pf != null ? 600 : 400,
                          }}>
                            {pf != null ? pf.toFixed(2) : '—'}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-k-text3">
        <span><span className="text-amber-400 font-semibold">HH Tareo</span> = automático del tareo diario</span>
        <span><span className="text-emerald-400 font-semibold">Cant. Ejec.</span> = ingreso manual (celdas editables)</span>
        <span>PF <span style={{color:'#10b981'}}>≥1.0</span> eficiente ·{' '}
          <span style={{color:'#f59e0b'}}>0.8–1.0</span> alerta ·{' '}
          <span style={{color:'#ef4444'}}>&lt;0.8</span> crítico</span>
      </div>
    </div>
  )
}