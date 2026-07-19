// Rentabilidad.tsx — Fase 2: Resultado Operativo (RO) "a la fecha"
// Venta − Costo = Margen por fase. Costo = MO (tareo×tarifa) + MAT/EQP/EQT/SUB (tabla costos).
// Venta = valorizado×PU + ajustes. Indirectos: DIR/GG. Incluye el editor de Tarifas de MO.
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload, Download, X, Plus, TrendingUp, DollarSign, Wallet, Percent } from 'lucide-react'
import * as XLSX from 'xlsx'

import { api } from '@/lib/api'
const PROYECTO_ID = 1

interface Fila {
  fase: string; descripcion?: string | null
  mat: number; mo: number; eqp: number; eqt: number; sub: number
  costo: number; venta: number; margen: number; pct_margen: number
}
interface RO {
  fases: Fila[]
  indirectos: { DIR: number; GG: number; total: number }
  totales: { costo_directo: number; costo_indirecto: number; costo_total: number; venta: number; margen: number; pct_margen: number }
}
interface CostoImp { fase: string | null; tipo_recurso: string; directo: boolean; periodo: string; monto: number; fuente: string | null; nota: string | null }
interface Cargo { cargo: string; costo_hh: number | null; hh: number }

const sol = (n: number) => 'S/ ' + (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })
const fmt0 = (n: number) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '—'
const pct = (n: number) => ((n || 0) * 100).toFixed(1) + '%'
const TIPOS = ['MAT', 'EQP', 'EQT', 'SUB', 'DIR', 'GG']

// ── Editor de Tarifas de MO (S/./HH por cargo) — alimentan el costo MO del RO ──
function TarifasCard() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const { data, isLoading } = useQuery<{ cargos: Cargo[]; default: number | null }>({
    queryKey: ['ev-tarifas'],
    queryFn: () => api<{ cargos: Cargo[]; default: number | null }>('/ev/tarifas'),
  })
  const guardar = useMutation({
    mutationFn: (p: { cargo: string; costo_hh: number }) =>
      api('/ev/tarifas', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ev-tarifas'] }); qc.invalidateQueries({ queryKey: ['ro'] }) },
  })
  if (isLoading || !data) return <div className="bg-k-surface border border-k-border rounded-xl p-5"><Loader2 size={14} className="animate-spin text-k-text3" /></div>
  const save = (cargo: string, actual: number | null) => {
    const raw = draft[cargo]
    if (raw === undefined || raw === '') return
    const v = Number(raw)
    if (!isFinite(v) || v < 0) return
    if (actual != null && v === actual) return
    guardar.mutate({ cargo, costo_hh: v })
  }
  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center gap-2">
        <DollarSign size={14} className="text-k-amber" />
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Tarifas de Mano de Obra (S/. por HH) — alimentan el costo MO del RO</h3>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-k-text3 mb-3"><strong>(Default)</strong> es la tarifa de respaldo para cargos sin tarifa propia. Edita y sal del campo para guardar.</p>
        <table className="w-full" style={{ fontSize: 12 }}>
          <thead>
            <tr className="border-b border-k-border">
              <th className="py-1.5 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Cargo</th>
              <th className="py-1.5 px-2 text-right text-[10px] font-bold text-k-text3 uppercase">HH acum</th>
              <th className="py-1.5 px-2 text-right text-[10px] font-bold text-k-amber uppercase">S/. / HH</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-k-border bg-k-raised/40">
              <td className="py-1.5 px-2 text-k-text font-bold">(Default) — respaldo</td>
              <td className="py-1.5 px-2 text-right text-k-text3">—</td>
              <td className="py-1.5 px-2 text-right">
                <input type="number" min={0} step="any" placeholder="0"
                  value={draft['(Default)'] ?? (data.default == null ? '' : String(data.default))}
                  onChange={e => setDraft(d => ({ ...d, ['(Default)']: e.target.value }))}
                  onBlur={() => save('(Default)', data.default)}
                  className="w-24 bg-k-raised border border-k-border rounded-lg px-2 py-1 text-right text-[12px] text-k-text outline-none focus:border-k-amber" />
              </td>
            </tr>
            {data.cargos.map(c => (
              <tr key={c.cargo} className="border-b border-k-border last:border-0">
                <td className="py-1.5 px-2 text-k-text2">{c.cargo}</td>
                <td className="py-1.5 px-2 text-right font-mono text-[11px] text-k-text3">{fmt0(c.hh)}</td>
                <td className="py-1.5 px-2 text-right">
                  <input type="number" min={0} step="any" placeholder="0"
                    value={draft[c.cargo] ?? (c.costo_hh == null ? '' : String(c.costo_hh))}
                    onChange={e => setDraft(d => ({ ...d, [c.cargo]: e.target.value }))}
                    onBlur={() => save(c.cargo, c.costo_hh)}
                    className="w-24 bg-k-raised border border-k-border rounded-lg px-2 py-1 text-right text-[12px] text-k-text outline-none focus:border-k-amber" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Rentabilidad() {
  const qc = useQueryClient()
  const ro = useQuery<RO>({
    queryKey: ['ro'],
    queryFn: () => api<RO>(`/ev/ro?proyecto_id=${PROYECTO_ID}`),
  })

  const [showImp, setShowImp] = useState(false)
  const [filas, setFilas] = useState<CostoImp[]>([])
  const [impError, setImpError] = useState('')
  const [showAj, setShowAj] = useState(false)
  const [aj, setAj] = useState({ tipo: 'ADICIONAL', fase: '', monto: '' })

  const t = ro.data?.totales

  function descargarPlantilla() {
    const datos = [
      { FASE: '10', TIPO_RECURSO: 'MAT', DIRECTO: 'SI', PERIODO: '2026-06-01', MONTO: 101073, FUENTE: 'Factura', NOTA: '' },
      { FASE: '11', TIPO_RECURSO: 'SUB', DIRECTO: 'SI', PERIODO: '2026-06-01', MONTO: 13247, FUENTE: 'Subcontrato', NOTA: '' },
      { FASE: '', TIPO_RECURSO: 'GG', DIRECTO: 'NO', PERIODO: '2026-06-01', MONTO: 60781, FUENTE: 'GG mes', NOTA: 'indirecto' },
    ]
    const ws = XLSX.utils.json_to_sheet(datos, { header: ['FASE', 'TIPO_RECURSO', 'DIRECTO', 'PERIODO', 'MONTO', 'FUENTE', 'NOTA'] })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Costos')
    XLSX.writeFile(wb, 'plantilla_costos_ro.xlsx')
  }

  function parseArchivo(file: File) {
    setImpError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
        const num = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0
        const bool = (v: unknown) => !['NO', 'FALSE', '0', ''].includes(String(v ?? '').trim().toUpperCase())
        const out: CostoImp[] = []
        for (const r of raw) {
          const tipo = String(r.TIPO_RECURSO ?? r.tipo_recurso ?? '').trim().toUpperCase()
          const periodo = String(r.PERIODO ?? r.periodo ?? '').trim().slice(0, 10)
          if (!TIPOS.includes(tipo) || !periodo) continue
          out.push({
            fase: String(r.FASE ?? r.fase ?? '').trim() || null,
            tipo_recurso: tipo, directo: bool(r.DIRECTO ?? r.directo),
            periodo, monto: num(r.MONTO ?? r.monto),
            fuente: String(r.FUENTE ?? r.fuente ?? '').trim() || null,
            nota: String(r.NOTA ?? r.nota ?? '').trim() || null,
          })
        }
        if (out.length === 0) { setImpError('No se encontraron filas válidas (revisa TIPO_RECURSO y PERIODO).'); return }
        setFilas(out)
      } catch { setImpError('No se pudo leer el archivo. ¿Es un .xlsx válido?') }
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = useMutation({
    mutationFn: () => api('/ev/ro/costos', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, costos: filas }),
    }),
    onSuccess: () => { setShowImp(false); setFilas([]); qc.invalidateQueries({ queryKey: ['ro'] }) },
    onError: (e: Error) => setImpError(e.message),
  })

  const guardarAjuste = useMutation({
    mutationFn: () => api('/ev/ro/venta-ajustes', {
      method: 'POST',
      body: JSON.stringify({ proyecto_id: PROYECTO_ID, ajustes: [{ tipo: aj.tipo, fase: aj.fase || null, monto: Number(aj.monto) || 0 }] }),
    }),
    onSuccess: () => { setShowAj(false); setAj({ tipo: 'ADICIONAL', fase: '', monto: '' }); qc.invalidateQueries({ queryKey: ['ro'] }) },
  })

  const kpis = useMemo(() => ([
    { label: 'Venta', val: sol(t?.venta ?? 0), icon: DollarSign, color: 'text-k-green' },
    { label: 'Costo total', val: sol(t?.costo_total ?? 0), icon: Wallet, color: 'text-k-text' },
    { label: 'Margen', val: sol(t?.margen ?? 0), icon: TrendingUp, color: (t?.margen ?? 0) >= 0 ? 'text-k-green' : 'text-k-red' },
    { label: '% Margen', val: pct(t?.pct_margen ?? 0), icon: Percent, color: (t?.margen ?? 0) >= 0 ? 'text-k-green' : 'text-k-red' },
  ]), [t])

  const margenColor = (n: number) => (n >= 0 ? 'text-k-green' : 'text-k-red')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-k-text flex items-center gap-2"><TrendingUp size={20} className="text-k-amber" /> Resultado Operativo</h1>
          <p className="text-k-text2 text-sm">Venta − Costo = Margen, por fase · MO del tareo + costos cargados · "a la fecha".</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAj(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <Plus size={14} /> Ajuste de venta
          </button>
          <button onClick={() => { setFilas([]); setImpError(''); setShowImp(true) }}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-k-amber hover:bg-k-amber2 text-black font-bold">
            <Upload size={15} /> Importar costos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-[11px] text-k-text3 uppercase tracking-wide"><k.icon size={13} /> {k.label}</div>
            <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        {ro.isLoading ? <div className="p-6"><Loader2 className="animate-spin text-k-text3" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-k-text3 border-b border-k-border">
                  <th className="text-left px-4 py-2">Fase</th>
                  <th className="text-right px-2 py-2">Material</th><th className="text-right px-2 py-2">M. Obra</th>
                  <th className="text-right px-2 py-2">Eq.Prop</th><th className="text-right px-2 py-2">Eq.Terc</th><th className="text-right px-2 py-2">Subc.</th>
                  <th className="text-right px-3 py-2">Costo</th><th className="text-right px-3 py-2">Venta</th>
                  <th className="text-right px-3 py-2">Margen</th><th className="text-right px-4 py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {(ro.data?.fases ?? []).map(f => (
                  <tr key={f.fase} className="border-b border-k-border/50 hover:bg-k-raised/40">
                    <td className="px-4 py-1.5 text-k-text2"><span className="font-mono">{f.fase}</span>{f.descripcion ? ` · ${f.descripcion}` : ''}</td>
                    <td className="px-2 py-1.5 text-right text-k-text3">{sol(f.mat)}</td>
                    <td className="px-2 py-1.5 text-right text-k-text3">{sol(f.mo)}</td>
                    <td className="px-2 py-1.5 text-right text-k-text3">{sol(f.eqp)}</td>
                    <td className="px-2 py-1.5 text-right text-k-text3">{sol(f.eqt)}</td>
                    <td className="px-2 py-1.5 text-right text-k-text3">{sol(f.sub)}</td>
                    <td className="px-3 py-1.5 text-right text-k-text">{sol(f.costo)}</td>
                    <td className="px-3 py-1.5 text-right text-k-text">{sol(f.venta)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${margenColor(f.margen)}`}>{sol(f.margen)}</td>
                    <td className={`px-4 py-1.5 text-right ${margenColor(f.margen)}`}>{pct(f.pct_margen)}</td>
                  </tr>
                ))}
                {(ro.data?.fases ?? []).length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-k-text3">Sin datos aún. Configura tarifas de MO, carga costos e ingresa valorizaciones.</td></tr>
                )}
                {ro.data && ro.data.indirectos.total > 0 && (
                  <tr className="border-b border-k-border/50 bg-k-raised/30">
                    <td className="px-4 py-1.5 text-k-text2 italic">Indirectos (Dirección {sol(ro.data.indirectos.DIR)} · GG {sol(ro.data.indirectos.GG)})</td>
                    <td colSpan={5}></td>
                    <td className="px-3 py-1.5 text-right text-k-text">{sol(ro.data.indirectos.total)}</td>
                    <td></td><td className={`px-3 py-1.5 text-right ${margenColor(-ro.data.indirectos.total)}`}>{sol(-ro.data.indirectos.total)}</td><td></td>
                  </tr>
                )}
                {t && (
                  <tr className="border-t-2 border-k-amber/40 bg-amber-500/5 font-bold">
                    <td className="px-4 py-2 text-k-text">TOTAL OBRA</td>
                    <td colSpan={5}></td>
                    <td className="px-3 py-2 text-right text-k-text">{sol(t.costo_total)}</td>
                    <td className="px-3 py-2 text-right text-k-text">{sol(t.venta)}</td>
                    <td className={`px-3 py-2 text-right ${margenColor(t.margen)}`}>{sol(t.margen)}</td>
                    <td className={`px-4 py-2 text-right ${margenColor(t.margen)}`}>{pct(t.pct_margen)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TarifasCard />

      {/* Modal importar costos */}
      {showImp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowImp(false)}>
          <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[680px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-k-text">Importar costos (Material, Equipos, Subcontratos, GG…)</h2>
              <button onClick={() => setShowImp(false)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <p className="text-xs text-k-text3 mb-3">La Mano de Obra NO se importa aquí: sale del tareo (HH×tarifa). Tipos válidos: MAT, EQP, EQT, SUB, DIR, GG.</p>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={descargarPlantilla} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
                <Download size={14} /> Descargar plantilla
              </button>
              <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber hover:bg-k-amber2 text-black font-bold cursor-pointer">
                <Upload size={14} /> Elegir archivo
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseArchivo(f) }} />
              </label>
            </div>
            {impError && <p className="text-k-red text-sm mb-3">{impError}</p>}
            {filas.length > 0 && (
              <>
                <p className="text-sm text-k-text2 mb-2">{filas.length} costos detectados:</p>
                <div className="border border-k-border rounded-lg overflow-auto max-h-[40vh] mb-4">
                  <table className="w-full text-xs">
                    <thead><tr className="text-k-text3 border-b border-k-border">
                      <th className="text-left px-2 py-1">Fase</th><th className="text-left px-2 py-1">Recurso</th><th className="text-left px-2 py-1">Dir</th>
                      <th className="text-left px-2 py-1">Periodo</th><th className="text-right px-2 py-1">Monto</th>
                    </tr></thead>
                    <tbody>
                      {filas.slice(0, 100).map((f, i) => (
                        <tr key={i} className="border-b border-k-border/40">
                          <td className="px-2 py-1 font-mono text-k-text2">{f.fase ?? '—'}</td>
                          <td className="px-2 py-1 text-k-text2">{f.tipo_recurso}</td>
                          <td className="px-2 py-1 text-k-text3">{f.directo ? 'Sí' : 'No'}</td>
                          <td className="px-2 py-1 text-k-text3">{f.periodo}</td>
                          <td className="px-2 py-1 text-right">{sol(f.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => importar.mutate()} disabled={importar.isPending}
                  className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {importar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar {filas.length} costos
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal ajuste de venta */}
      {showAj && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAj(false)}>
          <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[400px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-k-text">Ajuste de venta</h2>
              <button onClick={() => setShowAj(false)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <label className="block text-xs text-k-text3 mb-1">Tipo</label>
            <select value={aj.tipo} onChange={e => setAj({ ...aj, tipo: e.target.value })}
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-3 outline-none focus:border-k-amber">
              {['CONTRACTUAL', 'ADICIONAL', 'REAJUSTE', 'TERCEROS'].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <label className="block text-xs text-k-text3 mb-1">Fase (opcional)</label>
            <input value={aj.fase} onChange={e => setAj({ ...aj, fase: e.target.value })} placeholder="Ej: 10 (vacío = a nivel obra)"
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-3 outline-none focus:border-k-amber" />
            <label className="block text-xs text-k-text3 mb-1">Monto (S/)</label>
            <input type="number" value={aj.monto} onChange={e => setAj({ ...aj, monto: e.target.value })}
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-4 outline-none focus:border-k-amber" />
            <button onClick={() => guardarAjuste.mutate()} disabled={guardarAjuste.isPending || !aj.monto}
              className="w-full bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {guardarAjuste.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar ajuste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
