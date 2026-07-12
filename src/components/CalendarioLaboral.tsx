// Calendario laboral de la programación (por proyecto — pensado para que
// KAMPFER sirva a empresas con distintos regímenes): días de la semana que
// se trabajan + feriados/días no laborables. El prorrateo del LookAhead los
// salta, y al guardar se re-prorratean las actividades aún PROGRAMADO.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, Loader2, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'

const PROYECTO_ID = 1
const DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']] as const
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber'

interface Config { dias_semana: number[]; feriados: { id: number; fecha: string; motivo?: string | null }[] }

export function CalendarioLaboral() {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState({ fecha: '', motivo: '' })

  const cfg = useQuery<Config>({
    queryKey: ['prog-config'],
    queryFn: () => api(`/ev/programacion/config?proyecto_id=${PROYECTO_ID}`),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['prog-config'] })
    qc.invalidateQueries({ queryKey: ['lookahead-grid'] })
    qc.invalidateQueries({ queryKey: ['programacion'] })
    qc.invalidateQueries({ queryKey: ['lookahead'] })
  }
  const guardarDias = useMutation({
    mutationFn: (dias: number[]) => api('/ev/programacion/config', {
      method: 'PUT', body: JSON.stringify({ proyecto_id: PROYECTO_ID, dias_semana: dias }),
    }),
    onSuccess: invalidar, onError: (e: Error) => { alert(e.message); invalidar() },
  })
  const crearFeriado = useMutation({
    mutationFn: () => api('/ev/programacion/feriados', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, ...nuevo }),
    }),
    onSuccess: () => { setNuevo({ fecha: '', motivo: '' }); invalidar() },
    onError: (e: Error) => alert(e.message),
  })
  const borrarFeriado = useMutation({
    mutationFn: (id: number) => api(`/ev/programacion/feriados/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  const dias = cfg.data?.dias_semana ?? [1, 2, 3, 4, 5, 6, 7]
  const toggleDia = (d: number) => {
    const nuevos = dias.includes(d) ? dias.filter(x => x !== d) : [...dias, d].sort()
    if (nuevos.length === 0) { alert('Debe quedar al menos un día laborable'); return }
    guardarDias.mutate(nuevos)
  }

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-k-border flex items-center justify-between">
        <span className="text-sm font-bold text-k-text flex items-center gap-2">
          <CalendarOff size={14} className="text-k-amber" /> Calendario laboral
        </span>
        {(cfg.isFetching || guardarDias.isPending) && <Loader2 size={13} className="animate-spin text-k-text3" />}
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">Días de la semana que se trabajan</p>
          <div className="flex gap-1.5 flex-wrap">
            {DIAS.map(([n, l]) => (
              <button key={n} onClick={() => toggleDia(n)}
                className={`text-xs font-bold px-3 py-2 rounded-lg border ${
                  dias.includes(n)
                    ? 'border-green-500/40 bg-green-500/15 text-k-green'
                    : 'border-k-border bg-k-raised text-k-text3 line-through'}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-k-text3 mt-2">
            Los días apagados no reciben metrado en el prorrateo. Al cambiar, las actividades
            aún PROGRAMADO se re-prorratean solas.
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">Días no laborables (feriados, paradas)</p>
          <div className="flex gap-1.5 mb-2">
            <input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} className={inputCls} />
            <input placeholder="Motivo (ej. Fiestas Patrias)" value={nuevo.motivo}
              onChange={e => setNuevo({ ...nuevo, motivo: e.target.value })} className={`${inputCls} flex-1`} />
            <button onClick={() => crearFeriado.mutate()} disabled={!nuevo.fecha || crearFeriado.isPending}
              className="text-xs px-3 rounded-lg bg-k-amber text-black font-bold disabled:opacity-40">+ Agregar</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-auto">
            {(cfg.data?.feriados ?? []).map(f => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-k-border bg-k-raised/40 px-2.5 py-1.5">
                <span className="font-mono text-[11px] text-k-text2">{f.fecha}</span>
                <span className="text-[11px] text-k-text3 flex-1 truncate">{f.motivo}</span>
                <button onClick={() => borrarFeriado.mutate(f.id)} className="text-k-text3 hover:text-k-red"><Trash2 size={12} /></button>
              </div>
            ))}
            {(cfg.data?.feriados ?? []).length === 0 && <p className="text-[11px] text-k-text3">Sin días no laborables registrados.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
