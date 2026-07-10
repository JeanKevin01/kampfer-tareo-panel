import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Lock, Unlock, Upload, Trash2, X, Calendar } from 'lucide-react'
import { api } from '@/lib/api'

const PROYECTO_ID = 1
const RECURSOS = ['MAT', 'EQP', 'EQT', 'SUB', 'DIR', 'GG'] as const
const TIPOS_DOC = ['FACTURA', 'OC', 'VALE', 'OTRO'] as const

interface Periodo { id: number; anio: number; mes: number; tipo_cambio: number; estado: string }
interface Doc {
  id: number; periodo_id: number; anio: number; mes: number; tipo_doc: string
  proveedor?: string; numero_doc?: string; fecha?: string; tipo_recurso: string
  directo: boolean; fase?: string; moneda: string; monto: number; glosa?: string; fuente: string
}

const fmt = (n: number) => (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber'

export default function Costos() {
  const qc = useQueryClient()
  const [perSel, setPerSel] = useState<number | 0>(0)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState({ tipo_doc: 'FACTURA', proveedor: '', numero_doc: '',
    fecha: new Date().toISOString().slice(0, 10), tipo_recurso: 'MAT', directo: true,
    fase: '', moneda: 'PEN', monto: '', glosa: '' })
  const [msg, setMsg] = useState('')

  const periodos = useQuery<Periodo[]>({
    queryKey: ['periodos'],
    queryFn: () => api(`/ev/periodos?proyecto_id=${PROYECTO_ID}`),
  })
  const docs = useQuery<{ documentos: Doc[]; total: number; n: number }>({
    queryKey: ['costo-docs', perSel],
    queryFn: () => api(`/ev/ro/costos?proyecto_id=${PROYECTO_ID}${perSel ? `&periodo_id=${perSel}` : ''}`),
  })

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['costo-docs'] }); qc.invalidateQueries({ queryKey: ['periodos'] }) }

  const alta = useMutation({
    mutationFn: () => api('/ev/ro/documentos', {
      method: 'POST',
      body: JSON.stringify({ ...form, proyecto_id: PROYECTO_ID, monto: Number(form.monto),
        fase: form.fase || null, proveedor: form.proveedor || null, glosa: form.glosa || null,
        numero_doc: form.numero_doc || null }),
    }),
    onSuccess: () => {
      invalidar(); setMsg('Documento registrado')
      setForm(f => ({ ...f, proveedor: '', numero_doc: '', monto: '', glosa: '' }))   // submit-y-seguir
      setTimeout(() => setMsg(''), 2500)
    },
    onError: (e: Error) => setMsg(e.message),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => api(`/ev/ro/documentos/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  const cerrar = useMutation({
    mutationFn: (p: Periodo) => api(`/ev/periodos/${p.id}/${p.estado === 'ABIERTO' ? 'cerrar' : 'reabrir'}`, { method: 'POST' }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  const crearPeriodo = useMutation({
    mutationFn: () => {
      const hoy = new Date()
      const tc = prompt('Tipo de cambio del mes (S/ por US$):', '3.75')
      return api('/ev/periodos', { method: 'POST', body: JSON.stringify({
        proyecto_id: PROYECTO_ID, anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
        tipo_cambio: Number(tc) || 1 }) })
    },
    onSuccess: invalidar,
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-k-text">Costos · documentos</h1>
          <p className="text-k-text2 text-sm">Facturas, OC y vales por periodo. La MO sale del tareo × tarifa (ajuste de planilla en el RO).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <Upload size={14} /> Importar Excel
          </button>
          <button onClick={() => crearPeriodo.mutate()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber text-black font-bold hover:bg-k-amber2">
            <Calendar size={14} /> Crear mes actual
          </button>
        </div>
      </div>

      {/* Periodos */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPerSel(0)}
          className={`text-xs px-3 py-1.5 rounded-lg border ${perSel === 0 ? 'border-k-amber text-k-amber' : 'border-k-border text-k-text3'}`}>
          Todos
        </button>
        {(periodos.data ?? []).map(p => (
          <div key={p.id} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
            perSel === p.id ? 'border-k-amber bg-amber-500/10 text-k-amber' : 'border-k-border text-k-text2'}`}
            onClick={() => setPerSel(p.id)}>
            {MESES[p.mes]} {p.anio} · TC {p.tipo_cambio}
            <button title={p.estado === 'ABIERTO' ? 'Cerrar mes' : 'Reabrir (admin)'}
              onClick={e => { e.stopPropagation(); if (confirm(`¿${p.estado === 'ABIERTO' ? 'Cerrar' : 'Reabrir'} ${MESES[p.mes]} ${p.anio}?`)) cerrar.mutate(p) }}
              className={p.estado === 'ABIERTO' ? 'text-k-green' : 'text-k-red'}>
              {p.estado === 'ABIERTO' ? <Unlock size={12} /> : <Lock size={12} />}
            </button>
          </div>
        ))}
      </div>

      {/* Alta rápida */}
      <div className="bg-k-surface border border-k-border rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={form.tipo_doc} onChange={e => setForm({ ...form, tipo_doc: e.target.value })} className={inputCls}>
            {TIPOS_DOC.map(t => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Proveedor" value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} className={inputCls} />
          <input placeholder="Nº doc" value={form.numero_doc} onChange={e => setForm({ ...form, numero_doc: e.target.value })} className={inputCls} />
          <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
          <select value={form.tipo_recurso} onChange={e => setForm({ ...form, tipo_recurso: e.target.value, directo: !['DIR', 'GG'].includes(e.target.value) })} className={inputCls}>
            {RECURSOS.map(t => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Fase (ej. 11)" value={form.fase} onChange={e => setForm({ ...form, fase: e.target.value })} className={inputCls} />
          <select value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })} className={inputCls}>
            <option>PEN</option><option>USD</option>
          </select>
          <input type="number" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputCls} />
          <input placeholder="Glosa" value={form.glosa} onChange={e => setForm({ ...form, glosa: e.target.value })} className={`${inputCls} col-span-1`} />
          <button onClick={() => alta.mutate()} disabled={alta.isPending || !form.monto}
            className="flex items-center justify-center gap-1.5 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm rounded-lg disabled:opacity-40">
            {alta.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Registrar
          </button>
        </div>
        {msg && <p className="text-xs mt-2 text-k-green">{msg}</p>}
      </div>

      {/* Tabla */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-k-border text-sm text-k-text2">
          {docs.data ? <>{docs.data.n} documentos · Total <b className="text-k-text">S/ {fmt(docs.data.total)}</b></> : 'Cargando…'}
        </div>
        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-k-surface">
              <tr className="text-k-text3 uppercase border-b border-k-border">
                <th className="text-left px-3 py-2">Periodo</th><th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Proveedor</th><th className="text-left px-3 py-2">Nº</th>
                <th className="text-left px-3 py-2">Recurso</th><th className="text-left px-3 py-2">Fase</th>
                <th className="text-right px-3 py-2">Monto</th><th className="text-left px-3 py-2">Glosa</th>
                <th className="text-left px-3 py-2">Fuente</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(docs.data?.documentos ?? []).map(d => (
                <tr key={d.id} className="border-b border-k-border/40 hover:bg-k-raised/40">
                  <td className="px-3 py-1.5 text-k-text3">{MESES[d.mes]} {d.anio}</td>
                  <td className="px-3 py-1.5 text-k-text2">{d.tipo_doc}</td>
                  <td className="px-3 py-1.5 text-k-text2">{d.proveedor}</td>
                  <td className="px-3 py-1.5 font-mono text-k-text3">{d.numero_doc}</td>
                  <td className="px-3 py-1.5"><span className={d.directo ? 'text-k-green' : 'text-k-amber'}>{d.tipo_recurso}</span></td>
                  <td className="px-3 py-1.5 text-k-text2">{d.fase}</td>
                  <td className="px-3 py-1.5 text-right text-k-text">{d.moneda === 'USD' ? '$' : 'S/'} {fmt(d.monto)}</td>
                  <td className="px-3 py-1.5 text-k-text3 max-w-[200px] truncate">{d.glosa}</td>
                  <td className="px-3 py-1.5 text-k-text3">{d.fuente}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => { if (confirm('¿Eliminar documento?')) borrar.mutate(d.id) }}
                      className="text-k-text3 hover:text-k-red"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {(docs.data?.documentos ?? []).length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-k-text3">Sin documentos en este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && <ModalImport onClose={() => { setShowImport(false); invalidar() }} />}
    </div>
  )
}

function ModalImport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ resumen: { filas: number; total: number; errores: string[] } } | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const subir = useMutation({
    mutationFn: (confirmar: boolean) => {
      const fd = new FormData(); fd.append('file', file!)
      return api(`/ev/ro/costos/importar?proyecto_id=${PROYECTO_ID}&confirmar=${confirmar}`,
        { method: 'POST', body: fd })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[560px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-k-text">Importar documentos (.xlsx)</h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-k-text3 mb-3">
          Columnas: PROVEEDOR, NUMERO_DOC, FECHA (YYYY-MM-DD), TIPO_DOC, TIPO_RECURSO, DIRECTO, FASE, MONEDA, MONTO, GLOSA.
          Reimportar el mismo archivo REEMPLAZA sus documentos (idempotente).
        </p>
        <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber text-black font-bold cursor-pointer w-fit mb-3">
          <Upload size={14} /> {file ? file.name : 'Elegir archivo'}
          <input type="file" accept=".xlsx" className="hidden"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(''); setOk('') }} />
        </label>
        {file && !preview && (
          <button onClick={() => subir.mutate(false, { onSuccess: j => setPreview(j as never) })}
            disabled={subir.isPending}
            className="w-full border border-k-border bg-k-raised text-k-text text-sm font-bold py-2 rounded-lg mb-2">
            Analizar (no guarda)
          </button>
        )}
        {error && <p className="text-k-red text-xs mb-2 whitespace-pre-wrap">{error}</p>}
        {ok && <p className="text-k-green text-sm mb-2">{ok}</p>}
        {preview && !ok && (
          <>
            <p className="text-sm text-k-text2 mb-2">
              {preview.resumen.filas} filas · Total S/ {fmt(preview.resumen.total)}
              {preview.resumen.errores.length > 0 && <span className="text-k-red"> · {preview.resumen.errores.length} errores</span>}
            </p>
            {preview.resumen.errores.slice(0, 8).map((e, i) => <p key={i} className="text-[11px] text-k-red">· {e}</p>)}
            <button onClick={() => subir.mutate(true, { onSuccess: () => setOk('Importado ✓') })}
              disabled={subir.isPending || preview.resumen.errores.length > 0}
              className="w-full bg-k-amber text-black font-bold text-sm py-2.5 rounded-lg mt-2 disabled:opacity-40">
              Confirmar import
            </button>
          </>
        )}
      </div>
    </div>
  )
}
