import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Loader2, Lock, Star, FileSpreadsheet, Save, Snowflake, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

import { API_BASE } from '@/lib/api'
const API = API_BASE
const PROYECTO_ID = 1   // TODO: vendrá del selector de proyecto (tenant) cuando se active el scoping

interface Presupuesto {
  id: number; proyecto_id: number; version: number; estado: 'BORRADOR' | 'CONGELADO'
  vigente: boolean; nota?: string | null; creado_en?: string; congelado_en?: string | null; lineas?: number
}
interface Linea {
  id?: number; codigo: string; descripcion?: string | null; unidad?: string | null
  fase?: string | null; sub_fase?: string | null
  metrado: number; precio_unitario: number; hh_meta: number
}

const fmt = (n: number) => (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })

export default function Presupuesto() {
  const qc = useQueryClient()
  const [selId, setSelId] = useState<number | null>(null)
  const [showCrear, setShowCrear] = useState(false)
  const [nota, setNota] = useState('')
  const [sembrar, setSembrar] = useState(true)
  const [rows, setRows] = useState<Linea[]>([])
  const [dirty, setDirty] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [filasImport, setFilasImport] = useState<Linea[]>([])
  const [importError, setImportError] = useState('')

  const versiones = useQuery<Presupuesto[]>({
    queryKey: ['presupuestos'],
    queryFn: () => fetch(`${API}/ev/presupuesto?proyecto_id=${PROYECTO_ID}`).then(r => r.json()),
  })

  const detalle = useQuery<{ presupuesto: Presupuesto; partidas: Linea[] }>({
    queryKey: ['presupuesto', selId],
    queryFn: () => fetch(`${API}/ev/presupuesto/${selId}`).then(r => r.json()),
    enabled: selId != null,
  })

  // al cargar el detalle, copiar líneas a estado editable
  useEffect(() => {
    if (detalle.data?.partidas) { setRows(detalle.data.partidas.map(p => ({ ...p }))); setDirty(false) }
  }, [detalle.data])

  const pres = detalle.data?.presupuesto
  const esBorrador = pres?.estado === 'BORRADOR'

  const totales = useMemo(() => {
    const hh = rows.reduce((s, r) => s + (Number(r.hh_meta) || 0), 0)
    const venta = rows.reduce((s, r) => s + (Number(r.metrado) || 0) * (Number(r.precio_unitario) || 0), 0)
    return { hh, venta }
  }, [rows])

  const crear = useMutation({
    mutationFn: () => fetch(`${API}/ev/presupuesto`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: PROYECTO_ID, nota, sembrar }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: (j) => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); setShowCrear(false); setNota(''); setSelId(j.id) },
  })

  const guardar = useMutation({
    mutationFn: () => fetch(`${API}/ev/presupuesto/${selId}/partidas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partidas: rows }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ['presupuestos'] }); qc.invalidateQueries({ queryKey: ['presupuesto', selId] }) },
  })

  const congelar = useMutation({
    mutationFn: () => fetch(`${API}/ev/presupuesto/${selId}/congelar`, { method: 'POST' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: (j) => {
      alert(`Congelado y activado.\nLíneas sincronizadas a ev_partidas: ${j.sincronizadas}` +
            (j.no_encontradas ? `\nNo encontradas (código sin partida): ${j.no_encontradas}` : ''))
      qc.invalidateQueries({ queryKey: ['presupuestos'] }); qc.invalidateQueries({ queryKey: ['presupuesto', selId] })
    },
    onError: (e: Error) => alert(e.message),
  })

  function descargarPlantilla() {
    const datos = [
      { CODIGO: '10.01', DESCRIPCION: 'Movilización', UNIDAD: 'GLB', FASE: '10', SUB_FASE: '10.01', METRADO: 1, PRECIO_UNITARIO: 2500, HH_META: 200 },
      { CODIGO: '40.01.01', DESCRIPCION: 'Acero en zapatas', UNIDAD: 'KG', FASE: '40', SUB_FASE: '40.01', METRADO: 168375, PRECIO_UNITARIO: 2.5, HH_META: 12576 },
    ]
    const ws = XLSX.utils.json_to_sheet(datos, { header: ['CODIGO', 'DESCRIPCION', 'UNIDAD', 'FASE', 'SUB_FASE', 'METRADO', 'PRECIO_UNITARIO', 'HH_META'] })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto')
    XLSX.writeFile(wb, 'plantilla_presupuesto.xlsx')
  }

  function parseArchivo(file: File) {
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
        const num = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0
        const filas: Linea[] = raw.map(r => ({
          codigo: String(r.CODIGO ?? r.codigo ?? '').trim(),
          descripcion: String(r.DESCRIPCION ?? r.descripcion ?? '').trim() || null,
          unidad: String(r.UNIDAD ?? r.unidad ?? '').trim() || null,
          fase: String(r.FASE ?? r.fase ?? '').trim() || null,
          sub_fase: String(r.SUB_FASE ?? r.sub_fase ?? '').trim() || null,
          metrado: num(r.METRADO ?? r.metrado),
          precio_unitario: num(r.PRECIO_UNITARIO ?? r.precio_unitario ?? r.PU),
          hh_meta: num(r.HH_META ?? r.hh_meta),
        })).filter(f => f.codigo)
        if (filas.length === 0) { setImportError('No se encontraron filas con CODIGO. Revisa los encabezados.'); return }
        setFilasImport(filas)
      } catch {
        setImportError('No se pudo leer el archivo. ¿Es un .xlsx válido?')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = useMutation({
    mutationFn: () => fetch(`${API}/ev/presupuesto/${selId}/partidas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partidas: filasImport }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: () => {
      setShowImport(false); setFilasImport([])
      qc.invalidateQueries({ queryKey: ['presupuestos'] }); qc.invalidateQueries({ queryKey: ['presupuesto', selId] })
    },
    onError: (e: Error) => setImportError(e.message),
  })

  function editar(i: number, campo: 'metrado' | 'precio_unitario' | 'hh_meta', valor: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [campo]: Number(valor) || 0 } : r))
    setDirty(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-k-text">Presupuesto · línea base</h1>
          <p className="text-k-text2 text-sm">Versiones del presupuesto del proyecto. Al <b>congelar</b> se activa y sincroniza metas/PU al control.</p>
        </div>
        <button onClick={() => setShowCrear(true)}
          className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Nueva versión
        </button>
      </div>

      {/* Versiones */}
      {versiones.isLoading ? <Loader2 className="animate-spin text-k-text3" /> : (
        <div className="flex flex-wrap gap-3">
          {(versiones.data ?? []).map(v => (
            <button key={v.id} onClick={() => setSelId(v.id)}
              className={`text-left rounded-xl border px-4 py-3 min-w-[170px] transition-colors ${
                selId === v.id ? 'border-k-amber bg-amber-500/10' : 'border-k-border bg-k-surface hover:bg-k-raised'}`}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-k-text3" />
                <span className="font-bold text-k-text">Versión {v.version}</span>
                {v.vigente && <Star size={13} className="text-k-amber" />}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  v.estado === 'CONGELADO' ? 'text-k-blue bg-blue-500/10 border-blue-500/20' : 'text-k-amber bg-amber-500/10 border-amber-500/20'}`}>
                  {v.estado}{v.estado === 'CONGELADO' && ' '}{v.estado === 'CONGELADO' && <Lock size={9} className="inline" />}
                </span>
                <span className="text-[11px] text-k-text3">{v.lineas ?? 0} líneas</span>
              </div>
            </button>
          ))}
          {(versiones.data ?? []).length === 0 && <p className="text-k-text3 text-sm">Aún no hay versiones. Crea la primera (puedes sembrarla desde las partidas actuales).</p>}
        </div>
      )}

      {/* Detalle de la versión seleccionada */}
      {selId != null && (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-k-border">
            <div className="text-sm text-k-text2">
              {detalle.isLoading ? 'Cargando…' : <>
                <b className="text-k-text">Versión {pres?.version}</b> · {pres?.estado}
                {pres?.vigente && <span className="text-k-amber"> · vigente</span>}
                <span className="text-k-text3"> · HH meta {fmt(totales.hh)} · Venta S/ {fmt(totales.venta)}</span>
              </>}
            </div>
            <div className="flex items-center gap-2">
              {esBorrador && (
                <button onClick={() => { setFilasImport([]); setImportError(''); setShowImport(true) }}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
                  <Upload size={14} /> Importar Excel
                </button>
              )}
              {esBorrador && (
                <button onClick={() => guardar.mutate()} disabled={!dirty || guardar.isPending}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border disabled:opacity-40">
                  {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                </button>
              )}
              {esBorrador && (
                <button onClick={() => { if (confirm('¿Congelar esta versión? Quedará inmutable, se activará y sincronizará al control. Para cambiar luego, crea una versión nueva.')) congelar.mutate() }}
                  disabled={congelar.isPending}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-blue/90 hover:bg-k-blue text-white font-bold disabled:opacity-40">
                  {congelar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Snowflake size={14} />} Congelar y activar
                </button>
              )}
              {!esBorrador && <span className="flex items-center gap-1.5 text-sm text-k-text3"><Lock size={14} /> Congelado (solo lectura)</span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-k-text3 border-b border-k-border">
                  <th className="text-left px-4 py-2">Código</th>
                  <th className="text-left px-4 py-2">Descripción</th>
                  <th className="text-left px-2 py-2">Und</th>
                  <th className="text-right px-2 py-2">Metrado</th>
                  <th className="text-right px-2 py-2">PU (S/)</th>
                  <th className="text-right px-2 py-2">HH meta</th>
                  <th className="text-right px-4 py-2">Venta (S/)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.codigo} className="border-b border-k-border/50 hover:bg-k-raised/40">
                    <td className="px-4 py-1.5 font-mono text-k-text2">{r.codigo}</td>
                    <td className="px-4 py-1.5 text-k-text2 max-w-[280px] truncate">{r.descripcion}</td>
                    <td className="px-2 py-1.5 text-k-text3">{r.unidad}</td>
                    <td className="px-2 py-1.5 text-right">{cell(esBorrador, r.metrado, v => editar(i, 'metrado', v))}</td>
                    <td className="px-2 py-1.5 text-right">{cell(esBorrador, r.precio_unitario, v => editar(i, 'precio_unitario', v))}</td>
                    <td className="px-2 py-1.5 text-right">{cell(esBorrador, r.hh_meta, v => editar(i, 'hh_meta', v))}</td>
                    <td className="px-4 py-1.5 text-right text-k-text">{fmt((Number(r.metrado) || 0) * (Number(r.precio_unitario) || 0))}</td>
                  </tr>
                ))}
                {rows.length === 0 && !detalle.isLoading && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-k-text3">Sin líneas. (Si la creaste sin sembrar, agrégalas o usa el importador.)</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowImport(false)}>
          <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[640px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-k-text">Importar líneas desde Excel</h2>
              <button onClick={() => setShowImport(false)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={descargarPlantilla}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
                <Download size={14} /> Descargar plantilla
              </button>
              <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber hover:bg-k-amber2 text-black font-bold cursor-pointer">
                <Upload size={14} /> Elegir archivo
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseArchivo(f) }} />
              </label>
            </div>
            {importError && <p className="text-k-red text-sm mb-3">{importError}</p>}
            {filasImport.length > 0 && (
              <>
                <p className="text-sm text-k-text2 mb-2">{filasImport.length} líneas detectadas (se agregan/actualizan por código):</p>
                <div className="border border-k-border rounded-lg overflow-auto max-h-[40vh] mb-4">
                  <table className="w-full text-xs">
                    <thead><tr className="text-k-text3 border-b border-k-border">
                      <th className="text-left px-2 py-1">Código</th><th className="text-left px-2 py-1">Descripción</th>
                      <th className="text-right px-2 py-1">Metrado</th><th className="text-right px-2 py-1">PU</th><th className="text-right px-2 py-1">HH meta</th>
                    </tr></thead>
                    <tbody>
                      {filasImport.slice(0, 100).map((f, i) => (
                        <tr key={i} className="border-b border-k-border/40">
                          <td className="px-2 py-1 font-mono text-k-text2">{f.codigo}</td>
                          <td className="px-2 py-1 text-k-text3 truncate max-w-[220px]">{f.descripcion}</td>
                          <td className="px-2 py-1 text-right">{fmt(f.metrado)}</td>
                          <td className="px-2 py-1 text-right">{fmt(f.precio_unitario)}</td>
                          <td className="px-2 py-1 text-right">{fmt(f.hh_meta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => importar.mutate()} disabled={importar.isPending}
                  className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {importar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar {filasImport.length} líneas
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal crear versión */}
      {showCrear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCrear(false)}>
          <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-k-text">Nueva versión de presupuesto</h2>
              <button onClick={() => setShowCrear(false)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <label className="block text-xs text-k-text3 mb-1">Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Presupuesto contractual v1"
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-3 outline-none focus:border-k-amber" />
            <label className="flex items-center gap-2 text-sm text-k-text2 mb-4">
              <input type="checkbox" checked={sembrar} onChange={e => setSembrar(e.target.checked)} />
              Sembrar desde las partidas actuales (recomendado)
            </label>
            {crear.isError && <p className="text-k-red text-sm mb-3">{(crear.error as Error).message}</p>}
            <button onClick={() => crear.mutate()} disabled={crear.isPending}
              className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {crear.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear versión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function cell(editable: boolean, value: number, onChange: (v: string) => void) {
  if (!editable) return <span className="text-k-text2">{fmt(value)}</span>
  return (
    <input type="number" value={value} onChange={e => onChange(e.target.value)}
      className="w-24 bg-k-raised border border-k-border rounded px-2 py-1 text-right text-k-text outline-none focus:border-k-amber" />
  )
}
