// Página PROYECTOS (rediseño Jean 2026-07-18; la entidad interna sigue siendo
// `otms` — el rename es de UI). ID PROY-#### automático (ya no se digita),
// formulario reducido: nombre, área, centro de costo, estado (catálogo),
// F.Inicio + plazo (F.Fin se calcula sola), moneda S/ o US$, montos.
// Detección de similares (nombre parecido o monto contractual ±100): el API
// responde 409 y aquí se pregunta ACTUALIZAR el existente / CREAR igual.
// El import reconoce proyectos ya cargados (con ID actualiza; sin ID y con
// similar pide confirmación fila por fila).
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, Loader2, ChevronDown, Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'

import { api, ApiError } from '@/lib/api'

interface Proyecto {
  id: string; descripcion: string; estado: string; area?: string; centro_costo?: string
  plazo?: number; fecha_inicio?: string; fecha_fin?: string
  monto_contractual?: number; monto_valorizado?: number; moneda?: string
}
interface Similar { id: string; nombre: string; monto_contractual?: number | null; estado?: string; motivo: string }

// Catálogo cerrado (igual al backend):
//   POR INICIAR · EJECUCION · CONCLUIDO (obra terminada, aún sin valorizar)
//   · CERRADO (valorizado y documentación enviada) · STAND BY
const ESTADOS = ['POR INICIAR', 'EJECUCION', 'CONCLUIDO', 'CERRADO', 'STAND BY']
const ESTADO_DESC: Record<string, string> = {
  'POR INICIAR': 'Aún no arranca en obra',
  'EJECUCION': 'En trabajo de obra',
  'CONCLUIDO': 'Obra terminada, aún sin valorizar',
  'CERRADO': 'Valorizado y documentación enviada',
  'STAND BY': 'En pausa',
}
const estadoStyle: Record<string, string> = {
  'EJECUCION':   'text-k-green  bg-green-500/10  border-green-500/20',
  'POR INICIAR': 'text-k-amber  bg-amber-500/10  border-amber-500/20',
  'CERRADO':     'text-k-text3  bg-k-raised       border-k-border',
  'CONCLUIDO':   'text-k-blue   bg-blue-500/10   border-blue-500/20',
  'STAND BY':    'text-k-text3  bg-k-raised       border-k-border',
}
const ESTADO_DEFAULT_STYLE = 'text-k-text3 bg-k-raised border-k-border'
const simbolo = (m?: string) => (m === 'USD' ? 'US$' : 'S/')

const FORM_VACIO = {
  nombre: '', estado: 'POR INICIAR', area: '', centro_costo: '', moneda: 'PEN',
  plazo: '', fecha_inicio: '', monto_contractual: '', monto_valorizado: '',
}

export default function OTMs() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState({ ...FORM_VACIO })
  const [formError, setFormError] = useState('')
  // Aviso de similares del API (409): preguntar Actualizar / Crear igual
  const [similares, setSimilares] = useState<Similar[] | null>(null)

  // ── Importación masiva ──
  const [showImport, setShowImport]   = useState(false)
  type FilaImport = {
    ID: string; NOMBRE: string; AREA: string; ESTADO: string; CENTRO_COSTO: string
    MONEDA: string; PLAZO: string; FECHA_INICIO: string
    MONTO_CONTRACTUAL: string; MONTO_VALORIZADO: string; _error: string | null
  }
  const [filasImport, setFilasImport] = useState<FilaImport[]>([])
  const [resultImport, setResultImport] = useState<{
    creadas: number; actualizadas: number
    errores: { fila: number; error: string }[]
  } | null>(null)
  const [porConfirmar, setPorConfirmar] = useState<{ fila: number; nombre: string; similares: Similar[] }[]>([])
  const [payloadEnviado, setPayloadEnviado] = useState<Record<string, unknown>[]>([])

  function descargarPlantilla() {
    const datos = [
      { NOMBRE: 'MONTAJE ESTRUCTURA M-12', AREA: 'PLANTA', ESTADO: 'EJECUCION',
        CENTRO_COSTO: '', MONEDA: 'PEN', PLAZO: 30, 'FECHA DE INICIO': '2026-01-06',
        'MONTO CONTRACTUAL': 125000, 'MONTO VALORIZADO': 0, ID: '' },
      { NOMBRE: 'REUBICACION NIDO DE CICLONES', AREA: 'MINA', ESTADO: 'POR INICIAR',
        CENTRO_COSTO: '', MONEDA: 'USD', PLAZO: 45, 'FECHA DE INICIO': '2026-01-13',
        'MONTO CONTRACTUAL': 280000, 'MONTO VALORIZADO': 0, ID: '' },
    ]
    const ws = XLSX.utils.json_to_sheet(datos, {
      header: ['NOMBRE','AREA','ESTADO','CENTRO_COSTO','MONEDA','PLAZO',
               'FECHA DE INICIO','MONTO CONTRACTUAL','MONTO VALORIZADO','ID'],
    })
    ws['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 8 },
                   { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
    const leyenda = XLSX.utils.aoa_to_sheet([
      ['CAMPO', 'VALORES VÁLIDOS / NOTA'],
      ['ESTADO', ESTADOS.map(e => `${e} (${ESTADO_DESC[e]})`).join(' · ')],
      ['MONEDA', 'PEN (soles) o USD (dólares) — default PEN'],
      ['FECHA DE FIN', 'NO se pide: se calcula sola como FECHA DE INICIO + PLAZO (días)'],
      ['ID', 'Déjalo VACÍO para proyecto nuevo (se genera PROY-#### solo). ' +
             'Pon un ID existente (ej. PROY-0003) SOLO para actualizar ese proyecto.'],
      ['DUPLICADOS', 'Si el nombre es parecido o el monto contractual está a menos de 100 ' +
                     'de un proyecto ya cargado, el sistema pedirá confirmación antes de crear.'],
    ])
    leyenda['!cols'] = [{ wch: 16 }, { wch: 100 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PROYECTOS')
    XLSX.utils.book_append_sheet(wb, leyenda, 'LEYENDA')
    XLSX.writeFile(wb, 'plantilla_proyectos_kampfer.xlsx')
  }

  function handleImportFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer)
      const wb   = XLSX.read(data, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
      const fmtFecha = (v: unknown): string => {
        if (v === null || v === undefined || v === '') return ''
        if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
        if (typeof v === 'number') {
          const d = new Date(Math.round((v - 25569) * 86400 * 1000))
          return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
        }
        const s = String(v).trim()
        if (!s) return ''
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
        if (m) { const [, dd, mm, yyyy] = m; return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` }
        return ''
      }
      const procesadas: FilaImport[] = rows.map(row => {
        const n: Record<string, string> = {}
        Object.keys(row).forEach(k => { n[k.toUpperCase().trim()] = String(row[k] ?? '').trim() })
        const nombre = (n['NOMBRE'] || n['NOMBRE DEL PROYECTO'] || n['DESCRIPCION'] || n['DESCRIPCIÓN'] || '').toUpperCase()
        const estado = (n['ESTADO'] || 'POR INICIAR').toUpperCase()
        let _error: string | null = null
        if (!nombre) _error = 'NOMBRE vacío'
        return {
          ID: (n['ID'] || '').toUpperCase(), NOMBRE: nombre,
          AREA: n['AREA'] || n['ÁREA'] || '', ESTADO: estado,
          CENTRO_COSTO: n['CENTRO_COSTO'] || n['CC'] || '',
          MONEDA: (n['MONEDA'] || 'PEN').toUpperCase(),
          PLAZO: n['PLAZO'] || '',
          FECHA_INICIO: fmtFecha(row['FECHA DE INICIO'] ?? n['FECHA DE INICIO'] ?? n['FECHA_INICIO']),
          MONTO_CONTRACTUAL: n['MONTO CONTRACTUAL'] || n['MONTO_CONTRACTUAL'] || '',
          MONTO_VALORIZADO: n['MONTO VALORIZADO'] || n['MONTO_VALORIZADO'] || '',
          _error,
        }
      })
      setFilasImport(procesadas)
      setResultImport(null)
      setPorConfirmar([])
    }
    reader.readAsArrayBuffer(file)
  }

  interface BulkResp {
    creadas: number; actualizadas?: number
    errores: { fila: number; error: string }[]
    requieren_confirmacion?: { fila: number; nombre: string; similares: Similar[] }[]
  }
  const enviarBulk = (otms: Record<string, unknown>[]) =>
    api<BulkResp>('/admin/otms/bulk', { method: 'POST', body: JSON.stringify({ otms }) })

  const importBulkMutation = useMutation({
    mutationFn: async () => {
      const otms = filasImport.filter(f => !f._error).map(f => ({
        id: f.ID || null, nombre: f.NOMBRE, area: f.AREA, estado: f.ESTADO,
        centro_costo: f.CENTRO_COSTO, moneda: f.MONEDA,
        plazo: f.PLAZO ? Number(f.PLAZO) : null,
        fecha_inicio: f.FECHA_INICIO || null,
        monto_contractual: f.MONTO_CONTRACTUAL ? Number(f.MONTO_CONTRACTUAL) : null,
        monto_valorizado: f.MONTO_VALORIZADO ? Number(f.MONTO_VALORIZADO) : 0,
      }))
      setPayloadEnviado(otms)
      return enviarBulk(otms)
    },
    onSuccess: (d) => {
      setResultImport({ creadas: d.creadas, actualizadas: d.actualizadas ?? 0, errores: d.errores })
      setPorConfirmar(d.requieren_confirmacion ?? [])
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
      qc.invalidateQueries({ queryKey: ['otms-lista'] })
    },
    onError: (e: Error) => setResultImport({ creadas: 0, actualizadas: 0, errores: [{ fila: 0, error: e.message }] }),
  })

  // Resolver una fila que pidió confirmación: crear igual (forzar) o
  // actualizar el proyecto existente elegido.
  const resolverFila = async (fila: number, accion: 'forzar' | string) => {
    const base = payloadEnviado[fila - 1]
    if (!base) return
    const row = accion === 'forzar' ? { ...base, forzar: true } : { ...base, actualizar_id: accion }
    try {
      const d = await enviarBulk([row])
      setResultImport(r => r && ({
        ...r,
        creadas: r.creadas + (d.creadas ?? 0),
        actualizadas: r.actualizadas + (d.actualizadas ?? 0),
        errores: [...r.errores, ...(d.errores ?? [])],
      }))
      setPorConfirmar(list => list.filter(x => x.fila !== fila))
      qc.invalidateQueries({ queryKey: ['otms-all'] })
    } catch (e) { alert((e as Error).message) }
  }

  const { data: otms = [], isLoading } = useQuery<Proyecto[]>({
    queryKey: ['otms-all'],
    queryFn: () => api<Proyecto[]>('/api/otms'),
  })

  const createMutation = useMutation({
    mutationFn: async (extra: Record<string, unknown> = {}) => {
      try {
        return await api<{ id: string; nuevo: boolean }>('/admin/otm', { method: 'POST', body: JSON.stringify({ ...form, ...extra }) })
      } catch (e) {
        const err = e as ApiError & { detail?: unknown }
        const det = err.detail as { similares?: unknown[] } | string | undefined
        if (err instanceof ApiError && err.status === 409 && typeof det === 'object' && det?.similares) {
          setSimilares(det.similares as Similar[]); throw new Error('__similares__', { cause: e })
        }
        throw new Error(typeof det === 'string' ? det : err.message || 'Error', { cause: e })
      }
    },
    onSuccess: (j: { id: string; nuevo: boolean }) => {
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
      qc.invalidateQueries({ queryKey: ['otms-lista'] })
      setShowModal(false); setSimilares(null)
      setForm({ ...FORM_VACIO }); setFormError('')
      alert(j.nuevo ? `✓ Proyecto creado: ${j.id}` : `✓ Proyecto ${j.id} actualizado`)
    },
    onError: (e: Error) => { if (e.message !== '__similares__') setFormError(e.message) },
  })

  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api(`/admin/otm/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
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

  // F.Fin calculada en vivo para mostrarla en el formulario
  const finCalculada = useMemo(() => {
    if (!form.fecha_inicio || !form.plazo) return ''
    const d = new Date(form.fecha_inicio + 'T12:00:00')
    d.setDate(d.getDate() + Number(form.plazo))
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }, [form.fecha_inicio, form.plazo])

  const handleSubmit = () => {
    if (!form.nombre.trim()) { setFormError('El nombre del proyecto es obligatorio'); return }
    setFormError(''); setSimilares(null)
    createMutation.mutate({})
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <p className="text-k-text2 text-sm">Proyectos registrados en el sistema</p>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowImport(true); setFilasImport([]); setResultImport(null); setPorConfirmar([]) }}
            className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
            <Upload size={14} /> Importar varios
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={15} /> Nuevo proyecto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: otms.length,  color: 'text-k-text'  },
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
        <input type="text" placeholder="Buscar por código o nombre…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
      </div>

      {/* Tabla */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-k-raised border-b border-k-border">
                {['Proyecto','Nombre','Área','Plazo','Inicio','Fin','Monto contr.','Monto valor.','Estado','Cambiar estado'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider whitespace-nowrap ${i >= 3 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando proyectos…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-k-text3 text-sm">No hay proyectos con ese filtro</td></tr>
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
                      {o.monto_contractual != null ? `${simbolo(o.moneda)} ${Number(o.monto_contractual).toLocaleString('es-PE')}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-mono text-k-green">
                      {`${simbolo(o.moneda)} ${Number(o.monto_valorizado ?? 0).toLocaleString('es-PE')}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span title={ESTADO_DESC[o.estado] ?? ''}
                      className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border ${estadoStyle[o.estado] || ESTADO_DEFAULT_STYLE}`}>
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
                        {(ESTADOS.includes(o.estado) ? ESTADOS : [o.estado, ...ESTADOS]).map(e => (
                          <option key={e} value={e} className="bg-k-raised" title={ESTADO_DESC[e] ?? ''}>{e}</option>
                        ))}
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
            <span className="text-[11px] text-k-text3">{filtered.length} proyecto{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Modal nuevo proyecto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-condensed font-bold text-xl text-k-text">Nuevo proyecto
                <span className="text-k-text3 font-normal text-sm ml-2">(código PROY-#### automático)</span>
              </h2>
              <button onClick={() => { setShowModal(false); setFormError(''); setSimilares(null) }} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Nombre del proyecto *</label>
                <input placeholder="Ej. MONTAJE DE ESTRUCTURA NAVE 2" value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
              </div>
              {[
                { key: 'area',          label: 'Área',            placeholder: 'Planta / Mina / …' },
                { key: 'centro_costo',  label: 'Centro de costo', placeholder: 'Para asignarle materiales y facturas' },
                { key: 'fecha_inicio',  label: 'Fecha de inicio', placeholder: '', type: 'date' },
                { key: 'plazo',         label: 'Plazo (días)',    placeholder: '30', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">{f.label}</label>
                  <input type={f.type || 'text'} placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
                </div>
              ))}
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Moneda del proyecto</label>
                <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
                  <option value="PEN" className="bg-k-raised">S/ — Soles</option>
                  <option value="USD" className="bg-k-raised">US$ — Dólares</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Fecha de fin (calculada)</label>
                <div className="w-full bg-k-void border border-k-border rounded-lg px-4 py-2.5 text-sm font-mono text-k-text2">
                  {finCalculada || '— (inicio + plazo)'}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Monto contractual ({simbolo(form.moneda)})</label>
                <input type="number" placeholder="0.00" value={form.monto_contractual}
                  onChange={e => setForm(p => ({ ...p, monto_contractual: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Monto valorizado ({simbolo(form.moneda)})</label>
                <input type="number" placeholder="0.00" value={form.monto_valorizado}
                  onChange={e => setForm(p => ({ ...p, monto_valorizado: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Estado inicial</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
                  {ESTADOS.map(e => <option key={e} value={e} className="bg-k-raised">{e} — {ESTADO_DESC[e]}</option>)}
                </select>
              </div>
            </div>

            {/* Aviso de similares: Actualizar el existente o Crear igual */}
            {similares && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <p className="text-sm font-bold text-k-amber flex items-center gap-2">
                  <AlertTriangle size={14} /> Puede que este proyecto ya exista
                </p>
                {similares.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs bg-k-raised border border-k-border rounded-lg px-3 py-2">
                    <span className="font-mono font-bold text-k-amber">{s.id}</span>
                    <span className="text-k-text flex-1 truncate">{s.nombre}</span>
                    <span className="text-k-text3">({s.motivo})</span>
                    <button onClick={() => createMutation.mutate({ id: s.id })}
                      className="px-2 py-1 rounded border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 font-bold">
                      Actualizar este
                    </button>
                  </div>
                ))}
                <button onClick={() => createMutation.mutate({ forzar: true })}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised font-bold">
                  No es el mismo — crear proyecto nuevo de todos modos
                </button>
              </div>
            )}

            {formError && <p className="text-k-red text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">{formError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setFormError(''); setSimilares(null) }}
                className="flex-1 bg-k-raised border border-k-border text-k-text2 font-bold text-sm py-2.5 rounded-lg hover:bg-k-border transition-colors">Cancelar</button>
              <button onClick={handleSubmit} disabled={createMutation.isPending}
                className="flex-1 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {createMutation.isPending ? <><Loader2 size={14} className="animate-spin" />Guardando…</> : '✓ Crear proyecto'}
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
              <h2 className="font-condensed font-bold text-xl text-k-text">Importar proyectos</h2>
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
                    Columnas: <span className="text-k-text font-bold">NOMBRE</span>, AREA,{' '}
                    <span className="text-k-text font-bold">ESTADO</span> ({ESTADOS.join(' / ')}),{' '}
                    CENTRO_COSTO, MONEDA (PEN/USD), PLAZO, FECHA DE INICIO, MONTO CONTRACTUAL, MONTO VALORIZADO.
                    El código PROY-#### se genera solo (columna ID únicamente para ACTUALIZAR uno existente).
                    La F.Fin se calcula: inicio + plazo. Ver hoja LEYENDA de la plantilla.
                  </p>
                  <button onClick={descargarPlantilla}
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
                          {['Nombre','Área','Estado','Moneda','Plazo','Inicio','Monto contr.','ID (actualizar)','Estado fila'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filasImport.map((f, i) => (
                          <tr key={i} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : ''}`}>
                            <td className="px-3 py-2 text-k-text max-w-[200px] truncate">{f.NOMBRE || '—'}</td>
                            <td className="px-3 py-2 text-k-text2">{f.AREA || '—'}</td>
                            <td className="px-3 py-2 text-k-text2">{f.ESTADO}</td>
                            <td className="px-3 py-2 text-k-text2 font-mono">{f.MONEDA}</td>
                            <td className="px-3 py-2 text-k-text2 font-mono">{f.PLAZO || '—'}</td>
                            <td className="px-3 py-2 text-k-text3 font-mono">{f.FECHA_INICIO || '—'}</td>
                            <td className="px-3 py-2 text-k-text2 font-mono">{f.MONTO_CONTRACTUAL || '—'}</td>
                            <td className="px-3 py-2 font-mono text-k-amber">{f.ID || '—'}</td>
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
                      : <><CheckCircle size={14} /> Importar {filasImport.filter(f => !f._error).length} proyecto(s)</>}
                  </button>
                </div>
              </div>
            )}

            {resultImport && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold bg-green-500/10 border border-green-500/20 text-k-green">
                  <CheckCircle size={16} /> {resultImport.creadas} creado(s) · {resultImport.actualizadas} actualizado(s)
                  {resultImport.errores.length > 0 && ` · ${resultImport.errores.length} con error`}
                </div>
                {resultImport.errores.length > 0 && (
                  <div className="text-xs text-k-red space-y-1">
                    {resultImport.errores.map((e, i) => <p key={i}>Fila {e.fila}: {e.error}</p>)}
                  </div>
                )}

                {/* Filas que el sistema reconoció como posibles duplicados */}
                {porConfirmar.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <p className="text-sm font-bold text-k-amber flex items-center gap-2">
                      <AlertTriangle size={14} /> {porConfirmar.length} fila(s) parecen proyectos YA CARGADOS — decide una por una:
                    </p>
                    {porConfirmar.map(pc => (
                      <div key={pc.fila} className="bg-k-raised border border-k-border rounded-lg p-3 space-y-2">
                        <p className="text-xs text-k-text"><b>Fila {pc.fila}:</b> {pc.nombre}</p>
                        {pc.similares.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-k-amber">{s.id}</span>
                            <span className="text-k-text2 flex-1 truncate">{s.nombre}</span>
                            <span className="text-k-text3">({s.motivo})</span>
                            <button onClick={() => resolverFila(pc.fila, s.id)}
                              className="px-2 py-1 rounded border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 font-bold">
                              Actualizar este
                            </button>
                          </div>
                        ))}
                        <button onClick={() => resolverFila(pc.fila, 'forzar')}
                          className="text-xs px-3 py-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-surface font-bold">
                          No es el mismo — crear nuevo
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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
