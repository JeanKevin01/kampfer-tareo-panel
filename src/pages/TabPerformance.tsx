// Tab «Performance» del Valor Ganado — historial semanal ACUMULADO tipo
// plantilla ISP del ex-gerente: avance %, HH ganadas/gastadas, PF,
// instalado, EAC y desvío. 100% auto-alimentado del motor EV (que a su vez
// se alimenta del avance diario vía rollup): no se llena ni se guarda nada.
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface PuntoPerf {
  semana: number; pct_acum: number | null
  hh_ganadas_sem: number; hh_ganadas_acum: number
  hh_gastadas_sem: number; hh_gastadas_acum: number
  pf_sem: number | null; pf_acum: number | null
  cant_instalada: number; eac_hh: number; desvio_hh: number
}
interface PerfResp { hasta: number; otm?: string | null; hh_presup_total: number; serie: PuntoPerf[] }

const fmt = (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 1 })
const clrPf = (pf: number | null) =>
  pf == null ? 'text-k-text3' : pf >= 1 ? 'text-k-green' : pf >= 0.8 ? 'text-amber-300' : 'text-k-red'

export default function TabPerformance({ semana, otm }: { semana: number; otm?: string }) {
  const { data, isLoading, error } = useQuery<PerfResp>({
    queryKey: ['ev-performance', semana, otm],
    queryFn: () => api(`/ev/performance?hasta=${semana}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
  })

  if (isLoading) return <div className="flex items-center gap-2 text-k-text3 p-6"><Loader2 size={16} className="animate-spin" /> Calculando historial…</div>
  if (error) return <div className="text-k-red text-sm p-6">{(error as Error).message}</div>
  const serie = data?.serie ?? []
  if (!serie.length) return <div className="text-k-text3 text-sm p-6">Aún no hay datos: registra avances diarios o HH y esta tabla se llena sola.</div>

  const th = 'border border-k-border px-2 py-1.5 text-[10px] font-bold text-k-text2 bg-k-raised whitespace-nowrap'
  const td = 'border border-k-border/60 px-2 py-1 text-[11px] font-mono text-right'
  const ult = serie[serie.length - 1]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {[
          { l: '% Avance', v: ult.pct_acum != null ? `${(ult.pct_acum * 100).toFixed(1)}%` : '—', c: 'text-k-amber' },
          { l: 'PF acum', v: ult.pf_acum != null ? ult.pf_acum.toFixed(3) : '—', c: clrPf(ult.pf_acum) },
          { l: 'HH ganadas', v: fmt(ult.hh_ganadas_acum), c: 'text-k-green' },
          { l: 'HH gastadas', v: fmt(ult.hh_gastadas_acum), c: 'text-amber-300' },
          { l: 'EAC (HH)', v: fmt(ult.eac_hh), c: 'text-k-blue' },
          { l: 'Desvío', v: `${ult.desvio_hh > 0 ? '+' : ''}${fmt(ult.desvio_hh)}`, c: ult.desvio_hh > 0 ? 'text-k-red' : 'text-k-green' },
        ].map(k => (
          <div key={k.l} className="bg-k-surface border border-k-border rounded-lg px-4 py-2">
            <div className={`font-mono font-bold text-base ${k.c}`}>{k.v}</div>
            <div className="text-[9px] text-k-text3 uppercase tracking-wide">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-k-border rounded-lg">
        <table className="border-collapse w-full min-w-max">
          <thead>
            <tr>
              <th className={th}>SEM</th>
              <th className={th}>AVANCE %</th>
              <th className={th}>HH GANADAS SEM</th>
              <th className={th}>HH GANADAS ACUM</th>
              <th className={th}>HH GASTADAS SEM</th>
              <th className={th}>HH GASTADAS ACUM</th>
              <th className={th}>PF SEM</th>
              <th className={th}>PF ACUM</th>
              <th className={th}>INSTALADO</th>
              <th className={th}>EAC (HH)</th>
              <th className={th}>DESVÍO</th>
            </tr>
          </thead>
          <tbody>
            {serie.map(s => (
              <tr key={s.semana} className={s.semana === data?.hasta ? 'bg-k-amber/5' : ''}>
                <td className={`${td} text-center font-bold text-k-text`}>S{s.semana}</td>
                <td className={`${td} text-k-amber`}>{s.pct_acum != null ? `${(s.pct_acum * 100).toFixed(1)}%` : '—'}</td>
                <td className={td}>{fmt(s.hh_ganadas_sem)}</td>
                <td className={`${td} text-k-green`}>{fmt(s.hh_ganadas_acum)}</td>
                <td className={td}>{fmt(s.hh_gastadas_sem)}</td>
                <td className={`${td} text-amber-300`}>{fmt(s.hh_gastadas_acum)}</td>
                <td className={`${td} ${clrPf(s.pf_sem)}`}>{s.pf_sem != null ? s.pf_sem.toFixed(3) : '—'}</td>
                <td className={`${td} ${clrPf(s.pf_acum)} font-bold`}>{s.pf_acum != null ? s.pf_acum.toFixed(3) : '—'}</td>
                <td className={td}>{fmt(s.cant_instalada)}</td>
                <td className={`${td} text-k-blue`}>{fmt(s.eac_hh)}</td>
                <td className={`${td} ${s.desvio_hh > 0 ? 'text-k-red' : 'text-k-green'}`}>
                  {s.desvio_hh > 0 ? '+' : ''}{fmt(s.desvio_hh)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-k-text3">
        Presupuesto: {fmt(data?.hh_presup_total ?? 0)} HH. Cada fila es el corte del motor EV en esa semana —
        se alimenta sola del avance diario (LookAhead / Avance diario) y del tareo QR; no hay nada que llenar aquí.
      </p>
    </div>
  )
}
