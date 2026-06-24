// TabSeguimiento.tsx — Informe "Partidas Relevantes" por disciplina (hoja ResPorFase)
// HH Ganadas / Gastadas y PF acumulado, semana a semana, por fase. Reusa /ev/isp.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'

interface SemInfo { semana: number; label: string }
interface SemDato { hh_gan_acum: number; hh_gast_acum: number }
interface PartidaISP { fase: string | null; es_hoja: boolean; semanas: Record<number, SemDato> }

const fmt0 = (n: number) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '—'
function pfColor(pf: number) {
  if (!isFinite(pf) || pf <= 0) return '#4e5a72'
  return pf >= 1 ? '#2DD4A8' : pf >= 0.85 ? '#FACC15' : '#FF6B6B'
}

export default function TabSeguimiento({ semana, otm }: { semana: number; otm?: string }) {
  const { data, isLoading, error } = useQuery<{ semanas: SemInfo[]; partidas: PartidaISP[] }>({
    queryKey: ['ev-isp', otm],
    queryFn: async () => {
      const r = await fetch(`${API}/ev/isp${otm ? `?otm=${otm}` : ''}`)
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
    staleTime: 2 * 60_000,
  })

  const semanas = (data?.semanas ?? []).filter(s => s.semana <= semana)
  const fases = useMemo(() => {
    const map: Record<string, Record<number, { gan: number; gast: number }>> = {}
    ;(data?.partidas ?? []).filter(p => p.es_hoja).forEach(p => {
      const f = (p.fase ?? '').split('.')[0] || 'SIN'
      const row = (map[f] ||= {})
      semanas.forEach(({ semana: s }) => {
        const d = p.semanas[s]; if (!d) return
        const acc = (row[s] ||= { gan: 0, gast: 0 })
        acc.gan += d.hh_gan_acum; acc.gast += d.hh_gast_acum
      })
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data, semana])

  if (isLoading) return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
  if (error) return <p className="text-k-red text-sm">Error: {(error as Error).message}</p>
  if (!fases.length) return <p className="text-k-text3 text-sm py-8 text-center">Sin datos por disciplina.</p>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">Seguimiento semanal por disciplina (acumulado)</h3>
        <p className="text-[11px] text-k-text3 mt-0.5">HH Ganadas vs Gastadas y PF acumulado, semana a semana, por fase.</p>
      </div>
      {fases.map(([fase, sem]) => (
        <div key={fase} className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-k-raised border-b border-k-border">
            <h4 className="text-[11px] font-bold text-k-text uppercase tracking-wider">{fase}</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b border-k-border">
                  <th className="py-1.5 px-3 text-left text-[10px] font-bold text-k-text3 uppercase" style={{ minWidth: 130 }}>Métrica</th>
                  {semanas.map(s => (
                    <th key={s.semana} className="py-1.5 px-3 text-right text-[10px] font-bold text-k-text3 uppercase" style={{ minWidth: 60 }}>S{s.semana}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-k-border">
                  <td className="py-1.5 px-3 text-k-green">HH Ganadas</td>
                  {semanas.map(s => <td key={s.semana} className="py-1.5 px-3 text-right font-mono text-[11px] text-k-green">{sem[s.semana] ? fmt0(sem[s.semana].gan) : '—'}</td>)}
                </tr>
                <tr className="border-b border-k-border">
                  <td className="py-1.5 px-3 text-k-red">HH Gastadas</td>
                  {semanas.map(s => <td key={s.semana} className="py-1.5 px-3 text-right font-mono text-[11px] text-k-red">{sem[s.semana] ? fmt0(sem[s.semana].gast) : '—'}</td>)}
                </tr>
                <tr>
                  <td className="py-1.5 px-3 text-k-text2">PF acum</td>
                  {semanas.map(s => {
                    const d = sem[s.semana]
                    const pf = d && d.gast > 0 ? d.gan / d.gast : NaN
                    return <td key={s.semana} className="py-1.5 px-3 text-right font-mono text-[12px] font-bold" style={{ color: pfColor(pf) }}>{isFinite(pf) ? pf.toFixed(2) : '—'}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
