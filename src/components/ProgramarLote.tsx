// Programar por partidas (flujo LookAhead pedido por Jean 2026-07-11):
// 1) eliges la OTM → 2) ves el árbol del presupuesto (como Valor Ganado ·
// Partidas) y marcas una o VARIAS partidas → 3) a cada una le pones F.Inic,
// F.Fin (opcional) y el metrado meta (prellenado con el del presupuesto).
// El API crea una actividad por partida y prorratea el metrado entre los días.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, ChevronRight, Search } from 'lucide-react'
import { api } from '@/lib/api'

const PROYECTO_ID = 1
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'

interface PartidaEV {
  id: number; codigo: string; descripcion?: string | null
  nivel?: number | null; fase?: string | null
  unidad?: string | null; metrado_presup?: number | string | null; hh_presup?: number | string | null
}
interface ItemSel { fecha: string; fecha_fin: string; metrado: string }

const numV = (v: number | string | null | undefined) => {
  const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null
}

export function ProgramarLote({ fechaBase, onClose, onCreado, onLibre }: {
  fechaBase: string
  onClose: () => void
  onCreado: () => void
  onLibre: () => void          // abre el formulario clásico (actividad sin partida)
}) {
  const qc = useQueryClient()
  const [otm, setOtm] = useState('')
  const [filtro, setFiltro] = useState('')
  const [sel, setSel] = useState<Map<number, ItemSel>>(new Map())
  const [paso, setPaso] = useState<1 | 2>(1)
  const [comun, setComun] = useState({ supervisor_id: '', responsable: '', descripcion: '' })
  const [error, setError] = useState('')

  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'], queryFn: () => api('/ev/otms'),
  })
  const sups = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores-lista'], queryFn: () => api('/api/supervisores'),
  })
  const partidas = useQuery<PartidaEV[]>({
    queryKey: ['partidas-otm', otm],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(otm)}`),
    enabled: !!otm,
  })

  const visibles = useMemo(() => {
    const lista = partidas.data ?? []
    const q = filtro.trim().toLowerCase()
    if (!q) return lista
    return lista.filter(p => p.codigo.toLowerCase().includes(q) || (p.descripcion ?? '').toLowerCase().includes(q))
  }, [partidas.data, filtro])

  const toggle = (p: PartidaEV) => {
    const m = new Map(sel)
    if (m.has(p.id)) m.delete(p.id)
    else m.set(p.id, { fecha: fechaBase, fecha_fin: '', metrado: numV(p.metrado_presup) != null ? String(numV(p.metrado_presup)) : '' })
    setSel(m)
  }
  const setItem = (id: number, patch: Partial<ItemSel>) => {
    const m = new Map(sel); m.set(id, { ...m.get(id)!, ...patch }); setSel(m)
  }
  const porId = new Map((partidas.data ?? []).map(p => [p.id, p]))

  const crear = useMutation({
    mutationFn: () => api('/ev/programacion/actividades-lote', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: PROYECTO_ID, otm_id: otm,
        supervisor_id: comun.supervisor_id || null,
        responsable: comun.responsable || null,
        descripcion: comun.descripcion || null,
        items: [...sel.entries()].map(([partida_id, it]) => ({
          partida_id, fecha: it.fecha, fecha_fin: it.fecha_fin || null,
          metrado_prog: it.metrado.trim() === '' ? null : Number(it.metrado),
        })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lookahead-grid'] })
      qc.invalidateQueries({ queryKey: ['programacion'] })
      qc.invalidateQueries({ queryKey: ['lookahead'] })
      qc.invalidateQueries({ queryKey: ['ppc'] })
      onCreado()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[860px] max-w-[96vw] max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-k-text">Programar por partidas <span className="text-k-text3 font-normal text-xs">(LookAhead)</span></h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-k-text3 mb-3">
          Marca las partidas del presupuesto que se trabajarán; el metrado meta se prellena con el del
          presupuesto y se prorratea solo entre F.Inicio y F.Fin.{' '}
          <button onClick={onLibre} className="text-k-amber underline">¿Actividad libre sin partida?</button>
        </p>

        {/* Paso 1: OTM + árbol de partidas */}
        {paso === 1 && <>
          <div className="flex gap-2 mb-2">
            <select value={otm} onChange={e => { setOtm(e.target.value); setSel(new Map()) }} className={inputCls}
              title={(otms.data ?? []).find(o => o.otm_id === otm)?.descripcion || 'OTM'}>
              <option value="">Elige la OTM…</option>
              {(otms.data ?? []).map(o => (
                <option key={o.otm_id} value={o.otm_id}>
                  {o.otm_id}{o.descripcion ? ` — ${o.descripcion.slice(0, 52)}${o.descripcion.length > 52 ? '…' : ''}` : ''}
                </option>
              ))}
            </select>
            {otm && (
              <div className="relative w-56 flex-shrink-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-k-text3" />
                <input placeholder="Filtrar partidas…" value={filtro} onChange={e => setFiltro(e.target.value)}
                  className={`${inputCls} pl-8`} />
              </div>
            )}
          </div>

          {otm && (
            <div className="rounded-lg border border-k-border overflow-auto max-h-[46vh]">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-k-raised z-10">
                  <tr className="text-[10px] uppercase text-k-text3">
                    <th className="w-8"></th>
                    <th className="text-left px-2 py-1.5">Código</th>
                    <th className="text-left px-2 py-1.5">Descripción</th>
                    <th className="text-right px-2 py-1.5">Metrado</th>
                    <th className="text-left px-2 py-1.5">Und</th>
                    <th className="text-right px-2 py-1.5">HH plan</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(p => {
                    const hoja = p.fase != null
                    const nivel = Number(p.nivel ?? 1)
                    return (
                      <tr key={p.id}
                        onClick={hoja ? () => toggle(p) : undefined}
                        className={`border-t border-k-border/40 ${hoja ? 'cursor-pointer hover:bg-k-raised/60' : 'bg-k-raised/30'} ${sel.has(p.id) ? 'bg-amber-500/10' : ''}`}>
                        <td className="text-center">
                          {hoja && <input type="checkbox" readOnly checked={sel.has(p.id)} className="accent-amber-500 pointer-events-none" />}
                        </td>
                        <td className={`px-2 py-1 font-mono ${hoja ? 'text-k-text2' : 'text-k-amber font-bold'}`}
                          style={{ paddingLeft: 8 + (nivel - 1) * 14 }}>{p.codigo}</td>
                        <td className={`px-2 py-1 ${hoja ? 'text-k-text' : 'text-k-amber font-bold uppercase'}`}>{p.descripcion}</td>
                        <td className="px-2 py-1 text-right font-mono text-k-text2">{numV(p.metrado_presup) ?? ''}</td>
                        <td className="px-2 py-1 text-k-text3">{hoja ? p.unidad ?? '' : ''}</td>
                        <td className="px-2 py-1 text-right font-mono text-k-text3">{numV(p.hh_presup) ?? ''}</td>
                      </tr>
                    )
                  })}
                  {otm && visibles.length === 0 && !partidas.isLoading && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-k-text3">Sin partidas (¿importaste el presupuesto de esta OTM?)</td></tr>
                  )}
                </tbody>
              </table>
              {partidas.isLoading && <p className="text-center py-4 text-k-text3 text-xs"><Loader2 size={14} className="animate-spin inline" /> Cargando partidas…</p>}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-k-text2">{sel.size} partida{sel.size !== 1 ? 's' : ''} seleccionada{sel.size !== 1 ? 's' : ''}</span>
            <button onClick={() => setPaso(2)} disabled={sel.size === 0}
              className="flex items-center gap-1 bg-k-amber text-black font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-40">
              Fechas y metrados <ChevronRight size={14} />
            </button>
          </div>
        </>}

        {/* Paso 2: fechas + metrado meta por partida y datos comunes */}
        {paso === 2 && <>
          <div className="rounded-lg border border-k-border overflow-auto max-h-[40vh] mb-3">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-k-raised z-10">
                <tr className="text-[10px] uppercase text-k-text3">
                  <th className="text-left px-2 py-1.5">Partida</th>
                  <th className="text-left px-2 py-1.5">F. Inicio</th>
                  <th className="text-left px-2 py-1.5">F. Fin (opc.)</th>
                  <th className="text-left px-2 py-1.5">Metrado meta</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {[...sel.entries()].map(([id, it]) => {
                  const p = porId.get(id)
                  return (
                    <tr key={id} className="border-t border-k-border/40">
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-k-text2">{p?.codigo}</div>
                        <div className="text-k-text leading-tight">{p?.descripcion}</div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={it.fecha} onChange={e => setItem(id, { fecha: e.target.value })} className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={it.fecha_fin} min={it.fecha}
                          onChange={e => setItem(id, { fecha_fin: e.target.value })} className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <input value={it.metrado} inputMode="decimal" placeholder={numV(p?.metrado_presup) != null ? String(numV(p?.metrado_presup)) : '—'}
                            onChange={e => setItem(id, { metrado: e.target.value })} className={inputCls} style={{ width: 90 }} />
                          <span className="text-k-text3">{p?.unidad ?? ''}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <button onClick={() => { const m = new Map(sel); m.delete(id); setSel(m); if (m.size === 0) setPaso(1) }}
                          className="text-k-text3 hover:text-k-red"><X size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={comun.supervisor_id} onChange={e => setComun({ ...comun, supervisor_id: e.target.value })}
              className={inputCls} title="Supervisor asignado (les aparecerá a todas)">
              <option value="">Sin supervisor asignado</option>
              {(sups.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <input placeholder="Responsable / cuadrilla" value={comun.responsable}
              onChange={e => setComun({ ...comun, responsable: e.target.value })} className={inputCls} />
          </div>
          <textarea placeholder="Descripción común (opcional)" value={comun.descripcion} rows={2}
            onChange={e => setComun({ ...comun, descripcion: e.target.value })} className={`${inputCls} mb-2`} />
          {error && <p className="text-k-red text-xs mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setPaso(1)} className="text-sm px-4 py-2.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised">← Partidas</button>
            <button onClick={() => crear.mutate()} disabled={crear.isPending || [...sel.values()].some(it => !it.fecha)}
              className="flex-1 bg-k-amber text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
              {crear.isPending ? 'Programando…' : `Programar ${sel.size} actividad${sel.size !== 1 ? 'es' : ''}`}
            </button>
          </div>
        </>}
      </div>
    </div>
  )
}
