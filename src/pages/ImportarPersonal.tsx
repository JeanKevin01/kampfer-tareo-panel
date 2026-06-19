import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, X, UserCog, HardHat } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Fila {
  nombre: string; cargo: string; dni: string; tipo: string
  destino: 'TRABAJADOR' | 'SUPERVISOR'
  _fila: number; _error: string | null
}
interface Resultado { nombre: string; ok: boolean; msg: string; destino: string }

// Detecta variantes: SUPERVISOR, SUPERVISOR DE CAMPO, SUPERVISORA, SUPERV., etc.
function esSupervisor(cargo: string): boolean {
  const limpio = cargo.toUpperCase()
    .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E')
    .replace(/[ÍÌÏÎ]/g,'I').replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U')
  return /SUPERV/.test(limpio)
}

function normalizar(obj: Record<string, unknown>) {
  const n: Record<string, string> = {}
  Object.keys(obj).forEach(k => {
    const ku = k.toUpperCase().trim()
      .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E')
      .replace(/[ÍÌÏÎ]/g,'I').replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U')
    n[ku] = String(obj[k] ?? '').trim()
  })
  const tipoRaw = (n['TIPO'] || '').toUpperCase()
  return {
    nombre: (n['NOMBRE'] || n['APELLIDOS Y NOMBRES'] || n['NOMBRE COMPLETO'] || '').toUpperCase(),
    cargo:  (n['CARGO']  || n['PUESTO'] || n['OCUPACION'] || '').toUpperCase(),
    dni:    (n['DNI']    || n['DOCUMENTO'] || n['DOC'] || ''),
    tipo:   tipoRaw === 'INDIRECTO' ? 'INDIRECTO' : 'DIRECTO',
  }
}

function descargarPlantilla() {
  const datos = [
    { NOMBRE: 'GARCIA FLORES JUAN PABLO', CARGO: 'OFICIAL MECANICO',      DNI: '12345678', TIPO: 'DIRECTO' },
    { NOMBRE: 'QUISPE MAMANI ROSA',       CARGO: 'LIDER MECANICO',        DNI: '87654321', TIPO: 'DIRECTO' },
    { NOMBRE: 'LOPEZ TORRES CARLOS',      CARGO: 'CONDUCTOR',             DNI: '',         TIPO: 'DIRECTO' },
    { NOMBRE: 'RIOS HUANCA JUAN',         CARGO: 'TOPOGRAFO',             DNI: '11223344', TIPO: 'INDIRECTO' },
    { NOMBRE: 'MAMANI CCOPA DAVID',       CARGO: 'SUPERVISOR DE CAMPO',   DNI: '55667788', TIPO: 'DIRECTO' },
  ]
  const ws = XLSX.utils.json_to_sheet(datos, { header: ['NOMBRE','CARGO','DNI','TIPO'] })
  ws['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 12 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Personal')
  XLSX.writeFile(wb, 'plantilla_personal_kampfer.xlsx')
}

export default function ImportarPersonal() {
  const qc = useQueryClient()
  const [paso, setPaso]             = useState<'upload'|'preview'|'importing'|'result'>('upload')
  const [filas, setFilas]           = useState<Fila[]>([])
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [progreso, setProgreso]     = useState(0)
  const [dragging, setDragging]     = useState(false)

  const validas    = useMemo(() => filas.filter(f => !f._error), [filas])
  const errores     = useMemo(() => filas.filter(f =>  f._error), [filas])
  const nSupervisor = useMemo(() => validas.filter(f => f.destino === 'SUPERVISOR').length, [validas])
  const nTrabajador  = useMemo(() => validas.filter(f => f.destino === 'TRABAJADOR').length, [validas])

  function procesarFilas(rows: Record<string, unknown>[]) {
    const procesadas: Fila[] = rows.map((row, i) => {
      const { nombre, cargo, dni, tipo } = normalizar(row)
      let _error: string | null = null
      if (!nombre)        _error = 'NOMBRE vacío'
      else if (!cargo)    _error = 'CARGO vacío'
      else if (nombre.length < 3) _error = 'NOMBRE muy corto'
      const destino: 'TRABAJADOR' | 'SUPERVISOR' = esSupervisor(cargo) ? 'SUPERVISOR' : 'TRABAJADOR'
      return { nombre, cargo, dni, tipo, destino, _fila: i + 2, _error }
    })
    setFilas(procesadas)
    setPaso('preview')
  }

  function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const reader = new FileReader()
    if (ext === 'csv') {
      reader.onload = e => {
        const text = e.target?.result as string
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim())
        const rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.replace(/"/g,'').trim())
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
        })
        procesarFilas(rows)
      }
      reader.readAsText(file, 'UTF-8')
    } else {
      reader.onload = e => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
        procesarFilas(rows)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  async function importar() {
    if (validas.length === 0) return
    setPaso('importing')
    setProgreso(0)
    const res: Resultado[] = []
    for (let i = 0; i < validas.length; i++) {
      const f = validas[i]
      try {
        const endpoint = f.destino === 'SUPERVISOR' ? '/admin/supervisor' : '/admin/trabajador'
        const body = f.destino === 'SUPERVISOR'
          ? { nombre: f.nombre, email: '' }
          : { nombre: f.nombre, cargo: f.cargo, dni: f.dni, tipo: f.tipo }
        const r = await fetch(API + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await r.json()
        if (r.ok) res.push({ nombre: f.nombre, ok: true,  msg: `ID: ${j.id}`, destino: f.destino })
        else      res.push({ nombre: f.nombre, ok: false, msg: j.detail || 'Error', destino: f.destino })
      } catch {
        res.push({ nombre: f.nombre, ok: false, msg: 'Error de conexión', destino: f.destino })
      }
      setProgreso(Math.round(((i + 1) / validas.length) * 100))
      await new Promise(r => setTimeout(r, 80))
    }
    setResultados(res)
    qc.invalidateQueries({ queryKey: ['trabajadores'] })
    qc.invalidateQueries({ queryKey: ['supervisores'] })
    setPaso('result')
  }

  function reset() {
    setFilas([]); setResultados([]); setProgreso(0); setPaso('upload')
  }

  const exitosos = resultados.filter(r => r.ok).length
  const fallidos = resultados.filter(r => !r.ok).length

  const PASOS = [
    ['upload',    '1', 'Cargar archivo'],
    ['preview',   '2', 'Previsualizar'],
    ['importing', '3', 'Importar'],
    ['result',    '4', 'Resultado'],
  ]
  const pasoIdx = PASOS.findIndex(p => p[0] === paso)

  return (
    <div className="space-y-6">

      {/* Steps */}
      <div className="flex items-center">
        {PASOS.map(([id, num, label], i) => (
          <div key={id} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                ${paso === id
                  ? 'border-k-amber bg-amber-500/10 text-k-amber'
                  : pasoIdx > i
                  ? 'border-k-green bg-green-500/10 text-k-green'
                  : 'border-k-border bg-k-raised text-k-text3'}`}>
                {pasoIdx > i ? <CheckCircle size={16} /> : num}
              </div>
              <span className="text-[10px] text-k-text3 uppercase tracking-wide">{label}</span>
            </div>
            {i < PASOS.length - 1 && (
              <div className={`h-px flex-1 mb-5 transition-colors ${pasoIdx > i ? 'bg-k-green' : 'bg-k-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* PASO 1: Upload */}
      {paso === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if(f) handleFile(f) }}
            onClick={() => document.getElementById('file-input')?.click()}
            className={`border-2 border-dashed rounded-xl p-20 text-center cursor-pointer transition-all ${
              dragging ? 'border-k-amber bg-amber-500/5' : 'border-k-border hover:border-k-border2 hover:bg-k-raised'
            }`}>
            <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if(f) handleFile(f) }} />
            <Upload size={40} className="mx-auto mb-4 text-k-text3" />
            <p className="text-base font-bold text-k-text mb-2">
              Arrastra tu Excel o haz clic para seleccionar
            </p>
            <p className="text-sm text-k-text3">Formatos: .xlsx · .xls · .csv</p>
          </div>

          <div className="bg-k-raised border border-k-border rounded-xl p-4 flex items-center gap-3">
            <FileSpreadsheet size={16} className="text-k-blue flex-shrink-0" />
            <p className="text-sm text-k-text2 flex-1">
              Columnas: <span className="text-k-text font-bold">NOMBRE</span>,{' '}
              <span className="text-k-text font-bold">CARGO</span>,{' '}
              <span className="text-k-text font-bold">DNI</span> (opcional) y{' '}
              <span className="text-k-text font-bold">TIPO</span> (DIRECTO / INDIRECTO, default DIRECTO).
              Si el CARGO contiene la palabra <span className="text-k-amber font-bold">SUPERVISOR</span> (en cualquier
              variante), la persona se crea automáticamente como <span className="text-k-amber font-bold">supervisor</span>{' '}
              en vez de trabajador de cuadrilla.
            </p>
            <button onClick={e => { e.stopPropagation(); descargarPlantilla() }}
              className="flex items-center gap-1.5 text-xs font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg hover:bg-amber-500/20 transition-colors flex-shrink-0">
              <Download size={12} /> Plantilla
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: Preview */}
      {paso === 'preview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total leídos',  value: filas.length,    color: 'text-k-text',   border: 'border-k-border' },
              { label: 'Trabajadores',  value: nTrabajador,     color: 'text-k-text',   border: 'border-k-border' },
              { label: 'Supervisores',  value: nSupervisor,     color: 'text-k-amber',  border: 'border-amber-500/20' },
              { label: 'Con error',     value: errores.length,  color: errores.length > 0 ? 'text-k-red' : 'text-k-text3', border: errores.length > 0 ? 'border-red-500/20' : 'border-k-border' },
            ].map(s => (
              <div key={s.label} className={`bg-k-surface border ${s.border} rounded-xl p-4 flex items-center gap-3`}>
                <div className={`font-mono text-3xl font-medium ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-k-text3 uppercase tracking-wide leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-96">
              <table className="w-full">
                <thead className="sticky top-0 bg-k-raised border-b border-k-border">
                  <tr>
                    {['Fila','Nombre','Cargo','Tipo','DNI','Destino','Estado'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f._fila} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : 'hover:bg-k-raised/40'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-k-text3">F{f._fila}</td>
                      <td className="px-4 py-2.5 text-sm text-k-text">{f.nombre || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-k-text2">{f.cargo || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-k-text3">
                        {f.destino === 'TRABAJADOR' ? f.tipo : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-k-text3">{f.dni || '—'}</td>
                      <td className="px-4 py-2.5">
                        {f.destino === 'SUPERVISOR'
                          ? <span className="flex items-center gap-1 text-[10px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-fit"><UserCog size={10}/> SUPERVISOR</span>
                          : <span className="flex items-center gap-1 text-[10px] font-bold text-k-text2 bg-k-raised border border-k-border px-2 py-0.5 rounded w-fit"><HardHat size={10}/> TRABAJADOR</span>
                        }
                      </td>
                      <td className="px-4 py-2.5">
                        {f._error
                          ? <span className="text-[10px] font-bold text-k-red bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">{f._error}</span>
                          : <span className="text-[10px] font-bold text-k-green bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-k-border bg-k-raised">
              <span className="text-[11px] text-k-text3">{filas.length} filas leídas</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={reset}
              className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
              <X size={14} /> Cambiar archivo
            </button>
            <button onClick={importar} disabled={validas.length === 0}
              className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors">
              <CheckCircle size={14} /> Importar {nTrabajador} trabajadores{nSupervisor > 0 ? ` + ${nSupervisor} supervisores` : ''}
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: Importing */}
      {paso === 'importing' && (
        <div className="bg-k-surface border border-k-border rounded-xl p-12 flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-k-amber" />
          <p className="text-sm font-bold text-k-text">Importando {validas.length} registros…</p>
          <div className="w-full max-w-md bg-k-raised rounded-full h-2 overflow-hidden">
            <div className="h-full bg-k-amber transition-all" style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-k-text3 font-mono">{progreso}%</p>
        </div>
      )}

      {/* PASO 4: Result */}
      {paso === 'result' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-k-surface border border-green-500/20 rounded-xl p-5 flex items-center gap-4">
              <CheckCircle size={28} className="text-k-green" />
              <div>
                <div className="font-mono text-3xl font-medium text-k-green">{exitosos}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide">Importados con éxito</div>
              </div>
            </div>
            <div className="bg-k-surface border border-k-border rounded-xl p-5 flex items-center gap-4">
              <XCircle size={28} className={fallidos > 0 ? 'text-k-red' : 'text-k-text3'} />
              <div>
                <div className={`font-mono text-3xl font-medium ${fallidos > 0 ? 'text-k-red' : 'text-k-text3'}`}>{fallidos}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide">Con error</div>
              </div>
            </div>
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-96">
              <table className="w-full">
                <thead className="sticky top-0 bg-k-raised border-b border-k-border">
                  <tr>
                    {['Nombre','Destino','Resultado'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => (
                    <tr key={i} className="border-b border-k-border last:border-0">
                      <td className="px-4 py-2.5 text-sm text-k-text">{r.nombre}</td>
                      <td className="px-4 py-2.5 text-xs text-k-text3">{r.destino}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          r.ok
                            ? 'text-k-green bg-green-500/10 border border-green-500/20'
                            : 'text-k-red bg-red-500/10 border border-red-500/20'
                        }`}>{r.msg}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={reset}
            className="w-full flex items-center justify-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-3 rounded-lg transition-colors">
            <Upload size={16} /> Importar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}