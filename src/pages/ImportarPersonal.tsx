import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, X } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Fila { nombre: string; cargo: string; dni: string; _fila: number; _error: string | null }
interface Resultado { nombre: string; ok: boolean; msg: string }

function normalizar(obj: Record<string, unknown>) {
  const n: Record<string, string> = {}
  Object.keys(obj).forEach(k => {
    const ku = k.toUpperCase().trim()
      .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E')
      .replace(/[ÍÌÏÎ]/g,'I').replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U')
    n[ku] = String(obj[k] ?? '').trim()
  })
  return {
    nombre: (n['NOMBRE'] || n['APELLIDOS Y NOMBRES'] || n['NOMBRE COMPLETO'] || '').toUpperCase(),
    cargo:  (n['CARGO']  || n['PUESTO'] || n['OCUPACION'] || '').toUpperCase(),
    dni:    (n['DNI']    || n['DOCUMENTO'] || n['DOC'] || ''),
  }
}

function descargarPlantilla() {
  const datos = [
    { NOMBRE: 'GARCIA FLORES JUAN PABLO', CARGO: 'OFICIAL MECANICO',  DNI: '12345678' },
    { NOMBRE: 'QUISPE MAMANI ROSA',       CARGO: 'LIDER MECANICO',    DNI: '87654321' },
    { NOMBRE: 'LOPEZ TORRES CARLOS',      CARGO: 'CONDUCTOR',         DNI: '' },
  ]
  const ws = XLSX.utils.json_to_sheet(datos, { header: ['NOMBRE','CARGO','DNI'] })
  ws['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 12 }]
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

  const validas = useMemo(() => filas.filter(f => !f._error), [filas])
  const errores = useMemo(() => filas.filter(f =>  f._error), [filas])

  function procesarFilas(rows: Record<string, unknown>[]) {
    const procesadas: Fila[] = rows.map((row, i) => {
      const { nombre, cargo, dni } = normalizar(row)
      let _error: string | null = null
      if (!nombre)        _error = 'NOMBRE vacío'
      else if (!cargo)    _error = 'CARGO vacío'
      else if (nombre.length < 3) _error = 'NOMBRE muy corto'
      return { nombre, cargo, dni, _fila: i + 2, _error }
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
        const r = await fetch(API + '/admin/trabajador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: f.nombre, cargo: f.cargo, dni: f.dni }),
        })
        const j = await r.json()
        if (r.ok) res.push({ nombre: f.nombre, ok: true,  msg: `ID: ${j.id}` })
        else      res.push({ nombre: f.nombre, ok: false, msg: j.detail || 'Error' })
      } catch {
        res.push({ nombre: f.nombre, ok: false, msg: 'Error de conexión' })
      }
      setProgreso(Math.round(((i + 1) / validas.length) * 100))
      await new Promise(r => setTimeout(r, 80))
    }
    setResultados(res)
    qc.invalidateQueries({ queryKey: ['trabajadores'] })
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
              El archivo debe tener columnas{' '}
              <span className="text-k-text font-bold">NOMBRE</span>,{' '}
              <span className="text-k-text font-bold">CARGO</span> y opcionalmente{' '}
              <span className="text-k-text font-bold">DNI</span>.
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
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total leídos', value: filas.length,   color: 'text-k-text',  border: 'border-k-border' },
              { label: 'Válidos',      value: validas.length, color: 'text-k-green', border: 'border-green-500/20' },
              { label: 'Con error',    value: errores.length, color: errores.length > 0 ? 'text-k-red' : 'text-k-text3', border: errores.length > 0 ? 'border-red-500/20' : 'border-k-border' },
            ].map(s => (
              <div key={s.label} className={`bg-k-surface border ${s.border} rounded-xl p-5 flex items-center gap-4`}>
                <div className={`font-mono text-4xl font-medium ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-96">
              <table className="w-full">
                <thead className="sticky top-0 bg-k-raised border-b border-k-border">
                  <tr>
                    {['Fila','Nombre','Cargo','DNI','Estado'].map(h => (
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
                      <td className="px-4 py-2.5 font-mono text-xs text-k-text3">{f.dni || '—'}</td>
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
              <CheckCircle size={14} /> Importar {validas.length} trabajadores
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: Importando */}
      {paso === 'importing' && (
        <div className="bg-k-surface border border-k-border rounded-xl p-10 space-y-6 text-center">
          <Loader2 size={40} className="animate-spin text-k-amber mx-auto" />
          <div>
            <p className="text-lg font-bold text-k-text mb-1">Importando personal…</p>
            <p className="text-sm text-k-text3">Por favor espera, no cierres esta página</p>
          </div>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between text-xs text-k-text3 mb-2">
              <span>Progreso</span>
              <span className="font-mono font-bold text-k-amber">{progreso}%</span>
            </div>
            <div className="w-full bg-k-raised rounded-full h-3 border border-k-border">
              <div className="h-full bg-k-amber rounded-full transition-all duration-300" style={{ width: `${progreso}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* PASO 4: Resultado */}
      {paso === 'result' && (
        <div className="space-y-4">
          <div className="bg-k-surface border border-k-border rounded-xl p-10 text-center">
            <div className="text-6xl mb-4">{fallidos === 0 ? '🎉' : '⚠️'}</div>
            <h2 className="font-condensed font-bold text-2xl text-k-text mb-2">
              {fallidos === 0 ? '¡Importación completada!' : 'Importación con advertencias'}
            </h2>
            <p className="text-sm text-k-text3 mb-6">
              {fallidos === 0
                ? 'Todos los trabajadores fueron registrados exitosamente.'
                : `${fallidos} registros tuvieron errores — probablemente ya existían.`}
            </p>
            <div className="flex justify-center gap-8 mb-6">
              <div className="text-center">
                <div className="font-mono text-4xl font-medium text-k-green">{exitosos}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide mt-1">Importados</div>
              </div>
              {fallidos > 0 && (
                <div className="text-center">
                  <div className="font-mono text-4xl font-medium text-k-red">{fallidos}</div>
                  <div className="text-[11px] text-k-text3 uppercase tracking-wide mt-1">Con error</div>
                </div>
              )}
              <div className="text-center">
                <div className="font-mono text-4xl font-medium text-k-amber">{exitosos + fallidos}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide mt-1">Total procesados</div>
              </div>
            </div>
            <button onClick={reset}
              className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-6 py-2.5 rounded-lg transition-colors mx-auto">
              <Upload size={14} /> Importar otro archivo
            </button>
          </div>

          {fallidos > 0 && (
            <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-k-raised border-b border-k-border">
                <span className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Detalle de errores</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {resultados.filter(r => !r.ok).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-k-border last:border-0">
                    <XCircle size={14} className="text-k-red flex-shrink-0" />
                    <span className="text-sm text-k-text flex-1">{r.nombre}</span>
                    <span className="text-xs text-k-red">{r.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}