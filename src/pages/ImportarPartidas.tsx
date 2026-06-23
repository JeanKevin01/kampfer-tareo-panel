// ============================================================
// src/pages/ImportarPartidas.tsx
// Importador masivo de partidas EV (UNA sola hoja PARTIDAS).
// Columnas: OTM, CODIGO, FASE, SUB_FASE, AREA, DESCRIPCION, UNIDAD,
//   METRADO_PRESUP, METRADO_PROYEC, HH_PRESUP, TIPO_COSTO,
//   HH_GASTADAS_INICIAL, HH_GANADAS_INICIAL (opcionales para migrar histórico),
//   y los hitos EN LÍNEA: HITO1_DESC, HITO1_PESO ... HITO5_DESC, HITO5_PESO.
//   Los pesos son decimales que SUMAN 1.00. El hito PRINCIPAL = el de mayor peso.
//   Si una partida hoja no trae hitos, se le asigna uno solo (100%).
// ============================================================
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, X, AlertTriangle,
} from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface OTMItem { otm_id: string; descripcion?: string; partidas: number }

interface HitoFila {
  numero: number; descripcion: string; peso: number; es_principal: boolean
}

interface FilaPartida {
  codigo: string; otm_id: string | null; fase: string | null; sub_fase: string | null
  descripcion: string; unidad: string | null
  metrado_presup: number; metrado_proyec: number | null; hh_presup: number
  hh_gastadas_inicial: number; hh_ganadas_inicial: number
  tipo_costo: 'DIRECTO' | 'INDIRECTO'
  sistema: string | null
  hitos: HitoFila[]
  nivel: number; parent_codigo: string | null
  _fila: number; _error: string | null; _warn: string | null
}

// Normaliza la columna TIPO_COSTO del Excel a DIRECTO | INDIRECTO (default DIRECTO).
const normTipoCosto = (s: string | undefined): 'DIRECTO' | 'INDIRECTO' => {
  const t = (s || '').toUpperCase().trim()
  return (t === 'INDIRECTO' || t === 'IND' || t === 'I') ? 'INDIRECTO' : 'DIRECTO'
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

const num = (s: string | undefined): number | null => {
  if (s === '' || s === undefined || s === null) return null
  const v = Number(String(s).replace(/,/g, '.'))
  return Number.isFinite(v) ? v : null
}

// Lee los hasta 5 hitos en línea de una fila. Pesos decimales (suman 1.00).
// El hito principal = el de mayor peso (no se marca a mano).
function leerHitosEnLinea(n: Record<string, string>): HitoFila[] {
  const hitos: HitoFila[] = []
  for (let k = 1; k <= 5; k++) {
    const peso = num(n[`HITO${k}_PESO`])
    const desc = n[`HITO${k}_DESC`] || ''
    if (peso && peso > 0) {
      hitos.push({ numero: 0, descripcion: desc || `Hito ${k}`, peso, es_principal: false })
    }
  }
  // Renumerar 1..n y marcar principal = mayor peso
  hitos.forEach((h, i) => { h.numero = i + 1 })
  if (hitos.length > 0) {
    let maxIdx = 0
    hitos.forEach((h, i) => { if (h.peso > hitos[maxIdx].peso) maxIdx = i })
    hitos[maxIdx].es_principal = true
  }
  return hitos
}

function descargarPlantilla() {
  // Una sola hoja. Nodos PADRE: FASE vacía (solo agrupan). Nodos HOJA: FASE llena.
  // Los hitos van en línea: por cada hito su descripción y su peso (decimales que suman 1.00).
  const partidas = [
    { OTM:'OTM-0005', CODIGO:'02',             FASE:'',    SUB_FASE:'',        AREA:'',          DESCRIPCION:'TRABAJOS EN INSTALACIONES DE SMCV', UNIDAD:'',   METRADO_PRESUP:'', METRADO_PROYEC:'', HH_PRESUP:'',    TIPO_COSTO:'',          HH_GASTADAS_INICIAL:'', HH_GANADAS_INICIAL:'', HITO1_DESC:'',            HITO1_PESO:'',  HITO2_DESC:'',         HITO2_PESO:'',  HITO3_DESC:'', HITO3_PESO:'', HITO4_DESC:'', HITO4_PESO:'', HITO5_DESC:'', HITO5_PESO:'' },
    { OTM:'OTM-0005', CODIGO:'02.01',          FASE:'',    SUB_FASE:'',        AREA:'',          DESCRIPCION:'DIVERTER DV-041',                   UNIDAD:'',   METRADO_PRESUP:'', METRADO_PROYEC:'', HH_PRESUP:'',    TIPO_COSTO:'',          HH_GASTADAS_INICIAL:'', HH_GANADAS_INICIAL:'', HITO1_DESC:'',            HITO1_PESO:'',  HITO2_DESC:'',         HITO2_PESO:'',  HITO3_DESC:'', HITO3_PESO:'', HITO4_DESC:'', HITO4_PESO:'', HITO5_DESC:'', HITO5_PESO:'' },
    { OTM:'OTM-0005', CODIGO:'02.01.01.01.01', FASE:'AND', SUB_FASE:'AND.INS', AREA:'Sistema 1', DESCRIPCION:'TRANSPORTE INTERNO CAMIÓN GRÚA',    UNIDAD:'hm', METRADO_PRESUP:16, METRADO_PROYEC:'', HH_PRESUP:17.57, TIPO_COSTO:'DIRECTO',   HH_GASTADAS_INICIAL:'', HH_GANADAS_INICIAL:'', HITO1_DESC:'Preparación', HITO1_PESO:0.10, HITO2_DESC:'Ejecución', HITO2_PESO:0.90, HITO3_DESC:'', HITO3_PESO:'', HITO4_DESC:'', HITO4_PESO:'', HITO5_DESC:'', HITO5_PESO:'' },
    { OTM:'OTM-0005', CODIGO:'02.01.01.01.02', FASE:'EST', SUB_FASE:'EST.LIG', AREA:'Sistema 1', DESCRIPCION:'PERSONAL DE APOYO CARGUÍO',         UNIDAD:'hh', METRADO_PRESUP:32, METRADO_PROYEC:'', HH_PRESUP:160,   TIPO_COSTO:'INDIRECTO', HH_GASTADAS_INICIAL:'', HH_GANADAS_INICIAL:'', HITO1_DESC:'Ejecución',   HITO1_PESO:1.00, HITO2_DESC:'',         HITO2_PESO:'',  HITO3_DESC:'', HITO3_PESO:'', HITO4_DESC:'', HITO4_PESO:'', HITO5_DESC:'', HITO5_PESO:'' },
  ]
  const wb = XLSX.utils.book_new()
  const header = ['OTM','CODIGO','FASE','SUB_FASE','AREA','DESCRIPCION','UNIDAD','METRADO_PRESUP','METRADO_PROYEC',
                  'HH_PRESUP','TIPO_COSTO','HH_GASTADAS_INICIAL','HH_GANADAS_INICIAL',
                  'HITO1_DESC','HITO1_PESO','HITO2_DESC','HITO2_PESO','HITO3_DESC','HITO3_PESO',
                  'HITO4_DESC','HITO4_PESO','HITO5_DESC','HITO5_PESO']
  const ws1 = XLSX.utils.json_to_sheet(partidas, { header })
  ws1['!cols'] = [{wch:12},{wch:14},{wch:8},{wch:10},{wch:14},{wch:34},{wch:8},{wch:14},{wch:14},{wch:12},{wch:12},{wch:18},{wch:18},
                  {wch:16},{wch:10},{wch:16},{wch:10},{wch:16},{wch:10},{wch:16},{wch:10},{wch:16},{wch:10}]
  XLSX.utils.book_append_sheet(wb, ws1, 'PARTIDAS')
  XLSX.writeFile(wb, 'plantilla_partidas_valor_ganado.xlsx')
}

export default function ImportarPartidas() {
  const qc = useQueryClient()
  const [paso, setPaso] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload')
  const [partidas, setPartidas] = useState<FilaPartida[]>([])
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; detalle?: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)

  const { data: otms = [] } = useQuery<OTMItem[]>({
    queryKey: ['ev-otms'],
    queryFn: async () => (await fetch(`${API}/ev/otms`)).json(),
    staleTime: 30_000,
  })
  const otmIds = useMemo(() => new Set(otms.map(o => o.otm_id)), [otms])

  const pOk  = useMemo(() => partidas.filter(f => !f._error), [partidas])
  const pErr = useMemo(() => partidas.filter(f =>  f._error), [partidas])

  function procesar(wb: XLSX.WorkBook) {
    const hojaP = wb.Sheets['PARTIDAS'] ?? wb.Sheets[wb.SheetNames[0]]
    if (!hojaP) { setResultado({ ok: false, msg: 'No se encontró la hoja PARTIDAS' }); setPaso('result'); return }

    const rowsP = XLSX.utils.sheet_to_json<Record<string, unknown>>(hojaP)
    const codigos = new Set<string>()
    const fp: FilaPartida[] = rowsP.map((row, i) => {
      const n = norm(row)
      const codigo = n['CODIGO'] || ''
      const otm_id = n['OTM'] || n['OTM_ID'] || null
      const fase   = n['FASE'] || null
      const unidad = n['UNIDAD'] || null

      let _error: string | null = null
      let _warn: string | null  = null

      if (!codigo) _error = 'CODIGO vacío'
      else if (codigos.has(codigo)) _error = 'CODIGO duplicado en el archivo'
      else if (!n['DESCRIPCION']) _error = 'DESCRIPCION vacía'
      else if (!otm_id) _error = 'OTM vacío'
      else if (fase && !unidad) _error = 'UNIDAD vacía (requerida para nodos con fase)'
      codigos.add(codigo)

      if (!_error && otm_id && !otmIds.has(otm_id)) {
        _warn = `OTM ${otm_id} no existe aún en el sistema — créala primero en la página OTMs`
      }

      const sep = codigo.includes('.') ? '.' : ','
      const nivel = codigo ? codigo.split(sep).length : 1
      const parent_codigo = nivel > 1 ? codigo.split(sep).slice(0, -1).join(sep) : null

      // Hitos en línea (HITO1..HITO5). Si no hay y es hoja → uno por defecto (100%).
      let hitos = leerHitosEnLinea(n)
      if (hitos.length === 0 && fase) {
        hitos = [{ numero: 1, descripcion: 'Ejecución', peso: 1.0, es_principal: true }]
      }
      if (hitos.length > 0) {
        const sumaPeso = Math.round(hitos.reduce((s, h) => s + h.peso, 0) * 1000) / 1000
        if (Math.abs(sumaPeso - 1) > 0.001) {
          _error = _error || `Hitos suman ${sumaPeso} (deben sumar 1.00)`
        }
      }

      const metrado_presup = num(n['METRADO_PRESUP']) ?? 0
      const hh_presup      = num(n['HH_PRESUP']) ?? 0
      const factor = metrado_presup > 0 ? hh_presup / metrado_presup : 0
      const hh_gastadas_inicial = num(n['HH_GASTADAS_INICIAL']) ?? 0
      const hh_ganadas_inicial  = num(n['HH_GANADAS_INICIAL']) ?? 0

      if (hh_ganadas_inicial > 0 && factor === 0) {
        _warn = _warn || 'HH_GANADAS_INICIAL ingresada pero no se puede convertir a metrado (METRADO_PRESUP = 0)'
      }

      return {
        codigo, otm_id, fase, sub_fase: n['SUB_FASE'] || n['SUBFASE'] || null,
        descripcion: n['DESCRIPCION'] || '', unidad,
        metrado_presup, metrado_proyec: num(n['METRADO_PROYEC']), hh_presup,
        hh_gastadas_inicial, hh_ganadas_inicial,
        tipo_costo: normTipoCosto(n['TIPO_COSTO'] || n['TIPO']),
        sistema: n['AREA'] || n['SISTEMA'] || null,
        hitos, nivel, parent_codigo,
        _fila: i + 2, _error, _warn,
      }
    })

    setPartidas(fp)
    setPaso('preview')
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
      // Semana base para los valores iniciales — usar la última semana activa
      const rSem = await fetch(`${API}/ev/semanas-auto`)
      const semanasAuto = rSem.ok ? await rSem.json() : []
      const ultActiva = [...semanasAuto].reverse().find((s: any) => s.activa)
      const semanaBase = ultActiva ? ultActiva.semana : (semanasAuto[semanasAuto.length - 1]?.semana ?? 1)

      const avances: { codigo: string; semana: number; hito: number; cantidad_acum: number }[] = []
      const hh: { codigo: string; semana: number; hh: number }[] = []

      pOk.forEach(p => {
        if (p.hh_gastadas_inicial > 0) {
          hh.push({ codigo: p.codigo, semana: semanaBase, hh: p.hh_gastadas_inicial })
        }
        if (p.hh_ganadas_inicial > 0 && p.metrado_presup > 0 && p.hh_presup > 0) {
          const factor = p.hh_presup / p.metrado_presup
          const principal = p.hitos.find(h => h.es_principal) ?? p.hitos[0]
          if (factor > 0 && principal) {
            avances.push({
              codigo: p.codigo, semana: semanaBase, hito: principal.numero,
              cantidad_acum: Math.round((p.hh_ganadas_inicial / factor) * 100) / 100,
            })
          }
        }
      })

      const payload = {
        partidas: pOk.map(p => ({
          codigo: p.codigo, otm_id: p.otm_id, fase: p.fase, sub_fase: p.sub_fase,
          descripcion: p.descripcion, unidad: p.unidad, sistema: p.sistema,
          metrado_presup: p.metrado_presup, metrado_proyec: p.metrado_proyec, hh_presup: p.hh_presup,
          tipo_costo: p.tipo_costo,
          hitos: p.hitos.length > 0 ? p.hitos : undefined,
          nivel: p.nivel, parent_codigo: p.parent_codigo,
        })),
        avances, hh,
      }

      const res = await fetch(`${API}/ev/importar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) {
        const det = j?.detail?.errores ?? (typeof j?.detail === 'string' ? [j.detail] : ['Error desconocido'])
        setResultado({ ok: false, msg: 'La importación fue rechazada (no se guardó nada):', detalle: det })
      } else {
        setResultado({
          ok: true,
          msg: `${j.partidas_creadas} partidas creadas, ${j.partidas_actualizadas} actualizadas`
             + (hh.length > 0 ? `, ${j.hh_importadas} valores de HH gastadas iniciales` : '')
             + (avances.length > 0 ? `, ${j.avances_importados} avances iniciales` : '') + '.',
        })
        qc.invalidateQueries({ queryKey: ['ev-partidas'] })
        qc.invalidateQueries({ queryKey: ['ev-otms'] })
        qc.invalidateQueries({ queryKey: ['ev-reporte'] })
        qc.invalidateQueries({ queryKey: ['ev-captura'] })
        qc.invalidateQueries({ queryKey: ['ev-curva'] })
        qc.invalidateQueries({ queryKey: ['ev-semanas-auto'] })
        qc.invalidateQueries({ queryKey: ['semana-grid'] })
      }
    } catch (e) {
      setResultado({ ok: false, msg: `Error de red: ${(e as Error).message}` })
    }
    setPaso('result')
  }

  const reset = () => { setPartidas([]); setResultado(null); setPaso('upload') }

  // ---------------- UI ----------------
  if (paso === 'upload') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-k-text3 max-w-2xl">
            Carga masiva de partidas desde Excel (una sola hoja <span className="text-k-text2 font-bold">PARTIDAS</span>).
            La columna <span className="text-k-text2 font-bold">AREA</span> agrupa partidas por zona/sistema (ej. "Sistema 1: Lauder 3B")
            para el reporte ejecutivo por área.{' '}
            La columna <span className="text-k-text2 font-bold">TIPO_COSTO</span> marca cada partida como{' '}
            <span className="text-k-text2 font-bold">DIRECTO</span> (por defecto) o <span className="text-k-text2 font-bold">INDIRECTO</span>.
            Los <span className="text-k-text2 font-bold">hitos van en línea</span> (HITO1_DESC/HITO1_PESO … HITO5): los pesos son decimales que
            suman <span className="text-k-text2 font-bold">1.00</span> y el hito principal es el de mayor peso. Si una partida no trae hitos,
            se le asigna uno al 100%. Las columnas <span className="text-k-text2 font-bold">HH_GASTADAS_INICIAL</span> y{' '}
            <span className="text-k-text2 font-bold">HH_GANADAS_INICIAL</span> son opcionales (migrar histórico).
          </p>
          <button onClick={descargarPlantilla}
            className="bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors flex items-center gap-2 flex-shrink-0">
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

        {otms.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-k-amber">
            <AlertTriangle size={14} className="flex-shrink-0" />
            No hay ninguna OTM creada todavía. Crea las OTMs primero en la página <strong>OTMs</strong> para poder vincular las partidas.
          </div>
        )}
      </div>
    )
  }

  if (paso === 'preview') {
    const conWarn = partidas.filter(p => p._warn && !p._error)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-k-green font-bold flex items-center gap-1">
              <CheckCircle size={14} />
              {pOk.filter(p=>p.fase).length} nodos hoja + {pOk.filter(p=>!p.fase).length} nodos padre
            </span>
            {pErr.length > 0 && (
              <span className="text-k-red font-bold flex items-center gap-1">
                <XCircle size={14} /> {pErr.length} con error (no se importarán)
              </span>
            )}
            {conWarn.length > 0 && (
              <span className="text-k-amber font-bold flex items-center gap-1">
                <AlertTriangle size={14} /> {conWarn.length} con advertencia
              </span>
            )}
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
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-k-border">
                  {['Fila','OTM','Código','Fase','Tipo','Área','Sub-Fase','Descripción','Und','Met. Presup','HH Ppto','HH Gast. ini','HH Gan. ini','Hitos','Estado'].map(h => (
                    <th key={h} className="py-2 px-3 text-[10px] font-bold text-k-text3 uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partidas.map(f => (
                  <tr key={f._fila} className={`border-b border-k-border last:border-0 ${f._error ? 'bg-red-500/5' : f._warn ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-1.5 px-3 text-[11px] text-k-text3 font-mono">{f._fila}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2 font-mono">{f.otm_id ?? '—'}</td>
                    <td className="py-1.5 px-3 text-[11px] font-mono text-k-amber">{f.codigo}</td>
                    <td className="py-1.5 px-3 text-[11px] font-bold" style={{color: f.fase ? '#3B82F6' : '#888'}}>{f.fase ?? <span style={{color:'#888',fontStyle:'italic'}}>padre WBS</span>}</td>
                    <td className="py-1.5 px-3 text-[10px] font-bold">
                      {f.fase
                        ? <span style={{color: f.tipo_costo === 'INDIRECTO' ? '#F59E0B' : '#10B981'}}>{f.tipo_costo === 'INDIRECTO' ? 'IND' : 'DIR'}</span>
                        : <span className="text-k-text3">—</span>}
                    </td>
                    <td className="py-1.5 px-3 text-[11px] text-k-text2">{f.sistema ?? '—'}</td>
                    <td className="py-1.5 px-3 text-[11px] text-k-text3 font-mono">{f.sub_fase ?? '—'}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2 max-w-[180px] truncate">{f.descripcion}</td>
                    <td className="py-1.5 px-3 text-sm text-k-text2">{f.unidad}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-text2 text-right">{f.metrado_presup}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-text2 text-right">{f.hh_presup}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-amber text-right">{f.hh_gastadas_inicial || '—'}</td>
                    <td className="py-1.5 px-3 text-sm font-mono text-k-green text-right">{f.hh_ganadas_inicial || '—'}</td>
                    <td className="py-1.5 px-3 text-[11px] text-k-text3">{f.hitos.length || '—'}</td>
                    <td className="py-1.5 px-3 text-[11px]">
                      {f._error
                        ? <span className="text-k-red font-bold">{f._error}</span>
                        : f._warn
                        ? <span className="text-k-amber font-bold">{f._warn}</span>
                        : <span className="text-k-green font-bold">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
