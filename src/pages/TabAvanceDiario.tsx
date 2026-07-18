// Tab «Avance diario» del Valor Ganado — la MISMA vista Excel del LookAhead
// pero con el HISTORIAL COMPLETO de las partidas de el proyecto: arranca en el
// primer registro (avance o HH de tareo) y llega hasta hoy / fin programado.
// Todo el historial es editable: cada celda escribe en la fuente única
// (ev_avances_diarios) y el rollup alimenta el % EV — un solo dato, dos vías.
// Una fila por ETAPA (hito) cuando la partida se desplegó por hitos.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, PlayCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { DIAS_1, fmtCorta, num, isoDow } from '@/lib/lookahead'
import CeldaDia from '@/components/CeldaDia'

interface EtapaH {
  hito_id: number | null; hito_desc: string | null; hito_peso: number | null
  real: Record<string, number>; prog: Record<string, number>
  actividades: { id: number; fecha: string; fecha_fin: string; estado: string
                 dias_salto: string[]; dias_medio: string[]; metrado_prog: number | null }[]
}
interface PartidaH {
  id: number; codigo: string; descripcion: string; unidad: string | null
  metrado: number; factor_conv: number; hh_presup: number
  hh: Record<string, number>
  primer_registro: string | null; sin_registros: boolean
  etapas: EtapaH[]
}
interface HistResp {
  otm: string; desde: string; hasta: string; truncado: boolean; hoy: string
  fechas: string[]
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  dias_semana: number[]; feriados: string[]
  partidas: PartidaH[]
}

const th = 'border border-k-border px-1 py-1 text-[10px] font-bold text-k-text2 bg-k-raised'

export default function TabAvanceDiario({ otm }: { otm?: string }) {
  const qc = useQueryClient()
  const [desde, setDesde] = useState('')

  const hist = useQuery<HistResp>({
    queryKey: ['historial-grid', otm, desde],
    queryFn: () => api(`/ev/programacion/historial-grid?otm=${encodeURIComponent(otm!)}${desde ? `&desde=${desde}` : ''}`),
    enabled: !!otm,
  })
  const invalidar = () => {
    for (const k of ['historial-grid', 'semana-grid', 'lookahead-grid', 'programacion',
                     'ev-captura', 'ev-reporte', 'ev-arbol', 'ev-curva', 'ev-performance'])
      qc.invalidateQueries({ queryKey: [k] })
  }
  const guardar = useMutation({
    mutationFn: ({ pid, hito, fecha, v }: { pid: number; hito: number | null; fecha: string; v: number | null }) =>
      api('/ev/avance-diario', {
        method: 'POST',
        body: JSON.stringify({ partida_id: pid, fecha, cantidad_dia: v, hito_id: hito }),
      }),
    onSuccess: invalidar, onError: (e: Error) => { alert(e.message); invalidar() },
  })
  // «Iniciar historial»: la fecha elegida crea la actividad en el LookAhead
  // (queda conectada a Programación desde el día 1, con su prorrateo).
  const iniciar = useMutation({
    mutationFn: ({ p, fecha, fin }: { p: PartidaH; fecha: string; fin: string }) =>
      api('/ev/programacion/actividades', {
        method: 'POST',
        body: JSON.stringify({
          titulo: (p.descripcion || p.codigo).slice(0, 200), otm_id: otm,
          partida_id: p.id, fecha, fecha_fin: fin || null,
          metrado_prog: p.metrado || null, und: p.unidad || null,
        }),
      }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  if (!otm) return <div className="text-k-text3 text-sm p-6">Elige un proyecto arriba para ver su historial de avance.</div>
  if (hist.isLoading) return <div className="flex items-center gap-2 text-k-text3 p-6"><Loader2 size={16} className="animate-spin" /> Cargando historial…</div>
  if (hist.error) return <div className="text-k-red text-sm p-6">{(hist.error as Error).message}</div>
  const d = hist.data
  if (!d || !d.partidas.length) return <div className="text-k-text3 text-sm p-6">Sin partidas hoja para {otm}.</div>

  const diasSemana = new Set(d.dias_semana ?? [1, 2, 3, 4, 5, 6, 7])
  const feriados = new Set(d.feriados ?? [])
  const laborable = (f: string) => diasSemana.has(isoDow(f)) && !feriados.has(f)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-k-text3">
          Historial <b className="text-k-text2">{fmtCorta(d.desde)} → {fmtCorta(d.hasta)}</b> — cada celda registra el avance REAL del día
          (misma fuente que el LookAhead; el % EV se recalcula solo).
        </span>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          title="Ver el historial desde otra fecha"
          className="bg-k-void border border-k-border rounded px-2 py-1 text-[11px] text-k-text outline-none focus:border-k-amber" />
        {desde && <button onClick={() => setDesde('')} className="text-[11px] text-k-blue hover:underline">inicio real</button>}
        {d.truncado && (
          <span className="text-[11px] text-amber-300/90">⚠ Ventana de 26 semanas — usa el selector de fecha para ver más atrás.</span>
        )}
      </div>

      <div className="overflow-x-auto border border-k-border rounded-lg">
        <table className="border-collapse min-w-max">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-10 min-w-[240px] text-left`} rowSpan={2}>PARTIDA / ETAPA</th>
              <th className={th} rowSpan={2}>METRADO</th>
              <th className={th} rowSpan={2}>ACUM</th>
              <th className={th} rowSpan={2}>SALDO</th>
              {d.semanas.map(s => (
                <th key={s.lunes} colSpan={7} className={`${th} border-b-0 text-k-amber`}>
                  {fmtCorta(s.lunes)} – {fmtCorta(s.domingo)}
                </th>
              ))}
            </tr>
            <tr>
              {d.fechas.map(f => {
                const lab = laborable(f)
                return (
                  <th key={f} title={f}
                    className={`${th} min-w-[44px] font-mono ${f === d.hoy ? 'text-k-green' : ''} ${!lab ? 'text-k-text3 line-through opacity-60' : ''}`}>
                    {DIAS_1[isoDow(f) - 1]}<br /><span className="text-[9px]">{f.slice(8, 10)}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {d.partidas.map(p => {
              const filas = []
              filas.push(
                <tr key={`p-${p.id}`}>
                  <td colSpan={4 + d.fechas.length}
                    className="border border-k-border px-2 py-1.5 text-[11px] bg-k-raised/60 sticky left-0">
                    <span className="font-mono font-bold text-k-text">{p.codigo}</span>
                    <span className="text-k-text2 ml-2">{p.descripcion}</span>
                    <span className="text-k-text3 ml-2 text-[10px]">{p.unidad ?? ''} · meta {num(p.metrado)}</span>
                    {p.primer_registro && (
                      <span className="text-k-text3 ml-2 text-[10px]" title="Primer registro (avance o HH de tareo)">
                        ▸ inicia {fmtCorta(p.primer_registro)}
                      </span>
                    )}
                  </td>
                </tr>
              )
              if (p.sin_registros && !p.etapas.some(e => e.actividades.length)) {
                filas.push(<FilaIniciar key={`ini-${p.id}`} p={p} nCols={4 + d.fechas.length}
                  onIniciar={(fecha, fin) => iniciar.mutate({ p, fecha, fin })} guardando={iniciar.isPending} />)
              }
              for (const e of p.etapas) {
                const saltos = new Set(e.actividades.flatMap(a => a.dias_salto))
                const medios = new Set(e.actividades.flatMap(a => a.dias_medio))
                const acum = Object.values(e.real).reduce((s, v) => s + v, 0)
                const etiqueta = e.hito_id == null
                  ? (p.etapas.length > 1 ? 'Ejecución (principal)' : 'Avance diario')
                  : `${e.hito_desc ?? 'Etapa'}${e.hito_peso != null ? ` (${Math.round(e.hito_peso * 100)}%)` : ''}`
                filas.push(
                  <tr key={`e-${p.id}-${e.hito_id ?? 0}`}>
                    <td className="border border-k-border px-2 py-1 text-[10px] bg-k-surface sticky left-0 z-10">
                      <span className={e.hito_id == null ? 'text-sky-300' : 'text-violet-300'}>
                        {e.hito_id == null ? '●' : '◆'} {etiqueta}
                      </span>
                    </td>
                    <td className="border border-k-border px-1 py-1 text-center text-[10px] font-mono text-k-text2">{num(p.metrado)}</td>
                    <td className="border border-k-border px-1 py-1 text-center text-[10px] font-mono text-k-green">{acum > 0 ? num(acum) : '—'}</td>
                    <td className="border border-k-border px-1 py-1 text-center text-[10px] font-mono text-k-text2">{p.metrado > 0 ? num(Math.max(p.metrado - acum, 0)) : '—'}</td>
                    {d.fechas.map(f => (
                      <CeldaDia key={f}
                        prog={e.prog[f]} real={e.real[f]}
                        editable={f <= d.hoy}
                        esSalto={saltos.has(f)} esMedio={medios.has(f)}
                        laborable={laborable(f)}
                        onRegistrar={v => guardar.mutate({ pid: p.id, hito: e.hito_id, fecha: f, v })}
                      />
                    ))}
                  </tr>
                )
              }
              const tieneHH = Object.keys(p.hh).length > 0
              if (tieneHH) {
                filas.push(
                  <tr key={`hh-${p.id}`}>
                    <td className="border border-k-border px-2 py-0.5 text-[9px] text-k-text3 bg-k-surface sticky left-0 z-10">HH tareo</td>
                    <td colSpan={3} className="border border-k-border" />
                    {d.fechas.map(f => (
                      <td key={f} className="border border-k-border/60 px-0.5 text-center text-[9px] font-mono text-amber-300/70">
                        {p.hh[f] != null ? num(p.hh[f]) : ''}
                      </td>
                    ))}
                  </tr>
                )
              }
              return filas
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-k-text3 flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="text-sky-300">celeste</span> = programado (línea base)</span>
        <span><span className="text-green-300">verde</span>/<span className="text-amber-300">ámbar</span>/<span className="text-red-300">rojo</span> = real vs programado</span>
        <span>✓ = registrado · ◐ = medio día · ∅ = salto · tachado = no laborable</span>
        <span>Es el mismo avance diario del LookAhead: registrar aquí re-prorratea la actividad vinculada y alimenta el % EV (rollup automático).</span>
      </div>
    </div>
  )
}

// Partida sin ningún registro: se pide la fecha de inicio y con ella se CREA
// la actividad programada (decisión Jean 2026-07-18: conectada desde el día 1).
function FilaIniciar({ p, nCols, onIniciar, guardando }: {
  p: PartidaH; nCols: number
  onIniciar: (fecha: string, fin: string) => void; guardando: boolean
}) {
  const [fecha, setFecha] = useState('')
  const [fin, setFin] = useState('')
  return (
    <tr>
      <td colSpan={nCols} className="border border-k-border px-2 py-1.5 bg-amber-500/5">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <PlayCircle size={13} className="text-k-amber" />
          <span className="text-k-text2">Sin registros aún — indica la fecha de inicio para programarla en el LookAhead:</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-k-void border border-k-border rounded px-2 py-0.5 text-[11px] text-k-text outline-none focus:border-k-amber" />
          <span className="text-k-text3">F.Fin (opcional)</span>
          <input type="date" value={fin} onChange={e => setFin(e.target.value)}
            className="bg-k-void border border-k-border rounded px-2 py-0.5 text-[11px] text-k-text outline-none focus:border-k-amber" />
          <button disabled={!fecha || guardando} onClick={() => onIniciar(fecha, fin)}
            className="px-2 py-0.5 rounded bg-k-amber/20 border border-k-amber/40 text-k-amber font-semibold disabled:opacity-40">
            Iniciar historial
          </button>
          <span className="text-k-text3">(meta {num(p.metrado)} {p.unidad ?? ''} del presupuesto, prorrateada si das F.Fin)</span>
        </div>
      </td>
    </tr>
  )
}
