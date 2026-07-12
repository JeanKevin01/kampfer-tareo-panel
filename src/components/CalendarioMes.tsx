// Vista MENSUAL del plan (pedido de Jean 2026-07-12): calendario clásico con
// los días del mes y las actividades como píldoras, para ubicarse rápido.
// Reusa /ev/programacion/lookahead-grid (una actividad multi-día aparece en
// cada día de su rango, saltando sus días ∅).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { iso, lunesDe } from '@/lib/semana'
import type { ActGrid, GridResp } from '@/components/LookaheadGrid'

const PROYECTO_ID = 1
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_C = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const ESTADO_DOT: Record<string, string> = {
  PROGRAMADO: 'bg-amber-400', EJECUTADO: 'bg-green-500',
  CANCELADO: 'bg-zinc-500', NO_CUMPLIDA: 'bg-red-500',
}
const isoDow = (f: string) => { const d = new Date(f + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d }

export function CalendarioMes({ onEditar, onCrearDia }: {
  onEditar: (a: ActGrid) => void
  onCrearDia: (fecha: string) => void
}) {
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  const primero = new Date(mes.y, mes.m, 1, 12)
  const ultimo = new Date(mes.y, mes.m + 1, 0, 12)
  const desde = iso(lunesDe(primero))
  const nSemanas = Math.ceil(((primero.getTime() - new Date(desde + 'T12:00:00').getTime()) / 86400000 + ultimo.getDate()) / 7)

  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid', desde, nSemanas],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${desde}&semanas=${nSemanas}`),
  })
  const d = grid.data
  const acts = (d?.grupos ?? []).flatMap(g => g.actividades)
  const diasSemana = new Set(d?.dias_semana ?? [1, 2, 3, 4, 5, 6, 7])
  const feriados = new Set(d?.feriados ?? [])
  const hoy = iso(new Date())

  const delDia = (f: string) =>
    acts.filter(a => f >= a.fecha && f <= a.fecha_fin && !(a.dias_salto ?? []).includes(f))

  const mover = (n: number) => setMes(({ y, m }) => {
    const d2 = new Date(y, m + n, 1); return { y: d2.getFullYear(), m: d2.getMonth() }
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => mover(-1)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={15} /></button>
        <span className="text-sm font-bold text-k-text w-40 text-center">{MESES_L[mes.m]} {mes.y}</span>
        <button onClick={() => mover(1)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={15} /></button>
        <button onClick={() => { const dd = new Date(); setMes({ y: dd.getFullYear(), m: dd.getMonth() }) }}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">Hoy</button>
        {grid.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      <div className="grid grid-cols-7 gap-px bg-k-border rounded-xl overflow-hidden border border-k-border">
        {DIAS_C.map(l => (
          <div key={l} className="bg-k-raised px-2 py-1.5 text-[10px] uppercase font-bold text-k-text3 text-center">{l}</div>
        ))}
        {(d?.fechas ?? []).map(f => {
          const enMes = Number(f.slice(5, 7)) === mes.m + 1
          const noLab = !diasSemana.has(isoDow(f)) || feriados.has(f)
          const lista = delDia(f)
          const esHoy = f === hoy
          return (
            <div key={f} className={`min-h-[92px] p-1 group ${
              esHoy ? 'bg-green-500/10' : noLab ? 'bg-k-surface/50' : 'bg-k-surface'} ${enMes ? '' : 'opacity-40'}`}>
              <div className="flex items-center justify-between px-0.5">
                <span className={`text-[11px] font-bold ${esHoy ? 'text-k-green' : noLab ? 'text-k-text3 line-through' : 'text-k-text2'}`}>
                  {Number(f.slice(8, 10))}
                </span>
                <button title="Programar en este día" onClick={() => onCrearDia(f)}
                  className="opacity-0 group-hover:opacity-100 text-k-text3 hover:text-k-amber"><Plus size={12} /></button>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {lista.slice(0, 3).map(a => (
                  <div key={a.id} onClick={() => onEditar(a)}
                    title={`${a.otm_id ?? ''} ${a.titulo}${a.prog[f] ? ` · prog ${a.prog[f]}` : ''}${a.real[f] != null ? ` · real ${a.real[f]}` : ''}`}
                    className="flex items-center gap-1 rounded px-1 py-0.5 bg-k-raised/70 hover:bg-k-raised cursor-pointer">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ESTADO_DOT[a.estado] ?? 'bg-zinc-500'}`} />
                    <span className="text-[9px] text-k-text2 truncate leading-tight">{a.titulo}</span>
                  </div>
                ))}
                {lista.length > 3 && (
                  <div className="text-[9px] text-k-text3 px-1">+{lista.length - 3} más…</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-k-text3">
        Una actividad multi-día aparece en cada día de su rango (sin sus saltos ∅) ·
        días grises = no laborables · clic en la actividad para abrirla, + para programar en ese día.
      </p>
    </div>
  )
}
