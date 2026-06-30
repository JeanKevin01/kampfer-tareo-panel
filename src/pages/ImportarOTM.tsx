// ImportarOTM.tsx — Importador de archivos XLS de HH presupuestadas por OTM
// El ingeniero de costos llena la columna B ("Fase") en el archivo XLS.
// Solo se importan las filas donde la columna Fase no está vacía.
import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

import { API_BASE } from '@/lib/api'
const API = API_BASE

// Plantillas de hitos por tipo de trabajo (Rules of Credit)
const PLANTILLAS_KEYWORDS: Record<string, string> = {
  MONTAJE: 'MONTAJE', INSTALACION: 'MONTAJE', INSTALACIÓN: 'MONTAJE',
  TUBERIA: 'TUBERIA', TUBERÍA: 'TUBERIA', PIPING: 'TUBERIA',
  EXCAVAC: 'EXCAVACION',
  RELLEN: 'RELLENO',
  ACERO: 'ACERO', FIERRO: 'ACERO', ARMADO: 'ACERO',
  ENCOFR: 'ENCOFRADO',
  CONCRET: 'CONCRETO',
  SHOTCRETE: 'SHOTCRETE',
}

function guessTipo(desc: string): string {
  const d = (desc || '').toUpperCase()
  for (const [kw, tipo] of Object.entries(PLANTILLAS_KEYWORDS)) {
    if (d.includes(kw)) return tipo
  }
  return 'GENERICO'
}

function otmDeFilename(name: string): string {
  const m = name.match(/OTM-\d+/i)
  return m ? m[0].toUpperCase() : ''
}

interface PartidaPreview {
  otm_id: string
  codigo: string
  fase: string | null        // null para nodos padre del WBS
  descripcion: string
  unidad: string | null      // null para nodos padre
  hh_presup: number
  tipo: string
  nivel: number
  parent_codigo: string | null
  ok: boolean
  error?: string
}

function parseOTMFile(file: File): Promise<PartidaPreview[]> {
  return new Promise((resolve, reject) => {
    const otm_id = otmDeFilename(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        const partidas: PartidaPreview[] = []
        
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          const codigo = String(row[0] || '').trim()       // Col A: Item
          const fase   = String(row[1] || '').trim() || null  // Col B: Fase (null = nodo padre)
          const desc   = String(row[2] || '').trim()       // Col C: Descripción
          const unidad = String(row[3] || '').trim() || null   // Col D: Und.
          const hhRaw  = row[7]                             // Col H: HH presupuestadas
          
          if (!codigo || !desc) continue
          // Ambos: nodos hoja (con Fase) y nodos padre (sin Fase pero con HH)
          
          const hh = typeof hhRaw === 'number' ? hhRaw : parseFloat(String(hhRaw || '0').replace(',', '.'))
          // Calcular nivel y parent_codigo desde el código item
          const sep = codigo.includes('.') ? '.' : ','
          const nivel = codigo.split(sep).length
          const parent_codigo = nivel > 1 ? codigo.split(sep).slice(0, -1).join(sep) : null
          
          const ok = !isNaN(hh) && hh > 0 && !!otm_id
          const esPadre = !fase
          partidas.push({
            otm_id: otm_id || '—',
            codigo, fase, descripcion: desc, unidad,
            hh_presup: isNaN(hh) ? 0 : Math.round(hh * 100) / 100,
            tipo: esPadre ? 'PADRE' : guessTipo(desc),
            nivel, parent_codigo,
            ok: esPadre ? (!!otm_id && !isNaN(hh) && hh > 0) : ok,
            error: !otm_id ? 'OTM no detectada en el nombre del archivo'
                 : (isNaN(hh) || hh <= 0) && !esPadre ? 'HH inválidas'
                 : undefined
          })
        }
        resolve(partidas)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportarOTM() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [partidas, setPartidas] = useState<PartidaPreview[]>([])
  const [archivos, setArchivos] = useState<string[]>([])
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; err: number } | null>(null)

  const importMutation = useMutation({
    mutationFn: async (items: PartidaPreview[]) => {
      const payload = items.filter(p => p.ok).map(p => ({
        otm_id: p.otm_id,
        codigo: p.codigo,
        fase: p.fase,
        descripcion: p.descripcion,
        unidad: p.unidad,
        hh_presup: p.hh_presup,
        tipo_plantilla: p.tipo,
      }))
      const r = await fetch(`${API}/ev/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partidas: payload }),
      })
      if (!r.ok) throw new Error((await r.json()).detail || 'Error al importar')
      return r.json()
    },
    onSuccess: (d) => {
      setResultado({ ok: d.importadas ?? 0, err: d.errores ?? 0 })
      qc.invalidateQueries({ queryKey: ['ev-partidas'] })
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
    },
  })

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setProcesando(true)
    setResultado(null)
    const nombres: string[] = []
    const todas: PartidaPreview[] = []
    
    for (const f of Array.from(files)) {
      if (!f.name.match(/\.xls[xm]?$/i)) continue
      nombres.push(f.name)
      try {
        const parsed = await parseOTMFile(f)
        todas.push(...parsed)
      } catch {
        console.error('Error parseando', f.name)
      }
    }
    
    setArchivos(nombres)
    setPartidas(todas)
    setProcesando(false)
  }

  const validas   = partidas.filter(p => p.ok)
  const invalidas = partidas.filter(p => !p.ok)

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-k-border bg-k-raised">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={18} className="text-k-amber" />
          <div>
            <h3 className="text-sm font-bold text-k-text">Importar presupuesto de HH desde XLS</h3>
            <p className="text-[11px] text-k-text3 mt-0.5">
              Archivos OTM-XXXX_Horas_Hombre.xls — columna B debe tener la <strong>Fase</strong> en las filas a importar
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Instrucciones */}
        <div className="bg-k-raised border border-k-border rounded-lg p-4 text-[11px] text-k-text2 space-y-1.5">
          <p><strong className="text-k-amber">① Preparar el XLS:</strong> en la columna B (antes "Item Alterno"), escribe la Fase para cada fila que quieras importar como partida. Ejemplo: <code className="font-mono text-k-text bg-k-border px-1 rounded">Mecánico</code>, <code className="font-mono text-k-text bg-k-border px-1 rounded">Civil</code>, <code className="font-mono text-k-text bg-k-border px-1 rounded">Eléctrico</code>.</p>
          <p><strong className="text-k-amber">② Solo se importan</strong> las filas donde la columna B tiene valor. Las filas sin Fase se ignoran (pueden ser subtotales o ítems hoja que no quieres rastrear).</p>
          <p><strong className="text-k-amber">③ HH Gastadas</strong> se calcularán automáticamente desde el tareo diario — no requieren entrada manual.</p>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-k-border2 rounded-xl p-8 text-center cursor-pointer hover:border-k-amber transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          onDragOver={e => e.preventDefault()}
        >
          <input ref={inputRef} type="file" accept=".xls,.xlsx,.xlsm" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)} />
          {procesando ? (
            <div className="flex items-center justify-center gap-2 text-k-text3 text-sm">
              <Loader2 size={16} className="animate-spin" /> Procesando archivos...
            </div>
          ) : (
            <>
              <Upload size={28} className="mx-auto text-k-amber mb-3" />
              <p className="text-sm font-bold text-k-text mb-1">Arrastra los archivos XLS aquí</p>
              <p className="text-[11px] text-k-text3">o haz clic para seleccionarlos</p>
              <p className="text-[10px] text-k-text3 mt-2">OTM-0005_Horas_Hombre.xls, OTM-0016_Horas_Hombre.xls, ...</p>
            </>
          )}
        </div>

        {/* Archivos cargados */}
        {archivos.length > 0 && (
          <div className="text-[11px] text-k-text3">
            {archivos.length} archivo{archivos.length > 1 ? 's' : ''} procesado{archivos.length > 1 ? 's' : ''}:
            {' '}{archivos.join(', ')}
          </div>
        )}

        {/* Preview */}
        {partidas.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">
                Vista previa — {validas.length} a importar{invalidas.length > 0 ? `, ${invalidas.length} con errores` : ''}
              </div>
              <button
                onClick={() => { setPartidas([]); setArchivos([]) }}
                className="flex items-center gap-1 text-[11px] text-k-red hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Limpiar
              </button>
            </div>

            <div className="overflow-x-auto border border-k-border rounded-lg">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-k-border bg-k-raised">
                    {['', 'OTM', 'Código', 'Fase', 'Descripción', 'HH', 'Tipo hito'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-k-text3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partidas.map((p, i) => (
                    <tr key={i} className={`border-b border-k-border last:border-0 ${!p.ok ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2">
                        {p.ok
                          ? <CheckCircle size={12} className="text-k-green" />
                          : <AlertCircle size={12} className="text-k-red" title={p.error ?? ''} />}
                      </td>
                      <td className="px-3 py-2 font-mono text-k-amber">{p.otm_id}</td>
                      <td className="px-3 py-2 font-mono text-k-text3">{p.codigo}</td>
                      <td className="px-3 py-2">
                        {p.fase ? (
                          <span className="bg-amber-500/10 border border-amber-500/20 text-k-amber px-1.5 py-0.5 rounded font-bold text-[10px]">
                            {p.fase}
                          </span>
                        ) : (
                          <span className="bg-k-raised border border-k-border text-k-text3 px-1.5 py-0.5 rounded text-[10px] italic">
                            padre WBS
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-k-text max-w-[220px] truncate" title={p.descripcion}>
                        {p.descripcion}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-k-text text-right">{p.hh_presup.toFixed(1)}</td>
                      <td className="px-3 py-2 text-k-text3">{p.tipo}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-k-border bg-k-raised/50">
                    <td colSpan={5} className="px-3 py-2 text-k-text3 font-bold">Total HH a importar</td>
                    <td className="px-3 py-2 font-mono font-bold text-k-amber text-right">
                      {validas.reduce((s, p) => s + p.hh_presup, 0).toFixed(1)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Resultado */}
            {resultado && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold ${
                resultado.err === 0
                  ? 'bg-green-500/10 border border-green-500/20 text-k-green'
                  : 'bg-amber-500/10 border border-amber-500/20 text-k-amber'
              }`}>
                <CheckCircle size={16} />
                {resultado.ok} partidas importadas
                {resultado.err > 0 && `, ${resultado.err} con errores`}
              </div>
            )}

            {/* Botón importar */}
            {!resultado && (
              <button
                onClick={() => importMutation.mutate(partidas)}
                disabled={validas.length === 0 || importMutation.isPending}
                className="w-full flex items-center justify-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-3 rounded-lg transition-colors"
              >
                {importMutation.isPending
                  ? <><Loader2 size={16} className="animate-spin" /> Importando...</>
                  : <><Upload size={16} /> Importar {validas.filter(p=>p.fase).length} hojas + {validas.filter(p=>!p.fase).length} padres ({validas.reduce((s,p)=>s+p.hh_presup,0).toFixed(0)} HH total)</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}