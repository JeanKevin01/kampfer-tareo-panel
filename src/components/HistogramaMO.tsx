// Histograma MO + Ratios HH — espejo de las 2 hojas del "Anexo 01 - LookAhead"
// del ex-gerente que faltaban (Fase S·S6). Solo LECTURA:
//   · barras por día: HH del tareo y nº de trabajadores (histograma de MO);
//   · tabla por partida y semana: ratio real HH/unidad vs el presupuestado
//     (verde = igual o mejor que el presupuesto, rojo = consume más HH/unidad).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import { fmtDia, fmtCorta, num } from '@/lib/lookahead'

interface Dia { fecha: string; hh: number; trabajadores: number }
interface RatioSem { hh: number; cant: number; ratio: number | null }
interface RatioFila {
  partida_id: number; codigo?: string | null; descripcion?: string | null
  unidad?: string | null; ratio_presup: number | null
  semanas: Record<string, RatioSem>
}
interface HistResp {
  desde: string; hasta: string
  semanas: { lunes: string; domingo: string }[]
  dias: Dia[]; ratios: RatioFila[]
}

const th = 'border border-k-border px-2 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'
const td = 'border border-k-border px-2 py-1 text-[11px]'

export default function HistogramaMO() {
  const [desde, setDesde] = useState(() => iso(lunesDe(new Date())))
  const [nSemanas, setNSemanas] = useState(4)
  const [otm, setOtm] = useState('')

  const otms = useQuery<{ otm_id: string; descripcion?: string | null }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const q = useQuery<HistResp>({
    queryKey: ['histograma-mo', desde, nSemanas, otm],
    queryFn: () => api(`/ev/programacion/histograma?desde=${desde}&semanas=${nSemanas}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
  })
  const mover = (dias: number) => {
    const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + dias); setDesde(iso(lunesDe(d)))
  }
  const d = q.data
  const grafica = (d?.dias ?? []).map(x => ({ ...x, dia: fmtCorta(x.fecha) }))
  const maxTrab = Math.max(1, ...(d?.dias ?? []).map(x => x.trabajadores))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => mover(-7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={15} /></button>
        <span className="text-sm font-bold text-k-text">Histograma desde {fmtDia(desde)}</span>
        <button onClick={() => mover(7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={15} /></button>
        <select value={nSemanas} onChange={e => setNSemanas(Number(e.target.value))}
          className="bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none">
          {[2, 4, 8, 12].map(n => <option key={n} value={n}>{n} semanas</option>)}
        </select>
        <select value={otm} onChange={e => setOtm(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none max-w-[220px]">
          <option value="">Todos los proyectos</option>
          {(otms.data ?? []).map(o => <option key={o.otm_id} value={o.otm_id}>{o.otm_id}</option>)}
        </select>
        {q.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl p-4">
        <p className="text-xs font-bold text-k-text mb-1">Histograma de mano de obra
          <span className="text-k-text3 font-normal"> — HH del tareo y personal por día (hoja «Histograma MO»)</span></p>
        {grafica.length === 0 && !q.isLoading ? (
          <p className="text-sm text-k-text3 py-8 text-center">Sin tareo en el rango: registra HH desde la app de campo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={grafica} barGap={1}>
              <CartesianGrid stroke="#252f45" strokeDasharray="3 3" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#8b95ab' }} />
              <YAxis yAxisId="hh" tick={{ fontSize: 10, fill: '#8b95ab' }} />
              <YAxis yAxisId="tr" orientation="right" domain={[0, Math.ceil(maxTrab * 1.3)]} tick={{ fontSize: 10, fill: '#8b95ab' }} />
              <Tooltip contentStyle={{ background: '#1c2436', border: '1px solid #252f45', borderRadius: 8, fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [num(Number(v)), name === 'hh' ? 'HH' : 'Trabajadores']} />
              <Bar yAxisId="hh" dataKey="hh" fill="#f59e0b" radius={[3, 3, 0, 0]} name="hh" />
              <Bar yAxisId="tr" dataKey="trabajadores" fill="#3b82f6" radius={[3, 3, 0, 0]} name="trabajadores" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <p className="text-xs font-bold text-k-text px-4 py-2.5 border-b border-k-border">Ratios HH/unidad por partida
          <span className="text-k-text3 font-normal"> — real vs presupuestado (hoja «Ratios HH»)</span></p>
        <div className="overflow-x-auto">
          <table className="border-collapse w-max min-w-full">
            <thead>
              <tr>
                <th className={`${th} text-left min-w-[240px]`}>Partida</th>
                <th className={th}>Und</th>
                <th className={th} title="hh_presup / metrado_presup">Ratio presup.</th>
                {(d?.semanas ?? []).map(s => (
                  <th key={s.lunes} className={`${th} min-w-[130px]`}>{fmtCorta(s.lunes)} — {fmtCorta(s.domingo)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d?.ratios ?? []).map(f => (
                <tr key={f.partida_id}>
                  <td className={`${td} text-k-text`}>
                    <span className="font-mono text-[9px] text-k-text3 mr-1.5">{f.codigo}</span>
                    {(f.descripcion ?? '').slice(0, 44)}
                  </td>
                  <td className={`${td} text-center text-k-text3`}>{f.unidad ?? '—'}</td>
                  <td className={`${td} text-center font-mono text-k-text2`}>{f.ratio_presup != null ? num(f.ratio_presup) : '—'}</td>
                  {(d?.semanas ?? []).map(s => {
                    const v = f.semanas[s.lunes]
                    if (!v || (!v.hh && !v.cant)) return <td key={s.lunes} className={`${td} text-center text-k-text3`}>—</td>
                    const mejor = v.ratio != null && f.ratio_presup != null && v.ratio <= f.ratio_presup + 1e-9
                    return (
                      <td key={s.lunes} className={`${td} text-center`}
                        title={`HH: ${num(v.hh)} · Cantidad: ${num(v.cant)}${v.ratio != null ? ` · Ratio ${num(v.ratio)} HH/${f.unidad ?? 'und'}` : ' · sin cantidad → sin ratio'}`}>
                        <span className={`font-mono font-bold text-[11px] ${
                          v.ratio == null ? 'text-k-text3' : mejor ? 'text-k-green' : 'text-k-red'}`}>
                          {v.ratio != null ? num(v.ratio) : '—'}
                        </span>
                        <span className="block text-[9px] text-k-text3">{num(v.hh)} HH · {num(v.cant)}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {(d?.ratios ?? []).length === 0 && !q.isLoading && (
                <tr><td colSpan={3 + (d?.semanas.length ?? 0)} className="px-4 py-6 text-center text-k-text3 text-sm">
                  Sin datos: el ratio necesita HH del tareo y avance diario en el rango.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
          Ratio = HH del tareo ÷ cantidad instalada de la semana.{' '}
          <span className="text-k-green font-bold">Verde</span> = igual o mejor que el presupuesto ·{' '}
          <span className="text-k-red font-bold">rojo</span> = consume más HH por unidad que lo presupuestado.
        </p>
      </div>
    </div>
  )
}
