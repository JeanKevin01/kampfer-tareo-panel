import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, CheckCircle, XCircle, Clock, Hash, Mail, Loader2 } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Supervisor { id: string; nombre: string; email?: string }
interface Registro { id: number; supervisor_id: string; otm_id: string; trab_id: string; hh: number | null }

const hoy = () => new Date().toISOString().split('T')[0]

export default function Supervisores() {
  const [fecha, setFecha] = useState(hoy())

  const { data: supervisores = [], isLoading: loadSup } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(API + '/api/supervisores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: registros = [], isLoading: loadReg } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => fetch(`${API}/api/registros/${fecha}`).then(r => r.json()),
  })

  const isLoading = loadSup || loadReg

  const statsPorSup = supervisores.map(s => {
    const regs = registros.filter(r => r.supervisor_id === s.id)
    const trabUnicos = new Set(regs.map(r => r.trab_id)).size
    const otmsUnicos = new Set(regs.map(r => r.otm_id)).size
    const hhTotal    = regs.reduce((sum, r) => sum + (r.hh ?? 0), 0)
    return { ...s, regs: regs.length, trabUnicos, otmsUnicos, hhTotal, reporto: regs.length > 0 }
  })

  const reportaron = statsPorSup.filter(s => s.reporto).length
  const pendientes = statsPorSup.filter(s => !s.reporto).length
  const totalRegs  = registros.length
  const totalHH    = registros.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1)

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">Estado de reporte por supervisor</p>
        <div className="relative">
          <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Reportaron',      value: reportaron,       color: 'text-k-green' },
          { label: 'Pendientes',      value: pendientes,       color: pendientes > 0 ? 'text-k-red' : 'text-k-text3' },
          { label: 'Registros total', value: totalRegs,        color: 'text-k-blue'  },
          { label: 'HH del día',      value: totalHH + ' HH', color: 'text-k-amber' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className={`font-mono text-2xl font-medium ${s.color} mb-1`}>
              {isLoading ? '…' : s.value}
            </div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-k-text3">
          <Loader2 size={18} className="animate-spin mr-2" /> Cargando…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {statsPorSup.map(s => (
            <div key={s.id}
              className={`bg-k-surface rounded-xl border transition-colors ${
                s.reporto ? 'border-green-500/20' : 'border-k-border'
              }`}>
              <div className="p-5 flex items-center gap-5 flex-wrap">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  s.reporto ? 'bg-green-500/10' : 'bg-k-raised'}`}>
                  {s.reporto
                    ? <CheckCircle size={22} className="text-k-green" />
                    : <XCircle    size={22} className="text-k-text3" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <span className="font-bold text-base text-k-text">{s.nombre}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                      s.reporto
                        ? 'text-k-green bg-green-500/10 border-green-500/20'
                        : 'text-k-text3 bg-k-raised border-k-border'
                    }`}>
                      {s.reporto ? '✓ Reportó' : '✗ Sin reporte'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[11px] text-k-text3">
                      <Hash size={11} /> {s.id}
                    </span>
                    {s.email && (
                      <span className="flex items-center gap-1.5 text-[11px] text-k-text3">
                        <Mail size={11} /> {s.email}
                      </span>
                    )}
                  </div>
                </div>
                {s.reporto ? (
                  <div className="flex gap-6">
                    {[
                      { label: 'Registros',    value: s.regs,       color: 'text-k-blue'  },
                      { label: 'Trabajadores', value: s.trabUnicos, color: 'text-k-text'  },
                      { label: 'OTMs',         value: s.otmsUnicos, color: 'text-k-amber' },
                      { label: 'HH', value: s.hhTotal > 0 ? s.hhTotal.toFixed(1) : '—', color: 'text-k-green' },
                    ].map(m => (
                      <div key={m.label} className="text-center">
                        <div className={`font-mono text-xl font-medium ${m.color}`}>{m.value}</div>
                        <div className="text-[9px] text-k-text3 uppercase tracking-wide">{m.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-k-text3">
                    <Clock size={14} />
                    <span className="text-xs">Sin actividad el {fecha}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-k-raised border border-k-border rounded-xl p-4">
        <p className="text-[11px] text-k-text3 leading-relaxed">
          <span className="text-k-amber font-bold">ℹ️ Para agregar nuevos supervisores: </span>
          accede a{' '}
          <a href="https://adminer.apps1.astraera.space" target="_blank" rel="noopener noreferrer"
            className="text-k-blue hover:underline">Adminer</a>
          {' '}→ tabla <span className="font-mono text-k-text">supervisores</span> → Nuevo registro.
          Formato ID: <span className="font-mono text-k-text">SUP-006</span>.
        </p>
      </div>

    </div>
  )
}