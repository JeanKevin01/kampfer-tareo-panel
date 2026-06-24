// TabValorizacion.tsx — Cantidad ejecutada vs valorizada (#2). Puerta a la Valorización.
// Ejecutada (del motor EV) vs Valorizada (lo que el cliente reconoce). Variación = ejec - valoriz.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'

interface ValFila {
  partida_id: number; codigo: string; fase: string | null; descripcion: string
  unidad: string | null; cantidad_ejecutada: number; cantidad_valorizada: number; variacion: number
}

const fmt = (n: number) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 2 }) : '—'

export default function TabValorizacion({ semana, otm }: { semana: number; otm?: string }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery<{ partidas: ValFila[] }>({
    queryKey: ['ev-valorizado', semana, otm],
    queryFn: async () => {
      const r = await fetch(`${API}/ev/valorizado?semana=${semana}${otm ? `&otm=${otm}` : ''}`)
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
  })

  const [draft, setDraft] = useState<Record<number, string>>({})
  useEffect(() => { setDraft({}) }, [semana, otm])

  const guardar = useMutation({
    mutationFn: async (p: { partida_id: number; cantidad_valorizada: number }) => {
      const r = await fetch(`${API}/ev/valorizado`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partida_id: p.partida_id, semana, cantidad_valorizada: p.cantidad_valorizada }),
      })
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ev-valorizado'] }),
  })

  if (isLoading) return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
  if (error) return <p className="text-k-red text-sm">Error: {(error as Error).message}</p>
  const filas = data?.partidas ?? []
  if (!filas.length) return <p className="text-k-text3 text-sm py-8 text-center">Sin partidas para valorizar.</p>

  const guardarFila = (f: ValFila) => {
    const raw = draft[f.partida_id]
    if (raw === undefined || raw === '') return
    const val = Number(raw)
    if (!isFinite(val) || val < 0 || val === f.cantidad_valorizada) return
    guardar.mutate({ partida_id: f.partida_id, cantidad_valorizada: val })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">Valorización — Sem {semana}</h3>
        <p className="text-[11px] text-k-text3 mt-0.5">
          Cantidad <strong>ejecutada</strong> (del avance) vs cantidad <strong>valorizada</strong> (lo que el cliente reconoce).
          Variación = ejecutada − valorizada (lo ejecutado aún no reconocido). Edita el valor y sal del campo para guardar.
        </p>
      </div>
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised">
                <th className="py-2 px-3 text-left text-[10px] font-bold text-k-text3 uppercase">Código</th>
                <th className="py-2 px-3 text-left text-[10px] font-bold text-k-text3 uppercase">Descripción</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">Und</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">Ejecutada</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-amber uppercase">Valorizada</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">Variación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const cur = draft[f.partida_id] ?? String(f.cantidad_valorizada)
                const varNow = f.cantidad_ejecutada - (Number(cur) || 0)
                return (
                  <tr key={f.partida_id} className="border-b border-k-border last:border-0">
                    <td className="py-1.5 px-3 font-mono text-[10px] text-k-text3">{f.codigo}</td>
                    <td className="py-1.5 px-3 text-k-text2" title={f.descripcion}>{f.descripcion.length > 40 ? f.descripcion.slice(0, 40) + '…' : f.descripcion}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-[11px] text-k-text3">{f.unidad ?? '—'}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-[11px] text-k-text">{fmt(f.cantidad_ejecutada)}</td>
                    <td className="py-1.5 px-3 text-right">
                      <input type="number" min={0} step="any" value={cur}
                        onChange={e => setDraft(d => ({ ...d, [f.partida_id]: e.target.value }))}
                        onBlur={() => guardarFila(f)}
                        className="w-24 bg-k-raised border border-k-border rounded-lg px-2 py-1 text-right text-[12px] text-k-text outline-none focus:border-k-amber" />
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[11px]" style={{ color: varNow > 0.001 ? '#FACC15' : '#2DD4A8' }}>{fmt(varNow)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {guardar.isPending && <p className="text-[11px] text-k-text3 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Guardando…</p>}
    </div>
  )
}
