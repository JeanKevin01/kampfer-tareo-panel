// Alta de una sub-fila del LookAhead: una porción de la partida que se ejecuta
// aparte. El caso que la motiva: RELLENO ZONA 5 son 15 000 m3 que se avanzan de
// 200 en 200 por áreas y capas, sin crear partidas nuevas.
//
// Lo que esta ventana tiene que dejar claro en tres segundos: cuánto queda del
// presupuesto de la partida, cuánto se está comprometiendo aquí y qué pasa si
// uno se pasa (avisa, no bloquea — la obra manda).
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { num } from '@/lib/lookahead'

export interface PadreSubfila {
  id: number; titulo: string; fecha: string; fecha_fin: string
  partida_id?: number | null; partida_codigo?: string | null; partida_desc?: string | null
  und?: string | null; metrado_prog?: number | null
}

interface Saldo {
  metrado_presup: number; programado: number; ejecutado: number
  saldo_por_programar: number; excedido: number; unidad?: string | null
}

/** Nombre visible del concepto. Jean lo pidió con las tres palabras juntas para
 *  que ninguna especialidad tenga que traducirlo: en tierras es un frente, en
 *  carreteras un tramo, en edificación un sector. */
export const SUBFILA = 'Frente / Tramo / Sector'
export const SUBFILA_QUE_ES =
  'Una porción de la partida que se ejecuta aparte —una zona, un tramo, un sector, ' +
  'una capa— y que consume metrado del presupuesto de esa misma partida. ' +
  'No crea una partida nueva: la partida sigue siendo una sola.'

export default function SubfilaModal({ padre, etiquetas, proyectoId, sups, onClose }: {
  padre: PadreSubfila
  etiquetas: { d1: string; d2: string }
  proyectoId: number
  /** Supervisores del padrón: el frente necesita dueño para que la agenda de la
   *  app de campo se lo muestre y pueda reportar avance, fotos y restricciones. */
  sups: { id: string; nombre: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [titulo, setTitulo] = useState('')
  const [sup, setSup] = useState('')
  const [metrado, setMetrado] = useState('')
  const [ini, setIni] = useState(padre.fecha)
  const [fin, setFin] = useState(padre.fecha_fin)
  const [error, setError] = useState('')

  const pid = padre.partida_id ?? 0
  // `excluir` deja fuera la fila padre: al aparecer su primera sub-fila deja de
  // tener metrado propio (se muda al hijo), así que contarlo aquí mostraría el
  // doble de comprometido justo en el momento de dividir.
  const { data: saldo } = useQuery<Saldo>({
    queryKey: ['saldo-partida', pid, proyectoId, padre.id],
    queryFn: () => api(
      `/ev/programacion/saldo-partida?partida_id=${pid}&proyecto_id=${proyectoId}&excluir=${padre.id}`),
    enabled: pid > 0,
  })
  const { data: sug } = useQuery<{ desglose_1: string[]; desglose_2: string[] }>({
    queryKey: ['desgloses', pid, proyectoId],
    queryFn: () => api(`/ev/programacion/desgloses?partida_id=${pid}&proyecto_id=${proyectoId}`),
    enabled: pid > 0,
  })

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  const m = Number(metrado) || 0
  const und = saldo?.unidad || padre.und || ''
  // El saldo que se ve aquí ya descuenta lo programado en las demás sub-filas;
  // esta todavía no existe, así que se resta aparte.
  const quedaria = saldo ? saldo.saldo_por_programar - m : null
  const seExcede = quedaria != null && quedaria < 0

  const crear = useMutation({
    mutationFn: () => api('/ev/programacion/actividades', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: proyectoId, padre_id: padre.id, es_frente: true,
        titulo: titulo.trim() || [d1, d2].filter(Boolean).join(' · ') || 'Frente',
        supervisor_id: sup || null,
        fecha: ini, fecha_fin: fin,
        metrado_prog: metrado === '' ? null : Number(metrado),
        desglose_1: d1 || null, desglose_2: d2 || null,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lookahead-grid'] })
      qc.invalidateQueries({ queryKey: ['saldo-partida'] })
      qc.invalidateQueries({ queryKey: ['desgloses'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message || 'No se pudo crear'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-k-surface border border-k-border rounded-xl w-full max-w-lg mt-16 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-k-text">Nuevo {SUBFILA.toLowerCase()}</h3>
            <p className="text-[11px] text-k-text3 mt-0.5">
              Sale de <b className="text-k-text2">#{padre.id} {padre.titulo}</b>
              {padre.partida_codigo && <> · 📌 {padre.partida_codigo}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text text-lg leading-none">✕</button>
        </div>

        <p className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg p-2">
          {SUBFILA_QUE_ES}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">{etiquetas.d1}</span>
            <input value={d1} onChange={e => setD1(e.target.value)} list="sf-d1"
              placeholder="Área A" className="input w-full" />
            <datalist id="sf-d1">{(sug?.desglose_1 ?? []).map(v => <option key={v} value={v} />)}</datalist>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">{etiquetas.d2}</span>
            <input value={d2} onChange={e => setD2(e.target.value)} list="sf-d2"
              placeholder="Capa 1" className="input w-full" />
            <datalist id="sf-d2">{(sug?.desglose_2 ?? []).map(v => <option key={v} value={v} />)}</datalist>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">Nombre (opcional)</span>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder={[d1, d2].filter(Boolean).join(' · ') || 'Se arma con el área y la capa'}
              className="input w-full" />
          </label>
          {/* Sin responsable el frente no le aparece a nadie en el celular: la
              agenda de campo se arma con el supervisor asignado. */}
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">Responsable</span>
            <select value={sup} onChange={e => setSup(e.target.value)} className="input w-full">
              <option value="">— sin asignar —</option>
              {sups.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        </div>
        {!sup && (
          <p className="text-[10px] text-k-text3 -mt-1">
            Sin responsable, este frente no le aparece a ningún supervisor en la app de campo
            y nadie podrá reportar su avance ni sus fotos.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">Metrado {und && `(${und})`}</span>
            <input value={metrado} onChange={e => setMetrado(e.target.value)} type="number" min="0"
              autoFocus className="input w-full font-mono" placeholder="200" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">F. inicio</span>
            <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="input w-full" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-k-text3 uppercase">F. fin</span>
            <input type="date" value={fin} onChange={e => setFin(e.target.value)} className="input w-full" />
          </label>
        </div>

        {/* El saldo: la cuenta que hoy se lleva de memoria o en un Excel aparte. */}
        {saldo && saldo.metrado_presup > 0 && (
          <div className="text-[11px] space-y-1 bg-k-raised border border-k-border rounded-lg p-2">
            <div className="h-2 rounded bg-k-border overflow-hidden flex">
              <div className="bg-k-green h-full"
                style={{ width: `${Math.min(100, (saldo.ejecutado / saldo.metrado_presup) * 100)}%` }} />
              <div className="bg-k-plan h-full"
                style={{ width: `${Math.min(100, (Math.max(saldo.programado - saldo.ejecutado, 0) / saldo.metrado_presup) * 100)}%` }} />
              <div className="bg-k-amber/70 h-full"
                style={{ width: `${Math.min(100, (m / saldo.metrado_presup) * 100)}%` }} />
            </div>
            <div className="text-k-text2 tabular-nums">
              {num(saldo.ejecutado)} hecho · {num(saldo.programado)} programado de{' '}
              <b className="text-k-text">{num(saldo.metrado_presup)} {und}</b>
            </div>
            {quedaria != null && !seExcede && (
              <div className="text-k-text3">
                Quedarían <b className="text-k-text2">{num(quedaria)} {und}</b> por programar de la partida.
              </div>
            )}
            {seExcede && (
              <div className="text-k-amber">
                Te pasas {num(Math.abs(quedaria!))} {und} del presupuesto de la partida. Se puede
                programar igual —la obra manda—, pero queda como mayor metrado por sustentar.
              </div>
            )}
          </div>
        )}

        {error && <div className="text-[11px] text-k-red">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-sm btn-terciario">Cancelar</button>
          <button onClick={() => { setError(''); crear.mutate() }} disabled={crear.isPending}
            className="btn btn-sm btn-primario">
            {crear.isPending ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
