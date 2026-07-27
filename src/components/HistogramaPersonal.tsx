// ── Histograma de personal ───────────────────────────────────
// Encargo de Jean (2026-07-26): el histograma de MO que ya existía solo miraba
// DÍAS dentro de una ventana de semanas. Para conversar con la gerencia hace
// falta la curva de toda la obra agrupada por semana y por MES.
//
// Ojo con la métrica: en un mes, «trabajadores» son personas DISTINTAS (el
// mismo obrero 20 días cuenta una vez), mientras que el pico y el promedio
// diario son los que describen la dotación real del mes. Las tres se muestran
// para que no se confundan.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Loader2, Download } from 'lucide-react'

import { api } from '@/lib/api'

type Agrupar = 'dia' | 'semana' | 'mes'

interface Periodo {
  periodo: string; trabajadores: number; dias: number; hh: number
  pico: number; promedio_dia: number; por_cargo: Record<string, number>
}
interface Resp {
  desde: string | null; hasta: string | null; agrupar: Agrupar
  periodos: Periodo[]
  totales: { trabajadores: number; dias: number; hh: number }
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber'

const etiquetaPeriodo = (p: string, a: Agrupar) => {
  const [y, m, d] = p.split('-')
  if (a === 'mes') return `${MESES[Number(m) - 1]} ${y}`
  if (a === 'semana') return `Sem ${Number(d)} ${MESES[Number(m) - 1]}`
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

export default function HistogramaPersonal({ otm }: { otm?: string }) {
  const [agrupar, setAgrupar] = useState<Agrupar>('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const q = useQuery<Resp>({
    queryKey: ['histograma-personal', agrupar, desde, hasta, otm],
    queryFn: () => api('/api/histograma-personal?' + new URLSearchParams({
      agrupar, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}),
      ...(otm ? { otm } : {}),
    })),
  })

  const datos = (q.data?.periodos ?? []).map(p => ({
    ...p, etiqueta: etiquetaPeriodo(p.periodo, q.data!.agrupar),
  }))
  // Cargos presentes en todo el rango, del más frecuente al menos.
  const cargos = Object.entries(
    (q.data?.periodos ?? []).reduce<Record<string, number>>((acc, p) => {
      for (const [c, n] of Object.entries(p.por_cargo)) acc[c] = Math.max(acc[c] ?? 0, n)
      return acc
    }, {})).sort((a, b) => b[1] - a[1])

  const exportar = () => {
    const cab = ['PERIODO', 'TRABAJADORES', 'PICO_DIA', 'PROMEDIO_DIA', 'DIAS', 'HH',
      ...cargos.map(([c]) => c)]
    const filas = datos.map(p => [p.etiqueta, p.trabajadores, p.pico, p.promedio_dia,
      p.dias, p.hh, ...cargos.map(([c]) => p.por_cargo[c] ?? 0)])
    const csv = [cab, ...filas].map(f => f.join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `histograma-personal-${agrupar}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex gap-1 bg-k-raised border border-k-border rounded-lg p-1">
          {(['dia', 'semana', 'mes'] as Agrupar[]).map(a => (
            <button key={a} onClick={() => setAgrupar(a)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-colors ${
                agrupar === a ? 'bg-k-amber text-black' : 'text-k-text2 hover:text-k-text'}`}>
              {a === 'dia' ? 'Por día' : a === 'semana' ? 'Por semana' : 'Por mes'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-[10px] uppercase font-bold text-k-text3 mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-bold text-k-text3 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
        </div>
        {(desde || hasta) && (
          <button onClick={() => { setDesde(''); setHasta('') }}
            className="text-xs px-3 py-2 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">
            Todo el historial
          </button>
        )}
        <button onClick={exportar} disabled={!datos.length}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised disabled:opacity-40">
          <Download size={13} /> Exportar CSV
        </button>
      </div>

      {q.isLoading && (
        <p className="text-k-text3 text-sm flex items-center gap-2 py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </p>
      )}
      {!q.isLoading && !datos.length && (
        <p className="text-k-text3 text-sm text-center py-10">
          Todavía no hay tareo registrado en ese rango.
        </p>
      )}

      {!!datos.length && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Personas distintas', q.data?.totales.trabajadores ?? 0, 'en todo el rango'],
              ['Pico de personal', Math.max(...datos.map(d => d.pico)), 'máximo en un día'],
              ['HH totales', (q.data?.totales.hh ?? 0).toLocaleString('es-PE'), 'del tareo'],
              ['Días con tareo', q.data?.totales.dias ?? 0, 'con al menos un registro'],
            ].map(([t, v, sub]) => (
              <div key={String(t)} className="bg-k-surface border border-k-border rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase font-bold text-k-text3">{t}</p>
                <p className="text-2xl font-bold text-k-text leading-tight">{v}</p>
                <p className="text-[10px] text-k-text3">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl p-4">
            <p className="text-xs font-bold text-k-text mb-3">
              Personal y HH {agrupar === 'mes' ? 'por mes' : agrupar === 'semana' ? 'por semana' : 'por día'}
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={datos} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--k-border))" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: 'rgb(var(--k-text3))' }} />
                <YAxis yAxisId="p" tick={{ fontSize: 11, fill: 'rgb(var(--k-text3))' }} />
                <YAxis yAxisId="hh" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--k-text3))' }} />
                <Tooltip contentStyle={{ background: 'rgb(var(--k-raised))', border: '1px solid rgb(var(--k-border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="p" dataKey="trabajadores" name="Personas distintas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Line yAxisId="p" dataKey="pico" name="Pico por día" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line yAxisId="p" dataKey="promedio_dia" name="Promedio por día" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="hh" dataKey="hh" name="HH" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-k-text3 mt-2">
              En un mes, <b>personas distintas</b> cuenta a cada trabajador una vez aunque venga
              todos los días; el <b>pico</b> y el <b>promedio por día</b> son los que describen la
              dotación real.
            </p>
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-k-raised border-b border-k-border">
                    <th className="px-3 py-2 text-left font-bold text-k-text3 uppercase text-[10px] sticky left-0 bg-k-raised">Periodo</th>
                    {['Personas', 'Pico/día', 'Prom./día', 'Días', 'HH'].map(h => (
                      <th key={h} className="px-3 py-2 text-right font-bold text-k-text3 uppercase text-[10px]">{h}</th>
                    ))}
                    {cargos.map(([c]) => (
                      <th key={c} className="px-3 py-2 text-right font-bold text-k-text3 uppercase text-[10px] whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datos.map(p => (
                    <tr key={p.periodo} className="border-b border-k-border last:border-0 hover:bg-k-raised/40">
                      <td className="px-3 py-2 font-bold text-k-text sticky left-0 bg-k-surface">{p.etiqueta}</td>
                      <td className="px-3 py-2 text-right text-k-amber font-bold">{p.trabajadores}</td>
                      <td className="px-3 py-2 text-right text-k-text2">{p.pico}</td>
                      <td className="px-3 py-2 text-right text-k-text2">{p.promedio_dia}</td>
                      <td className="px-3 py-2 text-right text-k-text3">{p.dias}</td>
                      <td className="px-3 py-2 text-right font-mono text-k-text2">{p.hh.toLocaleString('es-PE')}</td>
                      {cargos.map(([c]) => (
                        <td key={c} className="px-3 py-2 text-right text-k-text3">{p.por_cargo[c] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
