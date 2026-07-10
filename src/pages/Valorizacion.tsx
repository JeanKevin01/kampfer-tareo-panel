import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Send, CheckCircle2, Undo2 } from 'lucide-react'
import { api } from '@/lib/api'

const PROYECTO_ID = 1
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fmt = (n: number) => (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })

interface Val { id: number; periodo_id: number; anio: number; mes: number; estado: string; total: number; nota?: string }
interface Linea { partida_id: number; codigo: string; descripcion?: string; unidad?: string; fase?: string; cantidad: number; pu: number; parcial: number }
interface Periodo { id: number; anio: number; mes: number; estado: string }

const ESTADO_CLR: Record<string, string> = {
  BORRADOR: 'text-k-amber bg-amber-500/10 border-amber-500/20',
  PRESENTADA: 'text-k-blue bg-blue-500/10 border-blue-500/20',
  APROBADA: 'text-k-green bg-green-500/10 border-green-500/20',
}

export default function Valorizacion() {
  const qc = useQueryClient()
  const [sel, setSel] = useState<number | null>(null)

  const lista = useQuery<Val[]>({
    queryKey: ['valorizaciones'],
    queryFn: () => api(`/ev/valorizaciones?proyecto_id=${PROYECTO_ID}`),
  })
  const periodos = useQuery<Periodo[]>({
    queryKey: ['periodos'],
    queryFn: () => api(`/ev/periodos?proyecto_id=${PROYECTO_ID}`),
  })

  const crear = useMutation({
    mutationFn: (periodo_id: number) => api('/ev/valorizaciones', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, periodo_id }),
    }) as Promise<{ id: number }>,
    onSuccess: (j) => { qc.invalidateQueries({ queryKey: ['valorizaciones'] }); setSel(j.id) },
    onError: (e: Error) => alert(e.message),
  })

  const abiertos = (periodos.data ?? []).filter(p =>
    p.estado === 'ABIERTO' && !(lista.data ?? []).some(v => v.periodo_id === p.id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-k-text">Valorización mensual</h1>
          <p className="text-k-text2 text-sm">Consolidado del mes para el cliente. Al APROBAR gobierna la venta contractual del RO.</p>
        </div>
        {abiertos.length > 0 && (
          <button onClick={() => crear.mutate(abiertos[abiertos.length - 1].id)} disabled={crear.isPending}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber text-black font-bold hover:bg-k-amber2 disabled:opacity-50">
            <Plus size={14} /> Crear ({MESES[abiertos[abiertos.length - 1].mes]} {abiertos[abiertos.length - 1].anio})
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(lista.data ?? []).map(v => (
          <button key={v.id} onClick={() => setSel(v.id)}
            className={`text-left rounded-xl border px-4 py-3 min-w-[160px] ${
              sel === v.id ? 'border-k-amber bg-amber-500/10' : 'border-k-border bg-k-surface hover:bg-k-raised'}`}>
            <div className="font-bold text-k-text">{MESES[v.mes]} {v.anio}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ESTADO_CLR[v.estado]}`}>{v.estado}</span>
              <span className="text-[11px] text-k-text3">S/ {fmt(v.total)}</span>
            </div>
          </button>
        ))}
        {(lista.data ?? []).length === 0 && <p className="text-k-text3 text-sm">Sin valorizaciones aún.</p>}
      </div>

      {sel != null && <Detalle vid={sel} onChange={() => qc.invalidateQueries({ queryKey: ['valorizaciones'] })} />}
    </div>
  )
}

function Detalle({ vid, onChange }: { vid: number; onChange: () => void }) {
  const qc = useQueryClient()
  const det = useQuery<{ valorizacion: Val & { estado: string }; lineas: Linea[]; total: number }>({
    queryKey: ['valorizacion', vid],
    queryFn: () => api(`/ev/valorizaciones/${vid}`),
  })
  const [rows, setRows] = useState<Linea[]>([])
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (det.data) { setRows(det.data.lineas.map(l => ({ ...l }))); setDirty(false) }
  }, [det.data])

  const esBorrador = det.data?.valorizacion.estado === 'BORRADOR'
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['valorizacion', vid] }); onChange() }

  const guardar = useMutation({
    mutationFn: () => api(`/ev/valorizaciones/${vid}/lineas`, {
      method: 'PUT', body: JSON.stringify({ lineas: rows.map(r => ({ partida_id: r.partida_id, cantidad: r.cantidad, pu: r.pu })) }),
    }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })
  const transicion = useMutation({
    mutationFn: (accion: string) => api(`/ev/valorizaciones/${vid}/estado`, {
      method: 'POST', body: JSON.stringify({ accion }),
    }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  if (det.isLoading) return <Loader2 className="animate-spin text-k-text3" />
  if (!det.data) return null
  const v = det.data.valorizacion
  const total = rows.reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(r.pu) || 0), 0)

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-k-border flex-wrap gap-2">
        <div className="text-sm text-k-text2">
          <b className="text-k-text">{MESES[v.mes]} {v.anio}</b> · {v.estado} ·
          <span className="text-k-amber font-bold"> Total S/ {fmt(total)}</span>
        </div>
        <div className="flex gap-2">
          {esBorrador && (
            <button onClick={() => guardar.mutate()} disabled={!dirty || guardar.isPending}
              className="text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border disabled:opacity-40">
              Guardar cambios
            </button>
          )}
          {esBorrador && (
            <button onClick={() => transicion.mutate('presentar')}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-blue/90 text-white font-bold hover:bg-k-blue">
              <Send size={14} /> Presentar
            </button>
          )}
          {v.estado === 'PRESENTADA' && (
            <>
              <button onClick={() => transicion.mutate('devolver')}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised">
                <Undo2 size={14} /> Devolver
              </button>
              <button onClick={() => { if (confirm('¿Aprobar? La venta del mes quedará gobernada por esta valorización.')) transicion.mutate('aprobar') }}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-green/90 text-black font-bold hover:bg-k-green">
                <CheckCircle2 size={14} /> Aprobar
              </button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-k-surface"><tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
            <th className="text-left px-3 py-2">Código</th><th className="text-left px-3 py-2">Descripción</th>
            <th className="text-left px-3 py-2">Und</th><th className="text-right px-3 py-2">Cantidad</th>
            <th className="text-right px-3 py-2">PU</th><th className="text-right px-3 py-2">Parcial</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.partida_id} className="border-b border-k-border/40">
                <td className="px-3 py-1.5 font-mono text-k-text2">{r.codigo}</td>
                <td className="px-3 py-1.5 text-k-text2 max-w-[280px] truncate">{r.descripcion}</td>
                <td className="px-3 py-1.5 text-k-text3">{r.unidad}</td>
                <td className="px-3 py-1.5 text-right">
                  {esBorrador
                    ? <input type="number" value={r.cantidad}
                        onChange={e => { const v2 = Number(e.target.value) || 0; setRows(p => p.map((x, j) => j === i ? { ...x, cantidad: v2 } : x)); setDirty(true) }}
                        className="w-24 bg-k-raised border border-k-border rounded px-2 py-1 text-right text-k-text" />
                    : <span className="text-k-text2">{fmt(r.cantidad)}</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {esBorrador
                    ? <input type="number" value={r.pu}
                        onChange={e => { const v2 = Number(e.target.value) || 0; setRows(p => p.map((x, j) => j === i ? { ...x, pu: v2 } : x)); setDirty(true) }}
                        className="w-24 bg-k-raised border border-k-border rounded px-2 py-1 text-right text-k-text" />
                    : <span className="text-k-text2">{fmt(r.pu)}</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-k-text">{fmt((Number(r.cantidad) || 0) * (Number(r.pu) || 0))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-k-text3">
                Sin líneas (no hubo avance EV en el mes). Puedes agregarlas cuando haya avances.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
