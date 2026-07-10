import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Download, RefreshCw, Pencil } from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import { getToken } from '@/lib/auth'
import Rentabilidad from '@/pages/Rentabilidad'

const PROYECTO_ID = 1
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fmt = (n: number) => (n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })
const pct = (n: number) => `${((n || 0) * 100).toFixed(1)}%`

interface Periodo { id: number; anio: number; mes: number; estado: string }
interface FilaFase {
  fase: string | null; descripcion?: string; indirecta: boolean | null
  mat: number; mo: number; eqp: number; eqt: number; sub: number; dir: number; gg: number
  total: number; venta: number; margen: number; pct_margen: number; meta: number; contractual: number
}
interface CeldaProy {
  id: number; fase?: string; tipo_recurso: string; periodo_id: number
  monto: number; origen: 'AUTO' | 'MANUAL'; anio: number; mes: number
}
interface RO {
  corte: { periodo_id: number; anio: number; mes: number; tipo_cambio: number }
  r_fases: FilaFase[]
  t_obra: {
    venta: { concepto: string; mes: number; acum: number; margen_previsto_acum: number }[]
    venta_total: { mes: number; acum: number; proyectada: number }
    costo_directo: { mes: Record<string, number>; acum: Record<string, number> }
    costo_indirecto: { mes: Record<string, number>; acum: Record<string, number> }
    costo_total: { mes: number; acum: number; proyectado: number }
    saldo_obra: number
    prev: { costo: number } | null
  }
  totales: Record<string, number>
  usd: { venta_acum: number; costo_acum: number; margen_acum: number; tc_corte: number }
}

type Tab = 'tobra' | 'fases' | 'proyeccion' | 'otm'

export default function ResultadoOperativo() {
  const [tab, setTab] = useState<Tab>('tobra')
  const [perSel, setPerSel] = useState<{ anio: number; mes: number } | null>(null)

  const periodos = useQuery<Periodo[]>({
    queryKey: ['periodos'],
    queryFn: () => api(`/ev/periodos?proyecto_id=${PROYECTO_ID}`),
  })
  const sel = perSel ?? (periodos.data?.length
    ? { anio: periodos.data[periodos.data.length - 1].anio, mes: periodos.data[periodos.data.length - 1].mes }
    : null)

  const ro = useQuery<RO>({
    queryKey: ['ro-mensual', sel?.anio, sel?.mes],
    queryFn: () => api(`/ev/ro/mensual?proyecto_id=${PROYECTO_ID}&anio=${sel!.anio}&mes=${sel!.mes}`),
    enabled: !!sel && tab !== 'otm',
  })

  async function exportar() {
    const r = await fetch(`${API_BASE}/ev/ro/export?proyecto_id=${PROYECTO_ID}&anio=${sel!.anio}&mes=${sel!.mes}`,
      { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!r.ok) { alert('No se pudo exportar'); return }
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `RO_${sel!.anio}-${String(sel!.mes).padStart(2, '0')}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const t = ro.data?.totales

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-k-text">Resultado Operativo</h1>
          <p className="text-k-text2 text-sm">Venta − Costo = Margen, mes a mes (espejo del RO del gerente).</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text"
            value={sel ? `${sel.anio}-${sel.mes}` : ''}
            onChange={e => { const [a, m] = e.target.value.split('-').map(Number); setPerSel({ anio: a, mes: m }) }}>
            {(periodos.data ?? []).map(p => (
              <option key={p.id} value={`${p.anio}-${p.mes}`}>
                {MESES[p.mes]} {p.anio}{p.estado === 'CERRADO' ? ' 🔒' : ''}
              </option>
            ))}
          </select>
          {sel && tab !== 'otm' && (
            <button onClick={exportar}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
              <Download size={14} /> Excel
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de totales */}
      {t && tab !== 'otm' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[['Venta acum.', `S/ ${fmt(t.venta_acum)}`],
            ['Costo acum.', `S/ ${fmt(t.costo_acum)}`],
            ['Margen total', `S/ ${fmt(t.margen_total)}`],
            ['% margen', pct(t.pct_margen)],
            ['Margen c/conting.', `S/ ${fmt(t.margen_con_contingencia)}`]].map(([l, v]) => (
            <div key={l} className="bg-k-surface border border-k-border rounded-xl px-3 py-2.5">
              <div className="text-[10px] uppercase text-k-text3">{l}</div>
              <div className="text-base font-bold text-k-text">{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-k-border">
        {([['tobra', 'T OBRA'], ['fases', 'R FASES'], ['proyeccion', 'Proyección'], ['otm', 'Por OTM']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === k ? 'border-k-amber text-k-amber' : 'border-transparent text-k-text3 hover:text-k-text2'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'otm' ? <Rentabilidad /> :
        ro.isLoading ? <Loader2 className="animate-spin text-k-text3" /> :
        ro.isError ? <p className="text-k-red text-sm">{(ro.error as Error).message}</p> :
        ro.data && (
          tab === 'tobra' ? <TObra ro={ro.data} /> :
          tab === 'fases' ? <RFases filas={ro.data.r_fases} /> :
          <Proyeccion />
        )}
    </div>
  )
}

function TObra({ ro }: { ro: RO }) {
  const t = ro.t_obra
  const recs = ['MAT', 'MO', 'EQP', 'EQT', 'SUB', 'DIR', 'GG']
  return (
    <div className="space-y-4">
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs font-bold text-k-text3 uppercase border-b border-k-border">Venta por concepto</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase text-k-text3 border-b border-k-border">
            <th className="text-left px-4 py-1.5">Concepto</th><th className="text-right px-4 py-1.5">Mes</th>
            <th className="text-right px-4 py-1.5">Acumulado</th><th className="text-right px-4 py-1.5">Margen prev.</th>
          </tr></thead>
          <tbody>
            {t.venta.filter(c => c.mes || c.acum).map(c => (
              <tr key={c.concepto} className="border-b border-k-border/40">
                <td className="px-4 py-1.5 text-k-text2">{c.concepto.replace('_', ' ')}</td>
                <td className="px-4 py-1.5 text-right text-k-text2">{fmt(c.mes)}</td>
                <td className="px-4 py-1.5 text-right text-k-text">{fmt(c.acum)}</td>
                <td className="px-4 py-1.5 text-right text-k-text3">{fmt(c.margen_previsto_acum)}</td>
              </tr>
            ))}
            <tr className="font-bold border-t border-k-border">
              <td className="px-4 py-2 text-k-text">TOTAL VENTA S/.</td>
              <td className="px-4 py-2 text-right text-k-text">{fmt(t.venta_total.mes)}</td>
              <td className="px-4 py-2 text-right text-k-amber">{fmt(t.venta_total.acum)}</td>
              <td className="px-4 py-2 text-right text-k-text3">proy. {fmt(t.venta_total.proyectada)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs font-bold text-k-text3 uppercase border-b border-k-border">Costo por recurso</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase text-k-text3 border-b border-k-border">
            <th className="text-left px-4 py-1.5">Recurso</th>
            <th className="text-right px-4 py-1.5">Dir. mes</th><th className="text-right px-4 py-1.5">Dir. acum</th>
            <th className="text-right px-4 py-1.5">Ind. mes</th><th className="text-right px-4 py-1.5">Ind. acum</th>
          </tr></thead>
          <tbody>
            {recs.map(r => {
              const dm = t.costo_directo.mes[r] || 0, da = t.costo_directo.acum[r] || 0
              const im = t.costo_indirecto.mes[r] || 0, ia = t.costo_indirecto.acum[r] || 0
              if (!dm && !da && !im && !ia) return null
              return (
                <tr key={r} className="border-b border-k-border/40">
                  <td className="px-4 py-1.5 text-k-text2">{r}</td>
                  <td className="px-4 py-1.5 text-right text-k-text2">{fmt(dm)}</td>
                  <td className="px-4 py-1.5 text-right text-k-text">{fmt(da)}</td>
                  <td className="px-4 py-1.5 text-right text-k-text2">{fmt(im)}</td>
                  <td className="px-4 py-1.5 text-right text-k-text">{fmt(ia)}</td>
                </tr>
              )
            })}
            <tr className="font-bold border-t border-k-border">
              <td className="px-4 py-2 text-k-text">TOTAL COSTO S/.</td>
              <td className="px-4 py-2 text-right text-k-text" colSpan={2}>mes {fmt(t.costo_total.mes)}</td>
              <td className="px-4 py-2 text-right text-k-amber" colSpan={2}>acum {fmt(t.costo_total.acum)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {[['Saldo de obra (proyección)', t.saldo_obra],
          ['Costo aplicado', ro.totales.costo_aplicado_acum],
          ['Resultado pendiente', ro.totales.resultado_pendiente],
          ['PREV del mes (cierre anterior)', t.prev?.costo ?? 0]].map(([l, v]) => (
          <div key={l as string} className="bg-k-surface border border-k-border rounded-xl px-3 py-2.5">
            <div className="text-[10px] uppercase text-k-text3">{l}</div>
            <div className="font-bold text-k-text">S/ {fmt(v as number)}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-k-text3">
        US$ (TC mensual): venta {fmt(ro.usd.venta_acum)} · costo {fmt(ro.usd.costo_acum)} · margen {fmt(ro.usd.margen_acum)} · TC del corte {ro.usd.tc_corte}
      </div>
    </div>
  )
}

function RFases({ filas }: { filas: FilaFase[] }) {
  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
          {['Fase', 'MAT', 'MO', 'EQP', 'EQT', 'SUB', 'DIR', 'GG', 'TOTAL', 'VENTA', 'MARGEN', '%', 'META'].map(h => (
            <th key={h} className={`px-2.5 py-2 ${h === 'Fase' ? 'text-left' : 'text-right'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={`border-b border-k-border/40 ${f.fase === null ? 'font-bold bg-k-raised/40' : ''}`}>
              <td className="px-2.5 py-1.5 text-k-text2">
                {f.fase ?? ''} {f.descripcion ? <span className="text-k-text3">{String(f.descripcion).slice(0, 26)}</span> : ''}
                {f.indirecta && f.fase && <span className="text-[9px] text-k-amber ml-1">IND</span>}
              </td>
              {[f.mat, f.mo, f.eqp, f.eqt, f.sub, f.dir, f.gg].map((v, j) => (
                <td key={j} className="px-2.5 py-1.5 text-right text-k-text3">{v ? fmt(v) : ''}</td>
              ))}
              <td className="px-2.5 py-1.5 text-right text-k-text">{fmt(f.total)}</td>
              <td className="px-2.5 py-1.5 text-right text-k-text">{fmt(f.venta)}</td>
              <td className={`px-2.5 py-1.5 text-right font-bold ${f.margen >= 0 ? 'text-k-green' : 'text-k-red'}`}>{fmt(f.margen)}</td>
              <td className="px-2.5 py-1.5 text-right text-k-text3">{pct(f.pct_margen)}</td>
              <td className="px-2.5 py-1.5 text-right text-k-text3">{f.meta ? fmt(f.meta) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Proyeccion() {
  const qc = useQueryClient()
  const celdas = useQuery<CeldaProy[]>({
    queryKey: ['ro-proyeccion'],
    queryFn: () => api(`/ev/ro/proyeccion?proyecto_id=${PROYECTO_ID}`),
  })
  const regenerar = useMutation({
    mutationFn: () => api('/ev/ro/proyectar', { method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID }) }),
    onSuccess: (j) => {
      const r = j as { meses: number; escritas: number; respetadas_manual: number }
      alert(`Proyección regenerada: ${r.escritas} celdas en ${r.meses} meses (${r.respetadas_manual} manuales respetadas)`)
      qc.invalidateQueries({ queryKey: ['ro-proyeccion'] }); qc.invalidateQueries({ queryKey: ['ro-mensual'] })
    },
    onError: (e: Error) => alert(e.message),
  })
  const editar = useMutation({
    mutationFn: (c: CeldaProy) => {
      const v = prompt(`Nuevo monto para ${c.fase ?? '(sin fase)'} · ${c.tipo_recurso} · ${MESES[c.mes]} ${c.anio}:`, String(c.monto))
      if (v === null) return Promise.reject(new Error('cancelado'))
      return api('/ev/ro/proyeccion', { method: 'PUT', body: JSON.stringify({
        proyecto_id: PROYECTO_ID, fase: c.fase, tipo_recurso: c.tipo_recurso,
        periodo_id: c.periodo_id, monto: Number(v) || 0 }) })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ro-proyeccion'] }); qc.invalidateQueries({ queryKey: ['ro-mensual'] }) },
    onError: (e: Error) => { if (e.message !== 'cancelado') alert(e.message) },
  })

  return (
    <div className="space-y-3">
      <button onClick={() => regenerar.mutate()} disabled={regenerar.isPending}
        className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber text-black font-bold hover:bg-k-amber2 disabled:opacity-50">
        {regenerar.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Regenerar propuesta AUTO (respeta lo manual)
      </button>
      <div className="bg-k-surface border border-k-border rounded-xl overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-k-surface"><tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
            <th className="text-left px-3 py-2">Mes</th><th className="text-left px-3 py-2">Fase</th>
            <th className="text-left px-3 py-2">Recurso</th><th className="text-right px-3 py-2">Monto</th>
            <th className="text-left px-3 py-2">Origen</th><th></th>
          </tr></thead>
          <tbody>
            {(celdas.data ?? []).map(c => (
              <tr key={c.id} className="border-b border-k-border/40 hover:bg-k-raised/40">
                <td className="px-3 py-1.5 text-k-text3">{MESES[c.mes]} {c.anio}</td>
                <td className="px-3 py-1.5 text-k-text2">{c.fase}</td>
                <td className="px-3 py-1.5 text-k-text2">{c.tipo_recurso}</td>
                <td className="px-3 py-1.5 text-right text-k-text">{fmt(c.monto)}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    c.origen === 'MANUAL' ? 'bg-amber-500/15 text-k-amber' : 'bg-k-raised text-k-text3'}`}>{c.origen}</span>
                </td>
                <td className="px-2 py-1.5">
                  <button onClick={() => editar.mutate(c)} className="text-k-text3 hover:text-k-amber"><Pencil size={12} /></button>
                </td>
              </tr>
            ))}
            {(celdas.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-k-text3">
                Sin proyección aún — usa "Regenerar propuesta AUTO" (requiere presupuesto META vigente).
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
