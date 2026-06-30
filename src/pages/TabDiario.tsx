import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ClipboardEdit, Check, AlertTriangle } from 'lucide-react'
import { buildWbsTree, flattenVisible, nivelStyle, faseColor } from '@/lib/wbs'

import { API_BASE } from '@/lib/api'
const API = API_BASE

/* ── Types ────────────────────────────────────────────── */
interface DiaCell {
  hh_gastadas:    number
  hh_estimada:    number   // fallback proporcional de registros históricos
  cant_ejecutada: number | null
  hh_ganadas:     number | null
  pf:             number | null
}

interface PartidaGrid {
  id:             number
  codigo:         string
  descripcion:    string
  fase:           string
  sub_fase:       string | null
  nivel:          number
  parent_codigo:  string | null
  unidad:         string
  factor_conv:    number
  hh_presup:      number
  metrado_presup: number
  dias:           Record<string, DiaCell>
}

interface GrupoGrid {
  codigo:         string
  descripcion:    string
  nivel:          number
  parent_codigo:  string | null
}

interface SemanaGrid {
  semana:   number
  otm:      string | null
  lunes:    string
  fechas:   string[]
  grupos?:  GrupoGrid[]
  partidas: PartidaGrid[]
}

interface Props {
  semana:      number
  lunes?:      string     // ISO date del lunes — opcional; si falta, el backend lo deriva de la semana
  onSemana:    (s: number) => void
  selectedOtm: string
}

const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const fmtDia = (fs: string) => {
  const d = new Date(fs + 'T12:00:00')
  const dow = d.getDay()
  return `${DIAS[dow === 0 ? 6 : dow - 1]} ${d.getDate()}`
}

const pfColor = (pf: number | null) => {
  if (pf == null) return 'var(--k-text3)'
  return pf >= 1 ? '#10b981' : pf >= 0.8 ? '#f59e0b' : '#ef4444'
}

/* ── Estilos inline reutilizables ─────────────────────── */
const TH = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '9px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700,
  letterSpacing: 1.1, textTransform: 'uppercase', color: '#4e5a72',
  borderBottom: '1px solid #252f45', ...extra,
})
const TD_FIXED: React.CSSProperties = {
  position: 'sticky', left: 0, background: '#141926', zIndex: 5,
  padding: '3px 14px 3px 26px', fontSize: 10, color: '#4e5a72',
}

/* ═══════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function TabDiario({ semana, lunes, onSemana, selectedOtm }: Props) {
  const qc = useQueryClient()

  // ── estado celdas ──────────────────────────────────────
  const [pending,  setPending]  = useState<Record<string, string>>({})
  const [saving,   setSaving]   = useState<Record<string, boolean>>({})
  const [savedAt,  setSavedAt]  = useState<Record<string, Date>>({})

  // ── árbol jerárquico (colapsar grupos) ─────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // ── modal edición masiva ───────────────────────────────
  const [bulkOpen,   setBulkOpen]   = useState(false)
  const [bulkFecha,  setBulkFecha]  = useState('')
  const [bulkVals,   setBulkVals]   = useState<Record<number, string>>({})
  const [bulkSaving, setBulkSaving] = useState(false)

  // ── toast ──────────────────────────────────────────────
  const [toast,    setToast]  = useState<{msg: string; ok: boolean} | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  /* ── Query ──────────────────────────────────────────── */
  const { data, isLoading, error, refetch } = useQuery<SemanaGrid>({
    queryKey: ['semana-grid', semana, selectedOtm, lunes],
    queryFn: async () => {
      const p = new URLSearchParams({ semana: String(semana) })
      if (selectedOtm) p.set('otm', selectedOtm)
      if (lunes)       p.set('lunes', lunes)
      const r = await fetch(`${API}/ev/semana-grid?${p}`)
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${r.status}`)
      }
      return r.json()
    },
    enabled:    !!selectedOtm,
    staleTime:  30_000,
    retry: 1,
  })

  /* ── Guardar celda ──────────────────────────────────── */
  const saveMut = useMutation({
    mutationFn: async (v: { partida_id: number; fecha: string; cantidad_dia: number | null }) => {
      const r = await fetch(`${API}/ev/avance-diario`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(v),
      })
      if (!r.ok) throw new Error('Error guardando')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semana-grid'] }),
  })

  const handleBlur = useCallback(async (partida_id: number, fecha: string, ck: string) => {
    const raw = pending[ck]
    if (raw === undefined) return
    const cantidad_dia = raw === '' ? null : parseFloat(raw.replace(',', '.'))
    if (raw !== '' && isNaN(cantidad_dia!)) return
    setSaving(p => ({ ...p, [ck]: true }))
    try {
      await saveMut.mutateAsync({ partida_id, fecha, cantidad_dia })
      setSavedAt(p => ({ ...p, [ck]: new Date() }))
    } catch {
      showToast('Error guardando — reintenta', false)
    } finally {
      setSaving(p => ({ ...p, [ck]: false }))
      setPending(p => { const n = { ...p }; delete n[ck]; return n })
    }
  }, [pending, saveMut])

  /* ── Edición masiva ─────────────────────────────────── */
  const openBulk = (fecha: string) => {
    setBulkFecha(fecha)
    const init: Record<number, string> = {}
    if (data) data.partidas.forEach(p => {
      const d = p.dias[fecha]
      if (d?.hh_gastadas > 0 || d?.hh_estimada > 0)
        init[p.id] = d?.cant_ejecutada != null ? String(d.cant_ejecutada) : ''
    })
    setBulkVals(init)
    setBulkOpen(true)
  }

  const saveBulk = async () => {
    setBulkSaving(true)
    try {
      const promises = Object.entries(bulkVals).map(([pid, raw]) => {
        const cant = raw === '' ? null : parseFloat(raw.replace(',', '.'))
        return fetch(`${API}/ev/avance-diario`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ partida_id: Number(pid), fecha: bulkFecha, cantidad_dia: isNaN(cant!) ? null : cant }),
        })
      })
      await Promise.all(promises)
      qc.invalidateQueries({ queryKey: ['semana-grid'] })
      setBulkOpen(false)
      showToast(`✓ ${Object.keys(bulkVals).length} cantidades guardadas`)
    } catch {
      showToast('Error guardando — reintenta', false)
    } finally {
      setBulkSaving(false)
    }
  }

  /* ── Relative time ──────────────────────────────────── */
  const fmtAgo = (d: Date) => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000)
    return mins < 1 ? 'ahora' : `hace ${mins}m`
  }

  /* ── Render ─────────────────────────────────────────── */
  if (!selectedOtm) return (
    <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
      Selecciona una OTM en el selector para ver el control diario
    </div>
  )

  // Semana completa: Lunes a Domingo (7 días).
  const fechas = data?.fechas ?? []
  const diasActivos = fechas

  // Árbol jerárquico: grupos (padres) + partidas (hojas con captura diaria)
  const items = data
    ? [
        ...(data.grupos ?? []).map(g => ({ ...g, kind: 'grupo' as const })),
        ...data.partidas.map(p => ({ ...p, kind: 'hoja' as const })),
      ]
    : []
  const tree = buildWbsTree(items)
  const visibles = flattenVisible(tree, collapsed)
  const padres = new Set((data?.grupos ?? []).map(g => g.codigo))
  const toggle = (c: string) => setCollapsed(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onSemana(semana - 1)}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-mono font-semibold text-k-amber min-w-[56px] text-center">
            Sem {semana}
          </span>
          <button onClick={() => onSemana(semana + 1)}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => refetch()}
            className="p-1.5 rounded-lg border border-k-border hover:bg-k-raised transition-colors ml-1">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setCollapsed(new Set())}
            className="text-[11px] text-k-text3 border border-k-border rounded-lg px-2.5 py-1.5 hover:text-k-text transition-colors ml-1">Expandir</button>
          <button onClick={() => setCollapsed(new Set(padres))}
            className="text-[11px] text-k-text3 border border-k-border rounded-lg px-2.5 py-1.5 hover:text-k-text transition-colors">Colapsar</button>
        </div>

        {data && lunes && (
          <span className="text-xs text-k-text3">
            {new Date(lunes + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'short' })}
            {' – '}
            {new Date(data.fechas[6] + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'short' })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-k-text3"
            title="El tareo capturado por partida alimenta el ISP y el árbol automáticamente (Fase 1).">
            <Check size={12} className="text-emerald-400" /> Tareo → ISP automático
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{(error as Error).message}</p>
            <p className="text-xs mt-1 text-red-400/70">
              Verifica: OTM tiene partidas importadas · Fecha base configurada · Backend desplegado
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data && data.partidas.length === 0 && (
        <div className="rounded-xl border border-k-border p-8 text-center text-k-text3 text-sm">
          Sin partidas para {selectedOtm} en semana {semana}.
          <br/><span className="text-xs">Importa las partidas desde el tab "Importar".</span>
        </div>
      )}

      {/* Grid */}
      {data && data.partidas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-k-border">
          <table style={{ borderCollapse:'separate', borderSpacing:0, width:'100%', minWidth:740 }}>
            <thead>
              <tr style={{ background:'#1c2436' }}>
                <th style={TH({ textAlign:'left', paddingLeft:14, minWidth:220, position:'sticky', left:0, background:'#1c2436', zIndex:10 })}>
                  Partida
                </th>
                {diasActivos.map(f => (
                  <th key={f} style={TH({ minWidth:95 })}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                      <span>{fmtDia(f)}</span>
                      <button
                        onClick={() => openBulk(f)}
                        title="Llenar todas las cantidades del día"
                        style={{ background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.25)',
                          borderRadius:5, padding:'1px 6px', cursor:'pointer', color:'#f59e0b',
                          fontSize:9, display:'flex', alignItems:'center', gap:3 }}>
                        <ClipboardEdit size={8} /> llenar
                      </button>
                    </div>
                  </th>
                ))}
                <th style={TH({ minWidth:72 })}>Sem</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(node => {
                // ── Nodo de agrupación (padre) ──
                if (node.item.kind === 'grupo') {
                  const g = node.item
                  const st = nivelStyle(node.nivel, false, null)
                  const gIndent = (node.nivel - 1) * 14
                  return (
                    <tr key={`g-${g.codigo}`} style={{ background: st.bg, borderLeft: `3px solid ${st.border}`, borderTop: '1px solid #1a2133' }}>
                      <td colSpan={diasActivos.length + 2} style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: gIndent }}>
                          <button onClick={() => toggle(g.codigo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: st.text, display: 'flex', padding: 0 }}>
                            {collapsed.has(g.codigo) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: st.bold ? 700 : 600, color: st.text }}>{g.codigo}</span>
                          <span style={{ fontSize: 11, fontStyle: 'italic', color: st.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.descripcion}>{g.descripcion}</span>
                        </div>
                      </td>
                    </tr>
                  )
                }

                // ── Hoja (partida con captura diaria) ──
                const p = node.item
                const clr = faseColor(p.fase)
                const indent = (node.nivel - 1) * 14
                let totHH = 0, totEst = 0, totCant = 0

                return (
                  <>
                    {/* ── Label row ── */}
                    <tr key={`h-${p.id}`} style={{ borderTop: '1px solid #1a2133', borderLeft:`3px solid ${clr}` }}>
                      <td colSpan={diasActivos.length + 2} style={{ padding:'10px 14px 3px', background:`linear-gradient(90deg, ${clr}14, #141926 40%)` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:indent }}>
                          <span style={{ padding:'2px 7px', borderRadius:5, fontSize:9, fontWeight:800,
                            background:clr+'20', border:`1px solid ${clr}40`, color:clr, flexShrink:0 }}>
                            {p.fase}{p.sub_fase ? '.' + p.sub_fase : ''}
                          </span>
                          <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:600, color:'#e8edf5' }}>
                            {p.codigo}
                          </span>
                          <span style={{ fontSize:11, color:'#8a96ad', flex:1, minWidth:0,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {p.descripcion}
                          </span>
                          <span style={{ fontSize:9, color:'#4e5a72', flexShrink:0 }}>{p.unidad}</span>
                        </div>
                      </td>
                    </tr>

                    {/* ── HH Tareo row ── */}
                    <tr key={`hh-${p.id}`}>
                      <td style={TD_FIXED}>HH Tareo</td>
                      {diasActivos.map(f => {
                        const d    = p.dias[f]
                        const hh   = d?.hh_gastadas ?? 0
                        const est  = d?.hh_estimada ?? 0
                        totHH += hh; totEst += hh > 0 ? 0 : est
                        const showVal = hh > 0 ? hh : est
                        const isEst   = hh === 0 && est > 0
                        return (
                          <td key={f} style={{ textAlign:'center', padding:'3px 4px',
                            fontFamily:'monospace', fontSize:12,
                            color: isEst ? '#8a96ad' : hh > 0 ? '#f59e0b' : '#252f45',
                            fontWeight: showVal > 0 ? 600 : 400 }}>
                            {showVal > 0 ? (
                              <span title={isEst ? 'Estimado (tareo histórico)' : 'Tareo directo por partida'}
                                style={{ borderBottom: isEst ? '1px dashed #4e5a72' : 'none', cursor: isEst ? 'help' : 'default' }}>
                                {showVal.toFixed(1)}
                                {isEst && <span style={{ fontSize:8, color:'#4e5a72', marginLeft:2 }}>~</span>}
                              </span>
                            ) : '—'}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, fontWeight:600,
                        color: totHH > 0 ? '#f59e0b' : totEst > 0 ? '#4e5a72' : '#252f45' }}>
                        {totHH > 0 ? totHH.toFixed(1) : totEst > 0 ? `~${totEst.toFixed(1)}` : '—'}
                      </td>
                    </tr>

                    {/* ── Cant. Ejecutada row (editable) ── */}
                    <tr key={`cant-${p.id}`}>
                      <td style={TD_FIXED}>Cant ({p.unidad})</td>
                      {diasActivos.map(f => {
                        const d    = p.dias[f]
                        const hh   = (d?.hh_gastadas ?? 0) + (d?.hh_estimada ?? 0)
                        const cant = d?.cant_ejecutada
                        const ck   = `${p.id}__${f}`
                        const val  = pending[ck] !== undefined ? pending[ck]
                                   : (cant != null ? String(cant) : '')
                        const saved = cant != null
                        if (cant != null && cant > 0) totCant += cant
                        return (
                          <td key={f} style={{ padding:'3px 4px' }}>
                            {hh > 0 ? (
                              <div style={{ position:'relative' }}>
                                <input
                                  value={val}
                                  onChange={e => setPending(prev => ({ ...prev, [ck]: e.target.value }))}
                                  onBlur={() => handleBlur(p.id, f, ck)}
                                  placeholder="—"
                                  disabled={saving[ck]}
                                  style={{
                                    width:'100%', textAlign:'center',
                                    background: saved ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.04)',
                                    border:`1px solid ${saved ? 'rgba(16,185,129,.3)' : '#252f45'}`,
                                    borderRadius:6, padding:'4px 4px',
                                    fontFamily:'monospace', fontSize:12,
                                    color: saved ? '#10b981' : '#8a96ad',
                                    outline:'none', opacity: saving[ck] ? .5 : 1,
                                  }}
                                  onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                                  onBlurCapture={e => {
                                    if (!saving[ck]) e.currentTarget.style.borderColor = saved ? 'rgba(16,185,129,.3)' : '#252f45'
                                  }}
                                />
                                {/* Save indicator */}
                                {saving[ck] && (
                                  <span style={{ position:'absolute', right:3, top:'50%', transform:'translateY(-50%)',
                                    fontSize:8, color:'#4e5a72' }}>⟳</span>
                                )}
                                {savedAt[ck] && !saving[ck] && pending[ck] === undefined && (
                                  <span title={`Guardado ${fmtAgo(savedAt[ck])}`}
                                    style={{ position:'absolute', right:3, top:'50%', transform:'translateY(-50%)',
                                      fontSize:9, color:'#10b981' }}>
                                    <Check size={9} />
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ display:'block', textAlign:'center', fontSize:11, color:'#1c2436' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, fontWeight:600,
                        color: totCant > 0 ? '#10b981' : '#252f45' }}>
                        {totCant > 0 ? totCant.toFixed(2) : '—'}
                      </td>
                    </tr>

                    {/* ── PF row ── */}
                    <tr key={`pf-${p.id}`}>
                      <td style={{ ...TD_FIXED, paddingBottom:7 }}>PF día</td>
                      {diasActivos.map(f => {
                        const pf = p.dias[f]?.pf ?? null
                        return (
                          <td key={f} style={{ textAlign:'center', padding:'3px 4px 7px',
                            fontFamily:'monospace', fontSize:11,
                            color: pfColor(pf), fontWeight: pf != null ? 600 : 400 }}>
                            {pf != null ? pf.toFixed(2) : '—'}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </>
                )
              })}

              {/* ── Fila de totales diarios ── */}
              {data.partidas.length > 1 && (() => {
                const totalesDia: Record<string, { hh: number; est: number; cant: number; n_pf: number; sum_pf: number }> = {}
                diasActivos.forEach(f => {
                  totalesDia[f] = { hh:0, est:0, cant:0, n_pf:0, sum_pf:0 }
                  data.partidas.forEach(p => {
                    const d = p.dias[f]
                    if (!d) return
                    totalesDia[f].hh    += d.hh_gastadas
                    totalesDia[f].est   += d.hh_estimada
                    if (d.cant_ejecutada != null) totalesDia[f].cant += d.cant_ejecutada
                    if (d.pf != null) { totalesDia[f].n_pf++; totalesDia[f].sum_pf += d.pf }
                  })
                })
                const totHH_sem  = diasActivos.reduce((s, f) => s + totalesDia[f].hh, 0)
                const totEst_sem = diasActivos.reduce((s, f) => s + (totalesDia[f].hh > 0 ? 0 : totalesDia[f].est), 0)
                return (
                  <>
                    <tr style={{ borderTop:'2px solid #252f45', background:'rgba(245,158,11,.04)' }}>
                      <td style={{ ...TD_FIXED, color:'#f59e0b', fontWeight:700, paddingTop:8 }}>
                        TOTAL HH DÍA
                      </td>
                      {diasActivos.map(f => {
                        const { hh, est } = totalesDia[f]
                        const show   = hh > 0 ? hh : est
                        const isEst  = hh === 0 && est > 0
                        return (
                          <td key={f} style={{ textAlign:'center', paddingTop:8,
                            fontFamily:'monospace', fontSize:12, fontWeight:700,
                            color: isEst ? '#4e5a72' : show > 0 ? '#f59e0b' : '#252f45' }}>
                            {show > 0 ? (isEst ? `~${show.toFixed(1)}` : show.toFixed(1)) : '—'}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:12, fontWeight:700,
                        color: totHH_sem > 0 ? '#f59e0b' : '#4e5a72', paddingTop:8 }}>
                        {totHH_sem > 0 ? totHH_sem.toFixed(1)
                         : totEst_sem > 0 ? `~${totEst_sem.toFixed(1)}`
                         : '—'}
                      </td>
                    </tr>
                    <tr style={{ background:'rgba(245,158,11,.04)' }}>
                      <td style={{ ...TD_FIXED, color:'#4e5a72', paddingBottom:8 }}>PF promedio día</td>
                      {diasActivos.map(f => {
                        const { n_pf, sum_pf } = totalesDia[f]
                        const pf_prom = n_pf > 0 ? sum_pf / n_pf : null
                        return (
                          <td key={f} style={{ textAlign:'center', paddingBottom:8,
                            fontFamily:'monospace', fontSize:11, fontWeight:600,
                            color: pfColor(pf_prom) }}>
                            {pf_prom != null ? pf_prom.toFixed(2) : '—'}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      {data && data.partidas.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-k-text3">
          <span><span className="text-amber-400 font-semibold">HH sólido</span> = tareo exacto por partida (app nueva)</span>
          <span><span style={{color:'#4e5a72'}} className="font-semibold">~HH punteado</span> = estimado del tareo histórico</span>
          <span><span className="text-emerald-400 font-semibold">Cant</span> = ingreso manual · clic en "llenar" para edición masiva por día</span>
          <span>PF <span style={{color:'#10b981'}}>≥1.0</span> eficiente · <span style={{color:'#f59e0b'}}>0.8-1.0</span> alerta · <span style={{color:'#ef4444'}}>&lt;0.8</span> crítico</span>
        </div>
      )}

      {/* ── MODAL edición masiva ─────────────────────────── */}
      {bulkOpen && data && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:9998,
          display:'flex', alignItems:'flex-end', justifyContent:'center',
          backdropFilter:'blur(4px)',
        }} onClick={e => e.target === e.currentTarget && setBulkOpen(false)}>
          <div style={{
            background:'#141926', border:'1px solid #2e3a52',
            borderRadius:'20px 20px 0 0', padding:'20px 16px 32px',
            width:'100%', maxWidth:560, maxHeight:'80vh', overflowY:'auto',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:'var(--font-condensed,sans-serif)', fontSize:16, fontWeight:800, color:'#e8edf5' }}>
                  Llenar cantidades
                </div>
                <div style={{ fontSize:12, color:'#8a96ad', marginTop:2 }}>
                  {fmtDia(bulkFecha)} · {selectedOtm}
                </div>
              </div>
              <button onClick={() => setBulkOpen(false)}
                style={{ background:'none', border:'none', color:'#4e5a72', fontSize:20, cursor:'pointer' }}>
                ✕
              </button>
            </div>

            {data.partidas
              .filter(p => {
                const d = p.dias[bulkFecha]
                return (d?.hh_gastadas ?? 0) > 0 || (d?.hh_estimada ?? 0) > 0
              })
              .map(p => (
                <div key={p.id} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'9px 0', borderBottom:'1px solid #1c2436',
                }}>
                  <span style={{ fontFamily:'monospace', fontSize:10, color:'#f59e0b', minWidth:80, flexShrink:0 }}>
                    {p.codigo}
                  </span>
                  <span style={{ fontSize:11, color:'#8a96ad', flex:1, minWidth:0,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.descripcion}
                  </span>
                  <span style={{ fontSize:10, color:'#4e5a72', flexShrink:0, minWidth:28 }}>{p.unidad}</span>
                  <input
                    value={bulkVals[p.id] ?? ''}
                    onChange={e => setBulkVals(prev => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="0"
                    style={{
                      width:72, flexShrink:0, background:'#1c2436',
                      border:'1px solid #2e3a52', borderRadius:7,
                      padding:'7px 8px', fontFamily:'monospace', fontSize:13,
                      color:'#e8edf5', textAlign:'center', outline:'none',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                  />
                </div>
              ))
            }

            <div style={{ marginTop:18, display:'flex', gap:10 }}>
              <button onClick={saveBulk} disabled={bulkSaving}
                style={{
                  flex:1, padding:'14px', borderRadius:9, border:'none',
                  background: bulkSaving ? '#1c2436' : '#f59e0b', color: bulkSaving ? '#4e5a72' : '#000',
                  fontSize:13, fontWeight:700, textTransform:'uppercase', cursor: bulkSaving ? 'default' : 'pointer',
                }}>
                {bulkSaving ? 'Guardando...' : '💾 Guardar todo'}
              </button>
              <button onClick={() => setBulkOpen(false)}
                style={{
                  padding:'14px 20px', borderRadius:9, border:'1px solid #252f45',
                  background:'transparent', color:'#8a96ad', fontSize:13, fontWeight:600,
                  cursor:'pointer',
                }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          padding:'10px 18px', borderRadius:9, zIndex:9999,
          background: toast.ok ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
          border: `1px solid ${toast.ok ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
          color: toast.ok ? '#10b981' : '#ef4444',
          fontSize:13, fontWeight:600, whiteSpace:'nowrap', backdropFilter:'blur(8px)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}