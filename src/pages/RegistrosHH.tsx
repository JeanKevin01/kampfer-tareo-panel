import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Download, Calculator, Loader2 } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Registro { id: number; trab_id: string; otm_id: string; supervisor_id: string; fecha: string; hora: string; hh: number | null }
interface Trabajador { id: string; nombre: string; cargo: string }
interface Supervisor { id: string; nombre: string }

const hoy = () => new Date().toISOString().split('T')[0]

export default function RegistrosHH() {
  const qc = useQueryClient()
  const [fecha, setFecha]         = useState(hoy())
  const [otmFilter, setOtmFilter] = useState('TODOS')
  const [supFilter, setSupFilter] = useState('TODOS')

  const { data: registros = [], isLoading } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => fetch(`${API}/api/registros/${fecha}`).then(r => r.json()),
  })

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => fetch(API + '/admin/trabajadores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: supervisores = [] } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(API + '/api/supervisores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const calcMutation = useMutation({
    mutationFn: () => fetch(API + '/api/calcular-hh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registros', fecha] }),
  })

  const trabMap = useMemo(() => Object.fromEntries(trabajadores.map(t => [t.id, t])), [trabajadores])
  const supMap  = useMemo(() => Object.fromEntries(supervisores.map(s => [s.id, s])), [supervisores])

  const otmsDelDia = useMemo(() => ['TODOS', ...new Set(registros.map(r => r.otm_id)).values()], [registros])
  const supsDelDia = useMemo(() => ['TODOS', ...new Set(registros.map(r => r.supervisor_id)).values()], [registros])

  const filtered = useMemo(() => registros.filter(r =>
    (otmFilter === 'TODOS' || r.otm_id === otmFilter) &&
    (supFilter === 'TODOS' || r.supervisor_id === supFilter)
  ), [registros, otmFilter, supFilter])

  const totalHH    = useMemo(() => filtered.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1), [filtered])
  const trabUnicos = useMemo(() => new Set(filtered.map(r => r.trab_id)).size, [filtered])

  const exportCSV = () => {
    const header = ['ID','Trabajador','Cargo','OTM','Supervisor','Hora','HH']
    const rows = filtered.map(r => {
      const t = trabMap[r.trab_id]; const s = supMap[r.supervisor_id]
      return [r.id, t?.nombre ?? r.trab_id, t?.cargo ?? '', r.otm_id, s?.nombre ?? r.supervisor_id, r.hora, r.hh ?? '']
    })
    const csv = [header, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `registros_${fecha}.csv`; a.click()
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 hover:text-k-text font-bold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending || registros.length === 0}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            {calcMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            Calcular HH
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Registros del día',    value: filtered.length,          color: 'text-k-text'  },
          { label: 'Trabajadores únicos',  value: trabUnicos,               color: 'text-k-blue'  },
          { label: 'HH totales',           value: (isLoading ? '…' : totalHH + ' HH'), color: 'text-k-green' },
          { label: 'OTMs del día',         value: otmsDelDia.length - 1,   color: 'text-k-amber' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className={`font-mono text-2xl font-medium ${s.color} mb-1`}>{isLoading ? '…' : s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <select value={otmFilter} onChange={e => setOtmFilter(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text2 outline-none focus:border-k-amber transition-colors">
          {otmsDelDia.map(o => <option key={o} value={o} className="bg-k-raised">{o === 'TODOS' ? 'Todas las OTMs' : o}</option>)}
        </select>
        <select value={supFilter} onChange={e => setSupFilter(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text2 outline-none focus:border-k-amber transition-colors">
          {supsDelDia.map(s => <option key={s} value={s} className="bg-k-raised">{s === 'TODOS' ? 'Todos los supervisores' : (supMap[s]?.nombre ?? s)}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-k-raised border-b border-k-border">
                {['#', 'Trabajador', 'Cargo', 'OTM', 'Supervisor', 'Hora', 'HH'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i >= 5 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando registros…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-4xl mb-3 opacity-20">📋</div>
                  <p className="text-k-text3 text-sm">Sin registros para el {fecha}</p>
                </td></tr>
              )}
              {filtered.map(r => {
                const t = trabMap[r.trab_id]; const s = supMap[r.supervisor_id]
                return (
                  <tr key={r.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                    <td className="px-4 py-3"><span className="font-mono text-xs text-k-text3">{r.id}</span></td>
                    <td className="px-4 py-3"><span className="text-sm font-medium text-k-text">{t?.nombre ?? r.trab_id}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-k-text2">{t?.cargo ?? '—'}</span></td>
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-k-amber">{r.otm_id}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-k-text2">{s?.nombre ?? r.supervisor_id}</span></td>
                    <td className="px-4 py-3 text-center"><span className="font-mono text-xs text-k-text2">{r.hora}</span></td>
                    <td className="px-4 py-3 text-center">
                      {r.hh != null
                        ? <span className="font-mono text-xs font-bold text-k-green">{r.hh} HH</span>
                        : <span className="text-[10px] text-k-text3 bg-k-raised border border-k-border px-2 py-0.5 rounded">—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-k-border bg-k-raised flex items-center justify-between">
            <span className="text-[11px] text-k-text3">{filtered.length} registros · {totalHH} HH totales</span>
            {calcMutation.isSuccess && <span className="text-[11px] text-k-green">✓ HH calculadas correctamente</span>}
          </div>
        )}
      </div>
    </div>
  )
}