import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, Loader2, Lock, Star, FileSpreadsheet, Save, Snowflake, Upload,
  Download, ChevronRight, ChevronDown, Layers,
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { api, ApiError, apiBlob, descargarBlob } from '@/lib/api'
import { RECURSOS_APU, nombreLargo } from '@/lib/catalogos'

const PROYECTO_ID = 1   // TODO: vendrá del selector de proyecto (tenant) cuando se active el scoping

type Tipo = 'META' | 'CONTRACTUAL'

interface Presupuesto {
  id: number; proyecto_id: number; version: number; estado: 'BORRADOR' | 'CONGELADO'
  vigente: boolean; nota?: string | null; creado_en?: string; congelado_en?: string | null
  lineas?: number; tipo: Tipo; moneda?: string
}
interface Linea {
  id?: number; codigo: string; descripcion?: string | null; unidad?: string | null
  fase?: string | null; sub_fase?: string | null
  metrado: number; precio_unitario: number; hh_meta: number
  rendimiento_mo?: number | null; nivel?: number | null; parent_codigo?: string | null
  area?: string | null
}
interface RecursoAPU {
  id: number; tipo: 'MO' | 'MAT' | 'EQ' | 'SUB'; codigo?: string | null
  descripcion: string; unidad?: string | null; cuadrilla?: number | null
  cantidad: number; precio: number; parcial: number
  sub_codigo?: string | null; sub_descripcion?: string | null
}
interface ResumenImportPU {
  partidas: number; hojas: number; subpartidas: number; recursos: number
  hh_dia: number; hh_meta_total: number; costo_meta_total: number
  errores: string[]; avisos: string[]
}

const fmt = (n: number) => (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })
const TIPO_REC_CLR: Record<string, string> = {
  MO: 'text-k-green', MAT: 'text-k-blue', EQ: 'text-k-amber', SUB: 'text-purple-400',
}

export default function Presupuesto() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<Tipo>('CONTRACTUAL')
  const [selId, setSelId] = useState<number | null>(null)
  const [showCrear, setShowCrear] = useState(false)
  const [nota, setNota] = useState('')
  const [sembrar, setSembrar] = useState(true)
  const [rows, setRows] = useState<Linea[]>([])
  const [dirty, setDirty] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [filasImport, setFilasImport] = useState<Linea[]>([])
  const [importError, setImportError] = useState('')
  const [showImportPU, setShowImportPU] = useState(false)

  const versiones = useQuery<Presupuesto[]>({
    queryKey: ['presupuestos'],
    queryFn: () => api<Presupuesto[]>(`/ev/presupuesto?proyecto_id=${PROYECTO_ID}`),
  })
  const versionesTipo = (versiones.data ?? []).filter(v => (v.tipo ?? 'CONTRACTUAL') === tipo)

  const detalle = useQuery<{ presupuesto: Presupuesto; partidas: Linea[] }>({
    queryKey: ['presupuesto', selId],
    queryFn: () => api(`/ev/presupuesto/${selId}`),
    enabled: selId != null,
  })

  // al cargar el detalle, copiar líneas a estado editable
  useEffect(() => {
    if (detalle.data?.partidas) { setRows(detalle.data.partidas.map(p => ({ ...p }))); setDirty(false) }
  }, [detalle.data])

  const pres = detalle.data?.presupuesto
  const esMeta = pres?.tipo === 'META'
  // La META nace del import de la plantilla PU y no se edita línea a línea.
  const esBorrador = pres?.estado === 'BORRADOR' && !esMeta
  const mon = pres?.moneda === 'USD' ? '$' : 'S/'

  const totales = useMemo(() => {
    const hojas = rows.filter(r => (r.nivel ?? 1) >= 1 && (esMeta ? r.fase : true))
    const hh = hojas.reduce((s, r) => s + (Number(r.hh_meta) || 0), 0)
    const venta = hojas.reduce((s, r) => s + (Number(r.metrado) || 0) * (Number(r.precio_unitario) || 0), 0)
    return { hh, venta }
  }, [rows, esMeta])

  const crear = useMutation({
    mutationFn: () => api('/ev/presupuesto', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, nota, sembrar }),
    }) as Promise<{ id: number }>,
    onSuccess: (j) => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); setShowCrear(false); setNota(''); setSelId(j.id) },
  })

  const guardar = useMutation({
    mutationFn: () => api(`/ev/presupuesto/${selId}/partidas`, {
      method: 'POST', body: JSON.stringify({ partidas: rows }),
    }),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ['presupuestos'] }); qc.invalidateQueries({ queryKey: ['presupuesto', selId] }) },
  })

  const congelar = useMutation({
    mutationFn: () => api(`/ev/presupuesto/${selId}/congelar`, { method: 'POST' }) as
      Promise<{ sincronizadas: number; no_encontradas: number; tipo: Tipo; celdas_costo_meta: number }>,
    onSuccess: (j) => {
      alert(`Congelado y activado (${j.tipo}).\n` +
            (j.tipo === 'META'
              ? `HH meta sincronizadas a ${j.sincronizadas} partidas del control.\nCosto meta materializado: ${j.celdas_costo_meta} celdas (fase × recurso).`
              : `Líneas sincronizadas a ev_partidas: ${j.sincronizadas}`) +
            (j.no_encontradas ? `\nSin partida en el control (por código): ${j.no_encontradas}` : ''))
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
    mutationFn: () => api(`/ev/presupuesto/${selId}/partidas`, {
      method: 'POST', body: JSON.stringify({ partidas: filasImport }),
    }),
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

  const lineasVisibles = rows.filter(r => (r.nivel ?? 1) >= 1)
  const subpartidas = rows.filter(r => (r.nivel ?? 1) === 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-k-text">Presupuesto · líneas base</h1>
          <p className="text-k-text2 text-sm">
            <b>Meta</b> = costo interno con APU (del Excel PU) · <b>Contractual</b> = venta (PU cliente).
            Al <b>congelar</b> se activa y sincroniza al control.
          </p>
        </div>
        {tipo === 'CONTRACTUAL' ? (
          <button onClick={() => setShowCrear(true)}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={16} /> Nueva versión
          </button>
        ) : (
          <button onClick={() => setShowImportPU(true)}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            <Upload size={16} /> Importar plantilla PU (.xls)
          </button>
        )}
      </div>

      {/* Tabs Meta | Contractual */}
      <div className="flex gap-1 border-b border-k-border">
        {(['CONTRACTUAL', 'META'] as Tipo[]).map(t => (
          <button key={t} onClick={() => { setTipo(t); setSelId(null) }}
            className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
              tipo === t ? 'border-k-amber text-k-amber' : 'border-transparent text-k-text3 hover:text-k-text2'}`}>
            {t === 'META' ? 'Meta (costo)' : 'Contractual (venta)'}
          </button>
        ))}
      </div>

      {/* Versiones del tipo activo */}
      {versiones.isLoading ? <Loader2 className="animate-spin text-k-text3" /> : (
        <div className="flex flex-wrap gap-3">
          {versionesTipo.map(v => (
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
                <span className="text-[11px] text-k-text3">{v.lineas ?? 0} líneas · {v.moneda ?? 'PEN'}</span>
              </div>
            </button>
          ))}
          {versionesTipo.length === 0 && (
            <p className="text-k-text3 text-sm">
              {tipo === 'META'
                ? 'Aún no hay presupuesto META. Impórtalo desde la plantilla PU (.xls) del presupuesto.'
                : 'Aún no hay versiones. Crea la primera (puedes sembrarla desde las partidas actuales).'}
            </p>
          )}
        </div>
      )}

      {/* Detalle de la versión seleccionada */}
      {selId != null && (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-k-border">
            <div className="text-sm text-k-text2">
              {detalle.isLoading ? 'Cargando…' : <>
                <b className="text-k-text">Versión {pres?.version}</b> · {pres?.tipo} · {pres?.estado}
                {pres?.vigente && <span className="text-k-amber"> · vigente</span>}
                <span className="text-k-text3"> · HH meta {fmt(totales.hh)} · {esMeta ? 'Costo' : 'Venta'} {mon} {fmt(totales.venta)}</span>
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
              {pres?.estado === 'BORRADOR' && (
                <button onClick={() => { if (confirm('¿Congelar esta versión? Quedará inmutable, se activará y sincronizará al control. Para cambiar luego, crea/importa una versión nueva.')) congelar.mutate() }}
                  disabled={congelar.isPending}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-blue/90 hover:bg-k-blue text-white font-bold disabled:opacity-40">
                  {congelar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Snowflake size={14} />} Congelar y activar
                </button>
              )}
              {pres?.estado === 'CONGELADO' && <span className="flex items-center gap-1.5 text-sm text-k-text3"><Lock size={14} /> Congelado (solo lectura)</span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-k-text3 border-b border-k-border">
                  {esMeta && <th className="w-8"></th>}
                  <th className="text-left px-4 py-2">Código</th>
                  <th className="text-left px-4 py-2">Descripción</th>
                  <th className="text-left px-2 py-2">Und</th>
                  <th className="text-right px-2 py-2">Metrado</th>
                  <th className="text-right px-2 py-2">PU ({mon})</th>
                  <th className="text-right px-2 py-2">HH meta</th>
                  {esMeta && <th className="text-right px-2 py-2" title="rendimiento MO (und/día)">Rend. MO</th>}
                  <th className="text-right px-4 py-2">{esMeta ? 'Costo' : 'Venta'} ({mon})</th>
                </tr>
              </thead>
              <tbody>
                {lineasVisibles.map((r) => (
                  esMeta
                    ? <FilaMeta key={r.codigo} linea={r} />
                    : <FilaEditable key={r.codigo} linea={r} editable={esBorrador}
                        onEdit={(campo, v) => editar(rows.indexOf(r), campo, v)} />
                ))}
                {lineasVisibles.length === 0 && !detalle.isLoading && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-k-text3">Sin líneas. (Si la creaste sin sembrar, agrégalas o usa el importador.)</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {esMeta && subpartidas.length > 0 && (
            <div className="px-4 py-2 border-t border-k-border text-[11px] text-k-text3 flex items-center gap-1.5">
              <Layers size={12} /> {subpartidas.length} subpartidas (recetas anidadas) — se muestran dentro del APU de cada partida.
            </div>
          )}
        </div>
      )}

      {/* Modal importar xlsx simple (CONTRACTUAL) */}
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

      {/* Modal importar plantilla PU (META) */}
      {showImportPU && (
        <ModalImportPU onClose={() => setShowImportPU(false)}
          onDone={(id) => { setShowImportPU(false); qc.invalidateQueries({ queryKey: ['presupuestos'] }); setTipo('META'); setSelId(id) }} />
      )}

      {/* Modal crear versión (CONTRACTUAL) */}
      {showCrear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCrear(false)}>
          <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-k-text">Nueva versión contractual</h2>
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

// ── Fila CONTRACTUAL (editable en borrador) ────────────────────
function FilaEditable({ linea: r, editable, onEdit }: {
  linea: Linea; editable: boolean
  onEdit: (campo: 'metrado' | 'precio_unitario' | 'hh_meta', v: string) => void
}) {
  return (
    <tr className="border-b border-k-border/50 hover:bg-k-raised/40">
      <td className="px-4 py-1.5 font-mono text-k-text2">{r.codigo}</td>
      <td className="px-4 py-1.5 text-k-text2 max-w-[280px] truncate">{r.descripcion}</td>
      <td className="px-2 py-1.5 text-k-text3">{r.unidad}</td>
      <td className="px-2 py-1.5 text-right">{cell(editable, r.metrado, v => onEdit('metrado', v))}</td>
      <td className="px-2 py-1.5 text-right">{cell(editable, r.precio_unitario, v => onEdit('precio_unitario', v))}</td>
      <td className="px-2 py-1.5 text-right">{cell(editable, r.hh_meta, v => onEdit('hh_meta', v))}</td>
      <td className="px-4 py-1.5 text-right text-k-text">{fmt((Number(r.metrado) || 0) * (Number(r.precio_unitario) || 0))}</td>
    </tr>
  )
}

// ── Fila META: jerarquía + APU expandible ──────────────────────
function FilaMeta({ linea: r }: { linea: Linea }) {
  const [abierto, setAbierto] = useState(false)
  const esHoja = !!r.fase
  const nivel = r.nivel ?? 1

  const apu = useQuery<RecursoAPU[]>({
    queryKey: ['apu', r.id],
    queryFn: () => api<RecursoAPU[]>(`/ev/presupuesto/partida/${r.id}/apu`),
    enabled: abierto && esHoja && r.id != null,
  })

  return (
    <>
      <tr className={`border-b border-k-border/50 ${esHoja ? 'hover:bg-k-raised/40 cursor-pointer' : 'bg-k-raised/30'}`}
        onClick={() => esHoja && setAbierto(a => !a)}>
        <td className="pl-3 py-1.5 text-k-text3">
          {esHoja && (abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </td>
        <td className="px-4 py-1.5 font-mono text-k-text2" style={{ paddingLeft: `${16 + (nivel - 1) * 14}px` }}>{r.codigo}</td>
        <td className={`px-4 py-1.5 max-w-[280px] truncate ${esHoja ? 'text-k-text2' : 'text-k-text font-bold'}`}>{r.descripcion}</td>
        <td className="px-2 py-1.5 text-k-text3">{r.unidad}</td>
        <td className="px-2 py-1.5 text-right text-k-text2">{esHoja ? fmt(r.metrado) : ''}</td>
        <td className="px-2 py-1.5 text-right text-k-text2">{esHoja ? fmt(r.precio_unitario) : ''}</td>
        <td className="px-2 py-1.5 text-right text-k-text2">{esHoja ? fmt(r.hh_meta) : ''}</td>
        <td className="px-2 py-1.5 text-right text-k-text3">{esHoja && r.rendimiento_mo ? fmt(Number(r.rendimiento_mo)) : ''}</td>
        <td className="px-4 py-1.5 text-right text-k-text">
          {esHoja ? fmt((Number(r.metrado) || 0) * (Number(r.precio_unitario) || 0)) : ''}
        </td>
      </tr>
      {abierto && esHoja && (
        <tr className="bg-k-void/40">
          <td colSpan={9} className="px-8 py-2">
            {apu.isLoading ? (
              <span className="text-k-text3 text-xs flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Cargando APU…</span>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-k-text3 border-b border-k-border/60">
                  <th className="text-left px-2 py-1">Tipo</th><th className="text-left px-2 py-1">Código</th>
                  <th className="text-left px-2 py-1">Recurso</th><th className="text-left px-2 py-1">Und</th>
                  <th className="text-right px-2 py-1">Cuadrilla</th><th className="text-right px-2 py-1">Cantidad</th>
                  <th className="text-right px-2 py-1">Precio</th><th className="text-right px-2 py-1">Parcial</th>
                </tr></thead>
                <tbody>
                  {(apu.data ?? []).map(rec => (
                    <tr key={rec.id} className="border-b border-k-border/30">
                      <td className={`px-2 py-1 font-bold ${TIPO_REC_CLR[rec.tipo] ?? ''}`}
                        title={nombreLargo(RECURSOS_APU, rec.tipo)}>
                        {rec.tipo} <span className="font-normal text-k-text3">· {nombreLargo(RECURSOS_APU, rec.tipo)}</span>
                      </td>
                      <td className="px-2 py-1 font-mono text-k-text3">{rec.codigo}</td>
                      <td className="px-2 py-1 text-k-text2">
                        {rec.descripcion}
                        {rec.tipo === 'SUB' && rec.sub_codigo && <span className="text-k-text3"> → {rec.sub_codigo}</span>}
                      </td>
                      <td className="px-2 py-1 text-k-text3">{rec.unidad}</td>
                      <td className="px-2 py-1 text-right text-k-text3">{rec.cuadrilla != null ? fmt(Number(rec.cuadrilla)) : ''}</td>
                      <td className="px-2 py-1 text-right text-k-text2">{Number(rec.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 4 })}</td>
                      <td className="px-2 py-1 text-right text-k-text2">{Number(rec.precio).toLocaleString('es-PE', { maximumFractionDigits: 4 })}</td>
                      <td className="px-2 py-1 text-right text-k-text">{Number(rec.parcial).toLocaleString('es-PE', { maximumFractionDigits: 4 })}</td>
                    </tr>
                  ))}
                  {(apu.data ?? []).length === 0 && (
                    <tr><td colSpan={8} className="px-2 py-2 text-k-text3">Esta partida no tiene APU (PU 0 / no considerada en la meta).</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Modal: importar plantilla PU (.xls) → preview → confirmar ──
function ModalImportPU({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ resumen: ResumenImportPU; muestra: Linea[] } | null>(null)
  const [error, setError] = useState('')

  const subir = useMutation({
    mutationFn: async (confirmar: boolean) => {
      if (!file) throw new Error('Elige el archivo .xls')
      const fd = new FormData()
      fd.append('file', file)
      return api(`/ev/presupuesto/importar-pu?proyecto_id=${PROYECTO_ID}&confirmar=${confirmar}`,
        { method: 'POST', body: fd })
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.detail : e.message),
  })

  const previsualizar = () => {
    setError('')
    subir.mutate(false, { onSuccess: (j) => setPreview(j as { resumen: ResumenImportPU; muestra: Linea[] }) })
  }
  const confirmar = () => {
    setError('')
    subir.mutate(true, { onSuccess: (j) => onDone((j as { id: number }).id) })
  }

  const res = preview?.resumen

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[680px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-k-text">Importar presupuesto META (plantilla PU)</h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-k-text3 mb-4">
          El .xls con hojas <b>PtoMeta</b> y <b>PU-Meta</b> (formato del presupuesto meta con APU).
          Crea una versión nueva en borrador; nada se activa hasta que la congeles.
        </p>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber hover:bg-k-amber2 text-black font-bold cursor-pointer w-fit">
            <Upload size={14} /> {file ? file.name : 'Elegir archivo .xls'}
            <input type="file" accept=".xls" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError('') }} />
          </label>
          <button
            onClick={async () => {
              try { descargarBlob(await apiBlob('/ev/presupuesto/plantilla-pu'), 'plantilla_pu.xls') }
              catch (e) { setError((e as Error).message) }
            }}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <Download size={14} /> Descargar plantilla
          </button>
        </div>

        {file && !preview && (
          <button onClick={previsualizar} disabled={subir.isPending}
            className="w-full border border-k-border bg-k-raised hover:bg-k-border text-k-text text-sm font-bold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
            {subir.isPending ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Analizar archivo (no guarda nada)
          </button>
        )}
        {error && <p className="text-k-red text-sm my-3 whitespace-pre-wrap">{error}</p>}

        {res && (
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['Partidas', res.hojas], ['Subpartidas', res.subpartidas], ['Recursos APU', res.recursos],
                ['HH meta', fmt(res.hh_meta_total)]].map(([l, v]) => (
                <div key={l} className="bg-k-raised border border-k-border rounded-lg py-2">
                  <div className="text-lg font-bold text-k-text">{v}</div>
                  <div className="text-[10px] uppercase text-k-text3">{l}</div>
                </div>
              ))}
            </div>
            <div className="text-sm text-k-text2 text-center">
              Costo meta total: <b className="text-k-text">$ {fmt(res.costo_meta_total)}</b> · jornada {res.hh_dia} HH/día
            </div>
            {res.errores.length > 0 && (
              <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3 text-xs text-k-red max-h-32 overflow-auto">
                <b>{res.errores.length} errores (corrígelos en el Excel; no se puede confirmar):</b>
                {res.errores.slice(0, 20).map((e, i) => <div key={i}>· {e}</div>)}
              </div>
            )}
            {res.avisos.length > 0 && (
              <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-xs text-k-amber max-h-32 overflow-auto">
                <b>{res.avisos.length} avisos (no bloquean):</b>
                {res.avisos.slice(0, 20).map((a, i) => <div key={i}>· {a}</div>)}
              </div>
            )}
            <button onClick={confirmar} disabled={subir.isPending || res.errores.length > 0}
              className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {subir.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Confirmar import ({res.hojas} partidas, versión nueva en borrador)
            </button>
          </div>
        )}
      </div>
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
