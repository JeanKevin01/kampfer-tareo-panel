import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Calendar, Loader2 } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE

interface Registro {
  id: number; trab_id: string; otm_id: string
  supervisor_id: string; fecha: string; hora: string; hh: number | null
}
interface Supervisor { id: string; nombre: string }

const hoy = () => new Date().toISOString().split('T')[0]
const hace7 = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0] }

const COLORS = ['#f59e0b','#10b981','#3b82f6','#a855f7','#ef4444','#06b6d4','#f97316','#84cc16']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-k-raised border border-k-border2 rounded-lg px-3 py-2 text-xs">
      <p className="text-k-text2 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono font-bold">
          {p.value} {p.name}
        </p>
      ))}
    </div>
  )
}

export default function Reportes() {
  const [fecha, setFecha] = useState(hoy())
  const [desde, setDesde] = useState(hace7())

  const { data: registrosHoy = [], isLoading: loadHoy } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => fetch(`${API}/api/registros/${fecha}`).then(r => r.json()),
  })

  const { data: supervisores = [] } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(API + '/api/supervisores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const supMap = Object.fromEntries(supervisores.map(s => [s.id, s.nombre]))

  // HH por OTM (del día seleccionado)
  const hhPorOTM = Object.entries(
    registrosHoy.reduce((acc, r) => {
      acc[r.otm_id] = (acc[r.otm_id] ?? 0) + (r.hh ?? 0)
      return acc
    }, {} as Record<string, number>)
  ).map(([otm, hh]) => ({ otm, hh: Number(hh.toFixed(1)) }))
    .sort((a, b) => b.hh - a.hh)

  // Registros por supervisor (del día)
  const regPorSup = Object.entries(
    registrosHoy.reduce((acc, r) => {
      const nombre = supMap[r.supervisor_id] ?? r.supervisor_id
      acc[nombre] = (acc[nombre] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([sup, registros]) => ({ sup: sup.split(' ')[0], registros }))

  // HH por OTM para pie chart
  const pieData = hhPorOTM.slice(0, 6).map(d => ({ name: d.otm, value: d.hh }))

  // Stats rápidas
  const totalHH = registrosHoy.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1)
  const otmsActivas = new Set(registrosHoy.map(r => r.otm_id)).size
  const trabActivos = new Set(registrosHoy.map(r => r.trab_id)).size

  return (
    <div className="space-y-6">

      {/* Selector de fecha */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-k-text3 uppercase tracking-wide">Fecha:</span>
          <div className="relative">
            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
        </div>
        {loadHoy && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      {/* KPIs del día */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Registros del día',   value: registrosHoy.length, color: 'text-k-text'  },
          { label: 'Trabajadores activos', value: trabActivos,          color: 'text-k-blue'  },
          { label: 'HH totales',           value: totalHH + ' HH',     color: 'text-k-green' },
          { label: 'OTMs con actividad',   value: otmsActivas,          color: 'text-k-amber' },
          { label: 'Supervisores',         value: Object.keys(regPorSup.reduce((a,b) => ({...a,[b.sup]:1}),{})).length, color: 'text-purple-400' },
          { label: 'HH promedio/trab.',
            value: trabActivos > 0 ? (Number(totalHH)/trabActivos).toFixed(1) + ' HH' : '—',
            color: 'text-k-text2' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className={`font-mono text-2xl font-medium ${s.color} mb-1`}>
              {loadHoy ? '…' : s.value}
            </div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Gráficos fila 1 */}
      <div className="grid grid-cols-2 gap-4">

        {/* HH por OTM - barras */}
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            HH por OTM — {fecha}
          </h3>
          {hhPorOTM.length === 0
            ? <div className="flex items-center justify-center h-40 text-k-text3 text-sm">Sin datos</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hhPorOTM} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252f45" />
                  <XAxis dataKey="otm" tick={{ fill: '#4e5a72', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#4e5a72', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="hh" name="HH" fill="#f59e0b" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Registros por supervisor - barras */}
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Registros por supervisor — {fecha}
          </h3>
          {regPorSup.length === 0
            ? <div className="flex items-center justify-center h-40 text-k-text3 text-sm">Sin datos</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={regPorSup} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252f45" />
                  <XAxis dataKey="sup" tick={{ fill: '#4e5a72', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#4e5a72', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="registros" name="registros" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid grid-cols-2 gap-4">

        {/* Distribución HH por OTM - pie */}
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Distribución HH por OTM
          </h3>
          {pieData.length === 0
            ? <div className="flex items-center justify-center h-40 text-k-text3 text-sm">Sin datos</div>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={75}
                    dataKey="value" nameKey="name" label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 9, fill: '#8a96ad' }}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Tabla resumen */}
        <div className="bg-k-surface border border-k-border rounded-xl p-5">
          <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-4">
            Resumen por OTM
          </h3>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {hhPorOTM.length === 0
              ? <p className="text-k-text3 text-sm">Sin datos para {fecha}</p>
              : hhPorOTM.map((d, i) => (
                <div key={d.otm} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="font-mono text-xs text-k-amber flex-shrink-0 w-24">{d.otm}</span>
                  <div className="flex-1 bg-k-raised rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{
                      width: `${(d.hh / Math.max(...hhPorOTM.map(x=>x.hh))) * 100}%`,
                      background: COLORS[i % COLORS.length]
                    }} />
                  </div>
                  <span className="font-mono text-xs text-k-green w-14 text-right">{d.hh} HH</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

    </div>
  )
}