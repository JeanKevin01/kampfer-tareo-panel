// ============================================================
// src/components/ev/ImportarPartidas.tsx
// Importador masivo de partidas EV — patrón de ImportarPersonal
// Hoja PARTIDAS (obligatoria) + AVANCES y HH (opcionales, histórico)
// ============================================================
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, X,
} from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Plantilla { tipo_actividad: string; hitos: unknown[] }

interface FilaPartida {
  codigo: string; otm_id: string | null; fase: string | null; sub_fase: string | null
  descripcion: string; unidad: string | null; sistema: string | null
  metrado_presup: number; metrado_proyec: number | null; hh_presup: number
  tipo_actividad: string | null; nivel: number; parent_codigo: string | null
  _fila: number; _error: string | null
}
interface FilaAvance {
  codigo: string; semana: number; hito: number; cantidad_acum: number
  _fila: number; _error: string | null
}
interface FilaHH {
  codigo: string; semana: number; hh: number
  _fila: number; _error: string | null
}

function norm(obj: Record<string, unknown>) {
  const n: Record<string, string> = {}
  Object.keys(obj).forEach(k => {
    const ku = k.toUpperCase().trim()
      .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[ÍÌÏÎ]/g, 'I').replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U')
    n[ku] = String(obj[k] ?? '').trim()
  })
  return n
}

const num = (s: string): number | null => {
  if (s === '' || s === undefined || s === null) return null
  const v = Number(String(s).replace(/,/g, '.'))
  return Number.isFinite(v) ? v : null
}

function descargarPlantilla() {
  const partidas = [
    { OTM: 'OTM-014', CODIGO: '10,02,01', FASE: '10', SUB_FASE: '10,02', DESCRIPCION: 'Excavación en roca', UNIDAD: 'm3', TIPO_ACTIVIDAD: 'EXCAVACION', SISTEMA: 'MOV01', METRADO_PRESUP: 980, METRADO_PROYEC: '', HH_PRESUP: 1600 },
    { OTM: 'OTM-014', CODIGO: '20,03', FASE: '20', SUB_FASE: '20,03', DESCRIPCION: 'Relleno compactado', UNIDAD: 'm3', TIPO_ACTIVIDAD: 'RELLENO', SISTEMA: 'MOV01', METRADO_PRESUP: 1250, METRADO_PROYEC: '', HH_PRESUP: 900 },
    { OTM: 'OTM-014', CODIGO: '40,01,01', FASE: '40', SUB_FASE: '40,01', DESCRIPCION: 'Acero en zapatas', UNIDAD: 'kg', TIPO_ACTIVIDAD: 'ACERO', SISTEMA: 'AC01', METRADO_PRESUP: 18500, METRADO_PROYEC: '', HH_PRESUP: 740 },
  ]
  const avances = [
    { CODIGO: '10,02,01', SEMANA: 1, HITO: 1, CANTIDAD_ACUM: 350 },
    { CODIGO: '10,02,01', SEMANA: 2, HITO: 1, CANTIDAD_ACUM: 720 },
    { CODIGO: '20,03', SEMANA: 2, HITO: 2, CANTIDAD_ACUM: 180 },
  ]
  const hh = [
    { CODIGO: '10,02,01', SEMANA: 1, HH: 540 },
    { CODIGO: '10,02,01', SEMANA: 2, HH: 610 },
    { CODIGO: '20,03', SEMANA: 2, HH: 120 },
  ]
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(partidas)
  ws1['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 35 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'PARTIDAS')
  const ws2 = XLSX.utils.json_to_sheet(avances)
  XLSX.utils.book_append_sheet(wb, ws2, 'AVANCES')
  const ws3 = XLSX.utils.json_to_sheet(hh)
  XLSX.utils.book_append_sheet(wb, ws3, 'HH')
  XLSX.writeFile(wb, 'plantilla_partidas_valor_ganado.xlsx')
}

export default function ImportarPartidas() {
  const qc = useQueryClient()
  const [paso, setPaso] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload')
  const [partidas, setPartidas] = useState<FilaPartida[]>([])
  const [avances, setAvances] = useState<FilaAvance[]>([])
  const [hh, setHh] = useState<FilaHH[]>([])
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; detalle?: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)

  const { data: plantillas = [] } = useQuery<Plantilla[]>({
    queryKey: ['ev-plantillas'],
    queryFn: async () => (await fetch(`${API}/ev/plantillas`)).json(),
  })
  const tipos = useMemo(() => new Set(plantillas.map(p => p.tipo_actividad)), [plantillas])

  const pOk = useMemo(() => partidas.filter(f => !f._error), [partidas])
  const pErr = useMemo(() => partidas.filter(f => f._error), [partidas])
  const aOk = useMemo(() => avances.filter(f => !f._error), [avances])
  const aErr = useMemo(() => avances.filter(f => f._error), [avances])
  const hOk = useMemo(() => hh.filter(f => !f._error), [hh])
  const hErr = useMemo(() => hh.filter(f => f._error), [hh])
  const totalErr = pErr.length + aErr.length + hErr.length

  function procesar(wb: XLSX.WorkBook) {
    const hojaP = wb.Sheets['PARTIDAS'] ?? wb.Sheets[wb.SheetNames[0]]
    if (!hojaP) { setResultado({ ok: false, msg: 'No se encontró la hoja PARTIDAS' }); setPaso('result'); return }

    const rowsP = XLSX.utils.sheet_to_json<Record<string, unknown>>(hojaP)
    const codigos = new Set<string>()
    const fp: FilaPartida[] = rowsP.map((row, i) => {
      const n = norm(row)
      const codigo = n['CODIGO'] || ''
      const tipo = null
      const fase  = n['FASE'] || null   // null para nodos padre del WBS
      const unidad = n['UNIDAD'] || null
      let _error: string | null = null
      if (!codigo) _error = 'CODIGO vacío'
      else if (codigos.has(codigo)) _error = 'CODIGO duplicado en el archivo'
      else if (!n['DESCRIPCION']) _error = 'DESCRIPCION vacía'
      // Solo validar unidad si es nodo hoja (tiene Fase)
      else if (fase && !unidad) _error = 'UNIDAD vacía (requerida para nodos con Fase)'
      codigos.add(codigo)
      // Calcular nivel y parent_codigo desde el código
      const sep = codigo.includes('.') ? '.' : ','
      const nivel = codigo ? codigo.split(sep).length : 1
      const parent_codigo = nivel > 1 ? codigo.split(sep).slice(0, -1).join(sep) : null
      return {
        codigo,
        otm_id: n['OTM'] || n['OTM_ID'] || null,
        fase: fase,
        sub_fase: n['SUB_FASE'] || n['SUBFASE'] || null,
        descripcion: n['DESCRIPCION'] || '',
        unidad: unidad,
        sistema: n['SISTEMA'] || null,
        metrado_presup: num(n['METRADO_PRESUP']) ?? 0,
        metrado_proyec: num(n['METRADO_PROYEC']),
        hh_presup: num(n['HH_PRESUP']) ?? 0,
        tipo_actividad: tipo,
        nivel, parent_codigo,
        _fila: i + 2, _error,
      }
    })

    const fa: FilaAvance[] = wb.Sheets['AVANCES']
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['AVANCES']).map((row, i) => {
          const n = norm(row)
          let _error: string | null = null
          if (!n['CODIGO']) _error = 'CODIGO vacío'
          else if (!codigos.has(n['CODIGO'])) _error = `CODIGO ${n['CODIGO']} no está en PARTIDAS`
          else if (num(n['SEMANA']) === null || (num(n['SEMANA']) ?? 0) < 1) _error = 'SEMANA inválida'
          else if (num(n['HITO']) === null) _error = 'HITO inválido'
          else if (num(n['CANTIDAD_ACUM']) === null) _error = 'CANTIDAD_ACUM inválida'
          return {
            codigo: n['CODIGO'] || '', semana: num(n['SEMANA']) ?? 0,
            hito: num(n['HITO']) ?? 0, cantidad_acum: num(n['CANTIDAD_ACUM']) ?? 0,
            _fila: i + 2, _error,
          }
        })
      : []

    const fh: FilaHH[] = wb.Sheets['HH']
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['HH']).map((row, i) => {
          const n = norm(row)
          let _error: string | null = null
          if (!n['CODIGO']) _error = 'CODIGO vacío'
          else if (!codigos.has(n['CODIGO'])) _error = `CODIGO ${n['CODIGO']} no está en PARTIDAS`
          else if (num(n['SEMANA']) === null || (num(n['SEMANA']) ?? 0) < 1) _error = 'SEMANA inválida'
          else if (num(n['HH']) === null) _error = 'HH inválida'
          return {
            codigo: n['CODIGO'] || '', semana: num(n['SEMANA']) ?? 0,
            hh: num(n['HH']) ?? 0, _fila: i + 2, _error,
          }
        })
      : []

    setPartidas(fp); setAvances(fa); setHh(fh); setPaso('preview')
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer)
      procesar(XLSX.read(data, { type: 'array' }))
    }
    reader.readAsArrayBuffer(file)
  }

  async function importar() {
    setPaso('importing')
    try {
      const res = await fetch(`${API}/ev/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partidas: pOk.map(({ _fila, _error, ...p }) => p),
          avances: aOk.map(({ _fila, _error, ...a }) => a),
          hh: hOk.map(({ _fila, _error, ...h }) => h),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        const det = j?.detail?.errores ?? (typeof j?.detail === 'string' ? [j.detail] : ['Error desconocido'])
        setResultado({ ok: false, msg: 'La importación fue rechazada (no se guardó nada):', detalle: det })
      } else {
        setResultado({
          ok: true,
          msg: `${j.partidas_creadas} partidas creadas, ${j.partidas_actualizadas} actualizadas, ${j.avances_importados} avances y ${j.hh_importadas} HH históricas importadas.`,
        })
        qc.invalidateQueries({ queryKey: ['ev-partidas'] })
        qc.invalidateQueries({ queryKey: ['ev-reporte'] })
        qc.invalidateQueries({ queryKey: ['ev-captura'] })
        qc.invalidateQueries({ queryKey: ['ev-curva'] })
        qc.invalidateQueries({ queryKey: ['ev-semanas'] })
      }
    } catch (e) {
      setResultado({ ok: false, msg: `Error de red: ${(e as Error).message}` })
    }
    setPaso('result')
  }

  const reset = () => { setPartidas([]); setAvances([]); setHh([]); setResultado(null); setPaso('upload') }

  // ---------------- UI ----------------
  if (paso === 'upload') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-k-text3 max-w-2xl">
            Carga masiva de partidas desde Excel. La hoja <span className="text-k-text2 font-bold">PARTIDAS</span> es
            obligatoria; <span className="text-k-text2 font-bold">AVANCES</span> y <span className="text-k-text2 font-bold">HH</span> son
            opcionales — úsalas si el proyecto ya está en marcha y quieres traer el histórico.
            Los hitos se asignan automáticamente según TIPO_ACTIVIDAD
            ({plantillas.map(p => p.tipo_actividad).join(', ') || 'cargando catálogo…'}).
          </p>
          <button onClick={descargarPlantilla}
            className="bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors flex items-center gap-2">
            <Download size={14} /> Descargar plantilla
          </button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFile(f)
          }}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
            dragging ? 'border-k-amber bg-amber-500/5' : 'border-k-border bg-k-surface'
          }`}
        >
          <Upload size={32} className="mx-auto text-k-text3 mb-3" />
          <p className="text-sm text-k-text2 font-bold mb-1">Arrastra tu Excel aquí</p>
          <p className="text-xs text-k-text3 mb-4">o</p>
          <label className="inline-flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg cursor-pointer transition-colors">
            <FileSpreadsheet size={14} /> Seleccionar archivo
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        </div>
      </div>
    )
  }

  if (paso === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-k-green font-bold flex items-center gap-1">
              <CheckCircle size={14} />
              {pOk.filter(p=>p.fase).length} nodos hoja +{' '}
              {pOk.filter(p=>!p.fase).length} nodos padre
              {aOk.length > 0 && ` · ${aOk.length} avances`}
              {hOk.length > 0 && ` · ${hOk.length} HH`}
            </span>
            {totalErr > 0 && (
              <span className="text-k-red font-bold flex items-center gap-1">
                <XCircle size={14} /> {totalErr} con error (no se importarán)
              </span>
            )}
            <span className="text-k-text3 text-[11px]">
              · filas padre/resumen omitidas automáticamente
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={reset}
              className="bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors flex items-center gap-2">
              <X size={14} /> Cancelar
            </button>
            <button onClick={importar} disabled={pOk.length === 0}
              className="bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2">
              <Upload size={14} /> Importar {pOk.length} partidas
            </button>
          </div>
        </div>

        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-k-border bg-k-raised text-[11px] font-bold text-k-text3 uppercase tracking-widest">
            Hoja PARTIDAS
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-k-border">
                  {['Fila', 'OTM', 'Código', 'Fase', 'Sub-Fase', 'Descripción', 'Und', 'Metrado', 'HH Ppto', 'Estado'].map(h => (
                    <th key={h} className="py-2 px-3 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partidas.map(f => (
                  <tr key={f._fila} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : ''}`}>
                    <td className="py-1.5 px-3 text-[11px] text-k-text3 font-mono">{f._fila}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2">{f.otm_id ?? '—'}</td>
                    <td className="py-1.5 px-3 text-[11px] font-mono text-k-amber">{f.codigo}</td>
                    <td className="py-1.5 px-3 text-[11px] font-bold" style={{color: f.fase ? '#3B82F6' : '#888'}}>{f.fase ?? <span style={{color:'#888',fontStyle:'italic'}}>padre WBS</span>}</td>
                    <td className="py-1.5 px-3 text-[11px] text-k-text3 font-mono">{f.sub_fase ?? '—'}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2 max-w-[200px] truncate">{f.descripcion}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2">{f.unidad}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-text2 text-right">{f.metrado_presup}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-text2 text-right">{f.hh_presup}</td>
                    <td className="py-1.5 px-3 text-[11px]">
                      {f._error
                        ? <span className="text-k-red font-bold">{f._error}</span>
                        : <span className="text-k-green font-bold">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(avances.length > 0 || hh.length > 0) && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {avances.length > 0 && (
              <ResumenHoja titulo="Hoja AVANCES (histórico)" ok={aOk.length} errores={aErr} />
            )}
            {hh.length > 0 && (
              <ResumenHoja titulo="Hoja HH (histórico)" ok={hOk.length} errores={hErr} />
            )}
          </div>
        )}
      </div>
    )
  }

  if (paso === 'importing') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={28} className="animate-spin text-k-amber" />
        <p className="text-sm text-k-text2">Importando en una sola transacción…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 ${
        resultado?.ok
          ? 'bg-green-500/10 border-green-500/20'
          : 'bg-red-500/10 border-red-500/20'
      }`}>
        <p className={`text-sm font-bold flex items-center gap-2 ${resultado?.ok ? 'text-k-green' : 'text-k-red'}`}>
          {resultado?.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {resultado?.msg}
        </p>
        {resultado?.detalle && (
          <ul className="mt-3 space-y-1">
            {resultado.detalle.map((d, i) => (
              <li key={i} className="text-xs text-k-red font-mono">• {d}</li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={reset}
        className="bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
        Importar otro archivo
      </button>
    </div>
  )
}

function ResumenHoja({ titulo, ok, errores }: { titulo: string; ok: number; errores: { _fila: number; _error: string | null }[] }) {
  return (
    <div className="bg-k-surface border border-k-border rounded-xl p-4">
      <p className="text-[11px] font-bold text-k-text3 uppercase tracking-widest mb-2">{titulo}</p>
      <p className="text-sm text-k-green font-bold">{ok} filas válidas</p>
      {errores.length > 0 && (
        <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
          {errores.map(e => (
            <li key={e._fila} className="text-[11px] text-k-red font-mono">Fila {e._fila}: {e._error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}