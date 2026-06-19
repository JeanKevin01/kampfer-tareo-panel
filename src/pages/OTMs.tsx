import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, Loader2, ChevronDown, Upload, Download, FileSpreadsheet, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

const API = 'https://api.apps1.astraera.space'

interface OTM {
  id: string; descripcion: string; estado: string; area?: string; cc?: string
  sdp?: string; plazo?: number; fecha_inicio?: string; fecha_fin?: string
  monto_contractual?: number; monto_valorizado?: number
}

const ESTADOS = ['EJECUCION', 'POR INICIAR', 'CERRADA', 'CONCLUIDA']
const estadoStyle: Record<string, string> = {
  'EJECUCION':   'text-k-green  bg-green-500/10  border-green-500/20',
  'POR INICIAR': 'text-k-amber  bg-amber-500/10  border-amber-500/20',
  'CERRADA':     'text-k-text3  bg-k-raised       border-k-border',
  'CONCLUIDA':   'text-k-blue   bg-blue-500/10   border-blue-500/20',
}

export default function OTMs() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState({
    id: '', descripcion: '', estado: 'POR INICIAR', area: '', cc: '',
    sdp: '', plazo: '', fecha_inicio: '', fecha_fin: '', monto_contractual: '', monto_valorizado: '',
  })
  const [formError, setFormError] = useState('')

  // ── Importación masiva ──
  const [showImport, setShowImport]   = useState(false)
  const [filasImport, setFilasImport] = useState<Array<{
    ID: string; DESCRIPCION: string; AREA: string; ESTADO: string; SDP: string; CENTRO_COSTO: string
    PLAZO: string; FECHA_INICIO: string; FECHA_FIN: string; MONTO_CONTRACTUAL: string; MONTO_VALORIZADO: string
    _error: string | null
  }>>([])
  const [resultImport, setResultImport] = useState<{ creadas: number; errores: { id: string; error: string }[] } | null>(null)

  function descargarPlantillaOTMs() {
    const datos = [
      { SDP: '', ID: 'OTM-0005', CENTRO_COSTO: '', DESCRIPCION: 'MONTAJE ESTRUCTURA M-12', AREA: 'SX-EW',
        ESTADO: 'EJECUCION', PLAZO: 30, 'FECHA DE INICIO': '2026-01-06', 'FECHA DE FIN': '2026-02-05',
        'MONTO CONTRACTUAL': 125000, 'MONTO VALORIZADO': 0 },
      { SDP: '', ID: 'OTM-0012', CENTRO_COSTO: '', DESCRIPCION: 'REUBICACION NIDO DE CICLONES', AREA: 'Mina',
        ESTADO: 'EJECUCION', PLAZO: 45, 'FECHA DE INICIO': '2026-01-13', 'FECHA DE FIN': '2026-02-27',
        'MONTO CONTRACTUAL': 280000, 'MONTO VALORIZADO': 0 },
      { SDP: '', ID: 'OTM-0036', CENTRO_COSTO: '', DESCRIPCION: 'INSTALACION TUBERIA PVC', AREA: 'C2 Area Seca',
        ESTADO: 'POR INICIAR', PLAZO: 20, 'FECHA DE INICIO': '', 'FECHA DE FIN': '',
        'MONTO CONTRACTUAL': 60000, 'MONTO VALORIZADO': 0 },
    ]
    const ws = XLSX.utils.json_to_sheet(datos, {
      header: ['SDP','ID','CENTRO_COSTO','DESCRIPCION','AREA','ESTADO','PLAZO',
               'FECHA DE INICIO','FECHA DE FIN','MONTO CONTRACTUAL','MONTO VALORIZADO']
    })
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 14 },
                   { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'OTMs')
    XLSX.writeFile(wb, 'plantilla_otms_kampfer.xlsx')
  }

  function handleImportFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer)
      const wb   = XLSX.read(data, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
      // Convierte cualquier formato de fecha del Excel a ISO (YYYY-MM-DD).
      // Maneja: objetos Date reales, números seriales de Excel (celda con
      // formato de fecha pero leída como número), y texto DD/MM/YYYY o
      // DD-MM-YYYY (celdas guardadas como texto plano).
      const fmtFecha = (v: unknown): string => {
        if (v === null || v === undefined || v === '') return ''
        if (v instanceof Date && !isNaN(v.getTime())) {
          return v.toISOString().slice(0, 10)
        }
        if (typeof v === 'number') {
          // Serial de Excel (días desde 1899-12-30)
          const d = new Date(Math.round((v - 25569) * 86400 * 1000))
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
          return ''
        }
        const s = String(v).trim()
        if (!s) return ''
        // Ya es ISO (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        // DD/MM/YYYY o DD-MM-YYYY
        const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
        if (m) {
          const [, dd, mm, yyyy] = m
          return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
        }
        return '' // formato no reconocido — se omite en vez de enviar basura
      }
      const procesadas = rows.map(row => {
        const n: Record<string, string> = {}
        Object.keys(row).forEach(k => { n[k.toUpperCase().trim()] = String(row[k] ?? '').trim() })
        const id          = (n['ID'] || n['OTM_ID'] || n['OTM'] || '').toUpperCase()
        const descripcion = (n['DESCRIPCION'] || n['DESCRIPCIÓN'] || '').toUpperCase()
        const area         = n['AREA'] || n['ÁREA'] || ''
        const estado       = (n['ESTADO'] || 'POR INICIAR').toUpperCase()
        const sdp           = n['SDP'] || ''
        const centro_costo = n['CENTRO_COSTO'] || n['CC'] || ''
        const plazo         = n['PLAZO'] || ''
        const fecha_inicio  = fmtFecha(row['FECHA DE INICIO'] ?? n['FECHA DE INICIO'] ?? n['FECHA_INICIO'])
        const fecha_fin     = fmtFecha(row['FECHA DE FIN']    ?? n['FECHA DE FIN']    ?? n['FECHA_FIN'])
        const monto_c       = n['MONTO CONTRACTUAL'] || n['MONTO_CONTRACTUAL'] || ''
        const monto_v       = n['MONTO VALORIZADO']  || n['MONTO_VALORIZADO']  || ''
        let _error: string | null = null
        if (!id) _error = 'ID vacío'
        else if (!descripcion) _error = 'DESCRIPCION vacía'
        return {
          ID: id, DESCRIPCION: descripcion, AREA: area, ESTADO: estado, SDP: sdp, CENTRO_COSTO: centro_costo,
          PLAZO: plazo, FECHA_INICIO: fecha_inicio, FECHA_FIN: fecha_fin,
          MONTO_CONTRACTUAL: monto_c, MONTO_VALORIZADO: monto_v, _error,
        }
      })
      setFilasImport(procesadas)
      setResultImport(null)
    }
    reader.readAsArrayBuffer(file)
  }

  const importBulkMutation = useMutation({
    mutationFn: async () => {
      const otms = filasImport.filter(f => !f._error).map(f => ({
        id: f.ID, descripcion: f.DESCRIPCION, area: f.AREA, estado: f.ESTADO,
        sdp: f.SDP, centro_costo: f.CENTRO_COSTO,
        plazo: f.PLAZO ? Number(f.PLAZO) : null,
        fecha_inicio: f.FECHA_INICIO || null,
        fecha_fin: f.FECHA_FIN || null,
        monto_contractual: f.MONTO_CONTRACTUAL ? Number(f.MONTO_CONTRACTUAL) : null,
        monto_valorizado: f.MONTO_VALORIZADO ? Number(f.MONTO_VALORIZADO) : 0,
      }))
      const r = await fetch(API + '/admin/otms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otms }),
      })
      if (!r.ok) throw new Error((await r.json()).detail || 'Error al importar')
      return r.json()
    },
    onSuccess: (d) => {
      setResultImport({ creadas: d.creadas, errores: d.errores })
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
    },
  })

  const { data: otms = [], isLoading } = useQuery<OTM[]>({
    queryKey: ['otms-all'],
    queryFn: () => fetch(API + '/api/otms').then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (d: typeof form) =>
      fetch(API + '/admin/otm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
      setShowModal(false)
      setForm({ id: '', descripcion: '', estado: 'POR INICIAR', area: '', cc: '',
                sdp: '', plazo: '', fecha_inicio: '', fecha_fin: '', monto_contractual: '', monto_valorizado: '' })
      setFormError('')
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      fetch(API + `/admin/otm/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
    },
  })

  const filtered = useMemo(() => {
    const q = search.toUpperCase()
    return otms.filter(o => o.id.includes(q) || o.descripcion?.toUpperCase().includes(q))
  }, [otms, search])

  const enEjecucion = otms.filter(o => o.estado === 'EJECUCION').length
  const porIniciar  = otms.filter(o => o.estado === 'POR INICIAR').length

  const handleSubmit = () => {
    if (!form.id.trim() || !form.descripcion.trim()) { setFormError('ID y descripción son obligatorios'); return }
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <p className="text-k-text2 text-sm">Órdenes de trabajo activas del proyecto SMCV</p>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowImport(true); setFilasImport([]); setResultImport(null) }}
            className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
            <Upload size={14} /> Importar varias
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={15} /> Nueva OTM
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total activas', value: otms.length,  color: 'text-k-text'  },
          { label: 'En ejecución',  value: enEjecucion,  color: 'text-k-green' },
          { label: 'Por iniciar',   value: porIniciar,   color: 'text-k-amber' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4 flex items-center gap-4">
            <div className={`font-mono text-3xl font-medium ${s.color}`}>{isLoading ? '…' : s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
        <input type="text" placeholder="Buscar por ID o descripción…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
      </div>

      {/* Tabla */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-k-raised border-b border-k-border">
                {['OTM','Descripción','Área','Plazo','Inicio','Fin','Monto contr.','Monto valor.','Estado','Cambiar estado'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider whitespace-nowrap ${i >= 3 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando OTMs…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-k-text3 text-sm">No hay OTMs con ese filtro</td></tr>
              )}
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-k-amber">{o.id}</span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="text-sm text-k-text line-clamp-2">{o.descripcion}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-k-text2">{o.area || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-k-text2">{o.plazo ? `${o.plazo} d` : '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[11px] font-mono text-k-text3">{o.fecha_inicio || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[11px] font-mono text-k-text3">{o.fecha_fin || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-k-text2">
                      {o.monto_contractual != null ? `S/ ${Number(o.monto_contractual).toLocaleString('es-PE')}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-k-green">
                      {o.monto_valorizado != null ? `S/ ${Number(o.monto_valorizado).toLocaleString('es-PE')}` : 'S/ 0'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border ${estadoStyle[o.estado] || estadoStyle['CERRADA']}`}>
                      {o.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="relative inline-block">
                      <select
                        value={o.estado}
                        onChange={e => estadoMutation.mutate({ id: o.id, estado: e.target.value })}
                        className="appearance-none bg-k-raised border border-k-border text-k-text2 text-xs rounded-lg pl-3 pr-7 py-1.5 outline-none focus:border-k-amber cursor-pointer transition-colors"
                      >
                        {ESTADOS.map(e => <option key={e} value={e} className="bg-k-raised">{e}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-k-border bg-k-raised">
            <span className="text-[11px] text-k-text3">{filtered.length} OTMs</span>
          </div>
        )}
      </div>

      {/* Modal nueva OTM */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-condensed font-bold text-xl text-k-text">Nueva OTM</h2>
              <button onClick={() => { setShowModal(false); setFormError('') }} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'id',          label: 'ID OTM *',       placeholder: 'OTM-0036',           col: 1 },
                { key: 'area',        label: 'Área',            placeholder: 'Aguas / C2 Area Seca', col: 1 },
                { key: 'descripcion', label: 'Descripción *',  placeholder: 'Descripción del trabajo', col: 2 },
                { key: 'sdp',         label: 'SDP',             placeholder: '',                    col: 1 },
                { key: 'cc',          label: 'Centro de Costo', placeholder: 'CAP270551100000',    col: 1 },
                { key: 'plazo',       label: 'Plazo (días)',    placeholder: '30',                  col: 1, type: 'number' },
                { key: 'fecha_inicio', label: 'Fecha de inicio', placeholder: '',                   col: 1, type: 'date' },
                { key: 'fecha_fin',    label: 'Fecha de fin',    placeholder: '',                   col: 1, type: 'date' },
                { key: 'monto_contractual', label: 'Monto contractual (S/)', placeholder: '0.00',   col: 1, type: 'number' },
                { key: 'monto_valorizado',  label: 'Monto valorizado (S/)',  placeholder: '0.00',   col: 1, type: 'number' },
              ].map(f => (
                <div key={f.key} className={f.col === 2 ? 'col-span-2' : ''}>
                  <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">{f.label}</label>
                  <input type={f.type || 'text'} placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
                </div>
              ))}
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Estado inicial</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
                  {ESTADOS.map(e => <option key={e} value={e} className="bg-k-raised">{e}</option>)}
                </select>
              </div>
            </div>
            {formError && <p className="text-k-red text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">{formError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setFormError('') }}
                className="flex-1 bg-k-raised border border-k-border text-k-text2 font-bold text-sm py-2.5 rounded-lg hover:bg-k-border transition-colors">Cancelar</button>
              <button onClick={handleSubmit} disabled={createMutation.isPending}
                className="flex-1 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {createMutation.isPending ? <><Loader2 size={14} className="animate-spin" />Guardando…</> : '✓ Crear OTM'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal importación masiva */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-condensed font-bold text-xl text-k-text">Importar OTMs masivamente</h2>
              <button onClick={() => setShowImport(false)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>

            {filasImport.length === 0 && (
              <div className="space-y-4">
                <div
                  onClick={() => document.getElementById('otm-file-input')?.click()}
                  className="border-2 border-dashed border-k-border2 rounded-xl p-14 text-center cursor-pointer hover:border-k-amber transition-colors">
                  <input id="otm-file-input" type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
                  <Upload size={32} className="mx-auto mb-3 text-k-text3" />
                  <p className="text-sm font-bold text-k-text mb-1">Arrastra o haz clic para seleccionar el Excel</p>
                  <p className="text-xs text-k-text3">Formatos: .xlsx · .xls</p>
                </div>
                <div className="bg-k-raised border border-k-border rounded-xl p-4 flex items-center gap-3">
                  <FileSpreadsheet size={16} className="text-k-blue flex-shrink-0" />
                  <p className="text-xs text-k-text2 flex-1">
                    Columnas: <span className="text-k-text font-bold">SDP</span>,{' '}
                    <span className="text-k-text font-bold">ID</span>,{' '}
                    <span className="text-k-text font-bold">CENTRO_COSTO</span>,{' '}
                    <span className="text-k-text font-bold">DESCRIPCION</span>,{' '}
                    <span className="text-k-text font-bold">AREA</span>,{' '}
                    <span className="text-k-text font-bold">ESTADO</span>,{' '}
                    PLAZO, FECHA DE INICIO, FECHA DE FIN, MONTO CONTRACTUAL y MONTO VALORIZADO (opcionales).
                  </p>
                  <button onClick={descargarPlantillaOTMs}
                    className="flex items-center gap-1.5 text-xs font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg hover:bg-amber-500/20 transition-colors flex-shrink-0">
                    <Download size={12} /> Plantilla
                  </button>
                </div>
              </div>
            )}

            {filasImport.length > 0 && !resultImport && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total leídas', value: filasImport.length, color: 'text-k-text' },
                    { label: 'Válidas',      value: filasImport.filter(f => !f._error).length, color: 'text-k-green' },
                    { label: 'Con error',    value: filasImport.filter(f => f._error).length,  color: filasImport.some(f => f._error) ? 'text-k-red' : 'text-k-text3' },
                  ].map(s => (
                    <div key={s.label} className="bg-k-raised border border-k-border rounded-xl p-3 flex items-center gap-3">
                      <div className={`font-mono text-2xl font-medium ${s.color}`}>{s.value}</div>
                      <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="border border-k-border rounded-xl overflow-hidden">
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-k-raised border-b border-k-border">
                        <tr>
                          {['ID','Descripción','Área','Estado','Plazo','Inicio','Fin','Monto contr.','Estado fila'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filasImport.map((f, i) => (
                          <tr key={i} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : ''}`}>
                            <td className="px-3 py-2 font-mono text-k-amber">{f.ID || '—'}</td>
                            <td className="px-3 py-2 text-k-text max-w-[180px] truncate">{f.DESCRIPCION || '—'}</td>
                            <td className="px-3 py-2 text-k-text2">{f.AREA || '—'}</td>
                            <td className="px-3 py-2 text-k-text2">{f.ESTADO}</td>
                            <td className="px-3 py-2 text-k-text2 font-mono">{f.PLAZO || '—'}</td>
                            <td className="px-3 py-2 text-k-text3 font-mono">{f.FECHA_INICIO || '—'}</td>
                            <td className="px-3 py-2 text-k-text3 font-mono">{f.FECHA_FIN || '—'}</td>
                            <td className="px-3 py-2 text-k-text2 font-mono">{f.MONTO_CONTRACTUAL || '—'}</td>
                            <td className="px-3 py-2">
                              {f._error
                                ? <span className="text-[10px] font-bold text-k-red bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">{f._error}</span>
                                : <span className="text-[10px] font-bold text-k-green bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setFilasImport([])}
                    className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
                    <X size={14} /> Cambiar archivo
                  </button>
                  <button onClick={() => importBulkMutation.mutate()}
                    disabled={filasImport.filter(f => !f._error).length === 0 || importBulkMutation.isPending}
                    className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors">
                    {importBulkMutation.isPending
                      ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                      : <><CheckCircle size={14} /> Importar {filasImport.filter(f => !f._error).length} OTMs</>}
                  </button>
                </div>
              </div>
            )}

            {resultImport && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold bg-green-500/10 border border-green-500/20 text-k-green">
                  <CheckCircle size={16} /> {resultImport.creadas} OTMs importadas/actualizadas
                  {resultImport.errores.length > 0 && `, ${resultImport.errores.length} con error`}
                </div>
                <button onClick={() => setShowImport(false)}
                  className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg transition-colors">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}