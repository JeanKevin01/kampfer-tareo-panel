// ── Datos maestros · Documentos de costo ─────────────────────
// Lo que entra por el import .xlsx de Costos solo se podía BORRAR: para
// corregir una fase mal puesta o un monto había que rehacer el Excel entero.
// Aquí se edita fila por fila (PUT /ev/ro/documentos/{id}).
//
// El API exige periodo ABIERTO tanto en el origen como en el destino: mover un
// costo a un mes cerrado cambiaría un Resultado Operativo ya emitido.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Trash2, X, Search } from 'lucide-react'

import { api } from '@/lib/api'
import { RECURSOS, TIPOS_DOC, etiqueta } from '@/lib/catalogos'

const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'
const TD = 'px-3 py-2 text-xs text-k-text2'

interface Doc {
  id: number; proyecto_id: number; periodo_id: number; tipo_doc: string
  proveedor?: string | null; numero_doc?: string | null; fecha: string
  tipo_recurso: string; directo: boolean; fase?: string | null
  partida_id?: number | null; moneda: string; monto: number | string
  glosa?: string | null; fuente?: string | null
}

export default function CostosMaestro({ proyectoId = 1 }: { proyectoId?: number }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Doc | null>(null)
  const [err, setErr] = useState('')

  // OJO: el listado vive en /ev/ro/costos (el path /documentos solo tiene
  // POST/PUT/DELETE) — mismo shape {documentos, total, n}.
  const docs = useQuery<{ documentos: Doc[]; total: number; n: number }>({
    queryKey: ['costo-docs', 'maestro', proyectoId],
    queryFn: () => api(`/ev/ro/costos?proyecto_id=${proyectoId}`),
  })
  const fases = useQuery<{ codigo: string; nombre: string }[]>({
    queryKey: ['ev-fases'],
    queryFn: () => api(`/ev/fases?proyecto_id=${proyectoId}`),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['costo-docs'] })   // también la página Costos
    qc.invalidateQueries({ queryKey: ['ro'] })           // el RO cambia con el costo
  }
  const guardar = useMutation({
    mutationFn: (d: Doc) => api(`/ev/ro/documentos/${d.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        proyecto_id: d.proyecto_id, tipo_doc: d.tipo_doc, proveedor: d.proveedor || null,
        numero_doc: d.numero_doc || null, fecha: d.fecha, tipo_recurso: d.tipo_recurso,
        directo: d.directo, fase: d.fase || null, partida_id: d.partida_id ?? null,
        moneda: d.moneda, monto: Number(d.monto) || 0, glosa: d.glosa || null,
      }),
    }),
    onSuccess: () => { invalidar(); setEdit(null); setErr('') },
    onError: (e: Error) => setErr(e.message),
  })
  const borrar = useMutation({
    mutationFn: (id: number) => api(`/ev/ro/documentos/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar,
    onError: (e: Error) => alert(e.message),
  })

  const lista = (docs.data?.documentos ?? []).filter(d => {
    const t = q.trim().toLowerCase()
    if (!t) return true
    return [d.proveedor, d.numero_doc, d.glosa, d.fase, d.tipo_recurso]
      .some(v => (v ?? '').toString().toLowerCase().includes(t))
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
        <input placeholder="Buscar por proveedor, N° documento, glosa, fase o recurso…"
          value={q} onChange={e => setQ(e.target.value)}
          className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber" />
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-k-raised border-b border-k-border">
                {['Fecha', 'Tipo', 'Proveedor', 'N° doc', 'Recurso', 'D/I', 'Fase', 'Monto', 'Origen', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[11px] font-bold text-k-text3 uppercase text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.isLoading && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando…
                </td></tr>
              )}
              {lista.map(d => (
                <tr key={d.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40">
                  <td className={TD}>{d.fecha}</td>
                  <td className={TD}>{etiqueta(TIPOS_DOC, d.tipo_doc)}</td>
                  <td className={`${TD} max-w-[180px] truncate`} title={d.proveedor ?? ''}>{d.proveedor || '—'}</td>
                  <td className={`${TD} font-mono`}>{d.numero_doc || '—'}</td>
                  <td className={TD}>{etiqueta(RECURSOS, d.tipo_recurso)}</td>
                  <td className={TD}>{d.directo ? 'Directo' : 'Indirecto'}</td>
                  <td className={TD}>{d.fase || '—'}</td>
                  <td className={`${TD} text-right font-mono text-k-text`}>
                    {d.moneda} {Number(d.monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={TD}>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-k-raised border border-k-border">
                      {d.fuente === 'manual' ? 'manual' : 'import'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => { setEdit({ ...d }); setErr('') }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-k-blue bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-2 py-1 rounded-lg mr-1">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => {
                      if (window.confirm(`¿Eliminar el documento ${d.numero_doc || d.id}? El Resultado Operativo del mes cambiará.`)) borrar.mutate(d.id)
                    }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-k-red bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-2 py-1 rounded-lg">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
              {!docs.isLoading && lista.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-k-text3 text-sm">
                  No hay documentos de costo cargados.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!docs.isLoading && (
          <div className="px-3 py-2 border-t border-k-border bg-k-raised text-[11px] text-k-text3">
            {lista.length} de {docs.data?.n ?? 0} documentos · total {Number(docs.data?.total ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
        )}
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setEdit(null)}>
          <div className="bg-k-surface border border-k-border rounded-2xl w-full max-w-lg mt-10"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-k-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-k-text">Editar documento de costo</h3>
              <button onClick={() => setEdit(null)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={edit.fecha} onChange={e => setEdit({ ...edit, fecha: e.target.value })}
                  className={inputCls} title="El periodo se recalcula desde esta fecha" />
                <select value={edit.tipo_doc} onChange={e => setEdit({ ...edit, tipo_doc: e.target.value })}
                  className={inputCls}>
                  {Object.entries(TIPOS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Proveedor" value={edit.proveedor ?? ''}
                  onChange={e => setEdit({ ...edit, proveedor: e.target.value })} className={inputCls} />
                <input placeholder="N° de documento" value={edit.numero_doc ?? ''}
                  onChange={e => setEdit({ ...edit, numero_doc: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={edit.tipo_recurso} onChange={e => setEdit({ ...edit, tipo_recurso: e.target.value })}
                  className={inputCls}
                  title="La MO solo entra como ajuste de planilla: el resto sale del tareo × tarifa">
                  {Object.entries(RECURSOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={edit.directo ? '1' : '0'}
                  onChange={e => setEdit({ ...edit, directo: e.target.value === '1' })} className={inputCls}>
                  <option value="1">Costo directo</option>
                  <option value="0">Costo indirecto</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={edit.fase ?? ''} onChange={e => setEdit({ ...edit, fase: e.target.value })}
                  className={inputCls}
                  title="La fase es la clave con la que el RO cruza el costo con la meta">
                  <option value="">Sin fase</option>
                  {(fases.data ?? []).map(f => (
                    <option key={f.codigo} value={f.codigo}>{f.codigo} — {f.nombre}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select value={edit.moneda} onChange={e => setEdit({ ...edit, moneda: e.target.value })}
                    className={inputCls}>
                    <option value="PEN">PEN</option><option value="USD">USD</option>
                  </select>
                  <input value={String(edit.monto)} inputMode="decimal"
                    onChange={e => setEdit({ ...edit, monto: e.target.value })} className={inputCls} />
                </div>
              </div>
              <input placeholder="Glosa" value={edit.glosa ?? ''}
                onChange={e => setEdit({ ...edit, glosa: e.target.value })} className={inputCls} />
              {err && <p className="text-k-red text-xs">{err}</p>}
              <p className="text-[10px] text-k-text3">
                El mes se deduce de la fecha. Si el periodo de origen o el de destino está
                <b> cerrado</b>, el API no deja guardar: reábrelo primero desde Costos.
              </p>
              <button onClick={() => guardar.mutate(edit)} disabled={guardar.isPending}
                className="w-full bg-k-amber text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
                {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
