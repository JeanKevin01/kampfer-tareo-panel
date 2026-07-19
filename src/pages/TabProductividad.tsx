// TabProductividad.tsx — Productividad física (HH/unidad) por disciplina, semana a semana
// Replica la hoja "ProductividadesXSemana" del gerente. Reusa /ev/isp (sin tocar el motor).
import { useMemo, useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { api } from '@/lib/api'

interface SemInfo { semana: number; label: string }
interface SemDato { hh_gast_acum: number; hh_gast_sem: number; cant_acum: number }
interface PartidaISP {
  partida_id: number; codigo: string; descripcion: string; fase: string | null
  unidad: string | null; hh_presup: number; metrado_presup: number; es_hoja: boolean
  semanas: Record<number, SemDato>
}

const fmt = (n: number, d = 2) =>
  isFinite(n) ? n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

// Menor HH/unidad = mejor. Se compara contra el rendimiento presupuestado.
function rendColor(prod: number, presup: number): string {
  if (!isFinite(prod) || prod <= 0 || presup <= 0) return '#4e5a72'
  const r = prod / presup
  if (r <= 1.0) return '#2DD4A8'   // igual o mejor que lo presupuestado
  if (r <= 1.15) return '#FACC15'  // hasta 15% peor
  return '#FF6B6B'                  // más de 15% peor
}

export default function TabProductividad({ semana, otm }: { semana: number; otm?: string }) {
  const [modo, setModo] = useState<'sem' | 'acum'>('sem')

  const { data, isLoading, error } = useQuery<{ semanas: SemInfo[]; partidas: PartidaISP[] }>({
    queryKey: ['ev-isp', otm],
    queryFn: () => api(`/ev/isp${otm ? `?otm=${otm}` : ''}`),
    staleTime: 2 * 60_000,
  })

  const semanas = (data?.semanas ?? []).filter(s => s.semana <= semana)
  const hojas = useMemo(
    () => (data?.partidas ?? []).filter(p => p.es_hoja && p.metrado_presup > 0 && p.hh_presup > 0),
    [data]
  )
  const porFase = useMemo(() => {
    const map: Record<string, PartidaISP[]> = {}
    hojas.forEach(p => {
      const f = (p.fase ?? '').split('.')[0] || 'SIN'
      ;(map[f] ||= []).push(p)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [hojas])

  if (isLoading) return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando productividad…</p>
  if (error) return <p className="text-k-red text-sm">Error: {(error as Error).message}</p>
  if (!hojas.length) return <p className="text-k-text3 text-sm py-8 text-center">Sin partidas con metrado y HH presupuestadas.</p>

  const prodEnSemana = (p: PartidaISP, s: number): number => {
    const d = p.semanas[s]; if (!d) return NaN
    if (modo === 'acum') return d.cant_acum > 0 ? d.hh_gast_acum / d.cant_acum : NaN
    const prev = p.semanas[s - 1]
    const cantSem = d.cant_acum - (prev?.cant_acum ?? 0)
    return cantSem > 0 ? d.hh_gast_sem / cantSem : NaN
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">Productividad por disciplina (HH / unidad)</h3>
          <p className="text-[11px] text-k-text3 mt-0.5">
            Verde = igual o mejor que lo presupuestado · Ámbar = hasta 15% peor · Rojo = &gt;15% peor. Menor HH/unidad es mejor.
          </p>
        </div>
        <div className="flex gap-1">
          {(['sem', 'acum'] as const).map(m => (
            <button key={m} onClick={() => setModo(m)}
              className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${modo === m ? 'bg-k-amber text-black border-k-amber' : 'bg-k-raised border-k-border text-k-text2 hover:border-k-border2'}`}>
              {m === 'sem' ? 'Semanal' : 'Acumulada'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b border-k-border bg-k-raised">
                <th className="py-2 px-3 text-left text-[10px] font-bold text-k-text3 uppercase" style={{ minWidth: 240 }}>Partida</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ minWidth: 60 }}>Und</th>
                <th className="py-2 px-3 text-right text-[10px] font-bold text-k-amber uppercase" style={{ minWidth: 80 }}>Presup.</th>
                {semanas.map(s => (
                  <th key={s.semana} className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ minWidth: 60 }}>S{s.semana}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porFase.map(([fase, parts]) => (
                <Fragment key={fase}>
                  <tr style={{ background: '#141926' }}>
                    <td colSpan={3 + semanas.length} className="py-1.5 px-3 text-[11px] font-bold text-k-text uppercase">{fase}</td>
                  </tr>
                  {parts.map(p => {
                    const presup = p.hh_presup / p.metrado_presup
                    return (
                      <tr key={p.partida_id} className="border-b border-k-border last:border-0">
                        <td className="py-1.5 px-3 text-k-text2" title={p.descripcion}>
                          <span className="font-mono text-[10px] text-k-text3 mr-2">{p.codigo}</span>
                          {p.descripcion.length > 34 ? p.descripcion.slice(0, 34) + '…' : p.descripcion}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-[11px] text-k-text3">{p.unidad ?? '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-[11px] text-k-amber">{fmt(presup)}</td>
                        {semanas.map(s => {
                          const v = prodEnSemana(p, s.semana)
                          return (
                            <td key={s.semana} className="py-1.5 px-3 text-right font-mono text-[11px]" style={{ color: rendColor(v, presup) }}>
                              {isFinite(v) && v > 0 ? fmt(v) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
