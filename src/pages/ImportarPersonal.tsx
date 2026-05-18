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
  const [paso, setPaso]           = useState<'upload'|'preview'|'importing'|'result'>('upload')
  const [filas, setFilas]         = useState<Fila[]>([])
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [progreso, setProgreso]   = useState(0)
  const [dragging, setDragging]   = useState(false)

  const validas  = useMemo(() => filas.filter(f => !f._error), [filas])
  const errores  = useMemo(() => filas.filter(f =>  f._error), [filas])

  function procesarFilas(rows: Record<string, unknown>[]) {
    const procesadas: Fila[] = rows.map((row, i) => {
      const { nombre, cargo, dni } = normalizar(row)
      let _error: string | null = null
      if (!nombre) _error = 'NOMBRE vacío'
      else if (!cargo) _error = 'CARGO vacío'
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
        else       res.push({ nombre: f.nombre, ok: false, msg: j.detail || 'Error' })
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

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Steps */}
      <div className="flex items-center gap-0">
        {[['upload','1','Cargar archivo'],['preview','2','Previsualizar'],['importing','3','Importar'],['result','4','Resultado']].map(([id, num, label], i, arr) => (
          <div key={id} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${paso === id ? 'border-k-amber bg-amber-500/10 text-k-amber'
                  : (arr.findIndex(a => a[0] === paso) > i) ? 'border-k-green bg-green-500/10 text-k-green'
                  : 'border-k-border bg-k-raised text-k-text3'}`}>
                {arr.findIndex(a => a[0] === paso) > i ? <CheckCircle size={14} /> : num}
              </div>
              <span className="text-[9px] text-k-text3 uppercase tracking-wide text-center">{label}</span>
            </div>
            {i < arr.length - 1 && <div className="h-px flex-1 bg-k-border mb-4" />}
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
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragging ? 'border-k-amber bg-amber-500/5' : 'border-k-border hover:border-k-border2 hover:bg-k-raised'
            }`}>
            <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if(f) handleFile(f) }} />
            <Upload size={32} className="mx-auto mb-3 text-k-text3" />
            <p className="text-sm font-bold text-k-text mb-1">Arrastra tu Excel o haz clic para seleccionar</p>
            <p className="text-xs text-k-text3">Formatos: .xlsx · .xls · .csv</p>
          </div>

          <div className="bg-k-raised border border-k-border rounded-xl p-4 flex items-start gap-3">
            <FileSpreadsheet size={16} className="text-k-blue mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-k-text2 leading-relaxed">
                El archivo debe tener columnas <span className="text-k-text font-bold">NOMBRE</span>, <span className="text-k-text font-bold">CARGO</span> y opcionalmente <span className="text-k-text font-bold">DNI</span>.
              </p>
            </div>
            <button onClick={descargarPlantilla}
              className="flex items-center gap-1.5 text-[11px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors flex-shrink-0">
              <Download size={11} /> Plantilla
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: Preview */}
      {paso === 'preview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total leídos', value: filas.length,   color: 'text-k-text'  },
              { label: 'Válidos',      value: validas.length, color: 'text-k-green' },
              { label: 'Con error',    value: errores.length, color: errores.length > 0 ? 'text-k-red' : 'text-k-text3' },
            ].map(s => (
              <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4 flex items-center gap-3">
                <div className={`font-mono text-3xl font-medium ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-k-raised border-b border-k-border">
                <tr>
                  {['Fila','Nombre','Cargo','DNI','Estado'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f._fila} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : 'hover:bg-k-raised/40'}`}>
                    <td className="px-4 py-2 font-mono text-xs text-k-text3">F{f._fila}</td>
                    <td className="px-4 py-2 text-xs text-k-text">{f.nombre || '—'}</td>
                    <td className="px-4 py-2 text-xs text-k-text2">{f.cargo || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-k-text3">{f.dni || '—'}</td>
                    <td className="px-4 py-2">
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

          <div className="flex gap-3 justify-end">
            <button onClick={reset}
              className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
              <X size={14} /> Cambiar archivo
            </button>
            <button onClick={importar} disabled={validas.length === 0}
              className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
              <CheckCircle size={14} /> Importar {validas.length} trabajadores
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: Importando */}
      {paso === 'importing' && (
        <div className="bg-k-surface border border-k-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 size={18} className="animate-spin text-k-amber" />
            <span className="text-sm font-bold text-k-text">Importando personal… {progreso}%</span>
          </div>
          <div className="w-full bg-k-raised rounded-full h-2 border border-k-border">
            <div className="h-full bg-k-amber rounded-full transition-all duration-300" style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-k-text3">Por favor espera, no cierres esta página.</p>
        </div>
      )}

      {/* PASO 4: Resultado */}
      {paso === 'result' && (
        <div className="space-y-4">
          <div className="bg-k-surface border border-k-border rounded-xl p-6 text-center">
            <div className="text-5xl mb-3">{fallidos === 0 ? '🎉' : '⚠️'}</div>
            <h2 className="font-condensed font-bold text-2xl text-k-text mb-2">
              {fallidos === 0 ? '¡Importación completada!' : 'Importación con advertencias'}
            </h2>
            <div className="flex justify-center gap-6 my-4">
              <div className="text-center">
                <div className="font-mono text-3xl font-medium text-k-green">{exitosos}</div>
                <div className="text-[10px] text-k-text3 uppercase tracking-wide">Importados</div>
              </div>
              {fallidos > 0 && (
                <div className="text-center">
                  <div className="font-mono text-3xl font-medium text-k-red">{fallidos}</div>
                  <div className="text-[10px] text-k-text3 uppercase tracking-wide">Con error</div>
                </div>
              )}
            </div>
          </div>

          {fallidos > 0 && (
            <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {resultados.filter(r => !r.ok).map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-k-border last:border-0">
                  <XCircle size={13} className="text-k-red flex-shrink-0" />
                  <span className="text-xs text-k-text flex-1">{r.nombre}</span>
                  <span className="text-xs text-k-red">{r.msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={reset}
              className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
              <Upload size={14} /> Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}