// Rentabilidad.tsx — Fase 3 (MVP): Resultado Operativo por OTM en S/.
// Ingreso valorizado (de la OTM) − Costo de Mano de Obra (HH reales del tareo × tarifa por cargo).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'

interface Cargo { cargo: string; costo_hh: number | null; hh: number }
interface OtmRent {
  otm: string; descripcion: string | null
  ingreso_valorizado: number; ingreso_contractual: number
  hh_total: number; hh_sin_tarifa: number; costo_mo: number; margen: number; pct_margen: number
}
interface RentData {
  otms: OtmRent[]
  total: { ingreso_valorizado: number; costo_mo: number; hh_total: number; hh_sin_tarifa: number; margen: number; pct_margen: number }
  tarifa_default: number
}

const soles = (n: number) => 'S/ ' + (isFinite(n) ? n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')
const fmt0 = (n: number) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '—'
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const mColor = (m: number) => (m >= 0 ? '#2DD4A8' : '#FF6B6B')

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-k-surface border border-k-border rounded-xl p-5">
      <div className="font-mono text-2xl font-medium mb-1" style={{ color }}>{value}</div>
      <div className="text-[11px] text-k-text3 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function TarifasCard() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const { data, isLoading } = useQuery<{ cargos: Cargo[]; default: number | null }>({
    queryKey: ['ev-tarifas'],
    queryFn: async () => {
      const r = await fetch(`${API}/ev/tarifas`)
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
  })

  const guardar = useMutation({
    mutationFn: async (p: { cargo: string; costo_hh: number }) => {
      const r = await fetch(`${API}/ev/tarifas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ev-tarifas'] })
      qc.invalidateQueries({ queryKey: ['ev-rentabilidad'] })
    },
  })

  if (isLoading || !data) {
    return <div className="bg-k-surface border border-k-border rounded-xl p-5"><Loader2 size={14} className="animate-spin text-k-text3" /></div>
  }

  const save = (cargo: string, actual: number | null) => {
    const raw = draft[cargo]
    if (raw === undefined || raw === '') return
    const v = Number(raw)
    if (!isFinite(v) || v < 0) return
    if (actual != null && v === actual) return   // sin cambios reales
    guardar.mutate({ cargo, costo_hh: v })        // permite guardar 0 explícito
  }

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center gap-2">
        <DollarSign size={14} className="text-k-amber" />
        <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Tarifas de Mano de Obra (S/. por HH)</h3>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-k-text3 mb-3">
          Costo S/./HH por cargo. <strong>(Default)</strong> es la tarifa de respaldo para cargos sin tarifa propia. Edita y sal del campo para guardar.
        </p>
        <table className="w-full" style={{ fontSize: 12 }}>
          <thead>
            <tr className="border-b border-k-border">
              <th className="py-1.5 px-2 text-left text-[10px] font-bold text-k-text3 uppercase">Cargo</th>
              <th className="py-1.5 px-2 text-right text-[10px] font-bold text-k-text3 uppercase">HH acum</th>
              <th className="py-1.5 px-2 text-right text-[10px] font-bold text-k-amber uppercase">S/. / HH</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-k-border" style={{ background: '#141926' }}>
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
  const { data, isLoading, error } = useQuery<RentData>({
    queryKey: ['ev-rentabilidad'],
    queryFn: async () => {
      const r = await fetch(`${API}/ev/rentabilidad`)
      if (!r.ok) throw new Error(`Error ${r.status}`)
      return r.json()
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-condensed font-extrabold text-2xl text-k-text tracking-wide flex items-center gap-2">
          <TrendingUp size={22} className="text-k-amber" /> RENTABILIDAD
        </h1>
        <p className="text-xs text-k-text3 mt-0.5">Resultado Operativo por OTM · Ingreso valorizado − Costo de Mano de Obra (HH reales × tarifa)</p>
      </div>

      <TarifasCard />

      {isLoading ? (
        <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando…</p>
      ) : error ? (
        <p className="text-k-red text-sm">Error: {(error as Error).message}</p>
      ) : !data || data.otms.length === 0 ? (
        <p className="text-k-text3 text-sm py-8 text-center">Sin HH de tareo para calcular costos todavía.</p>
      ) : (
        <>
          {data.total.hh_sin_tarifa > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
              style={{ borderColor: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}>
              <AlertTriangle size={16} className="text-k-amber mt-0.5 shrink-0" />
              <p className="text-[12px] text-k-text2 leading-relaxed">
                <strong className="text-k-amber">Tarifas sin configurar.</strong> Hay{' '}
                <strong>{fmt0(data.total.hh_sin_tarifa)} HH sin tarifa</strong>, así que el{' '}
                <strong>Costo MO está subestimado</strong> y el margen aún no refleja el costo real.
                Configura las tarifas de arriba (al menos la <strong>(Default)</strong>) para ver la rentabilidad verdadera.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi label="Ingreso valorizado" value={soles(data.total.ingreso_valorizado)} color="#2DD4A8" />
            <Kpi label="Costo MO" value={soles(data.total.costo_mo)} color="#FF6B6B" />
            <Kpi label="Margen" value={soles(data.total.margen)} color={mColor(data.total.margen)} />
            <Kpi label="% Margen" value={pct(data.total.pct_margen)} color={mColor(data.total.margen)} />
          </div>

          <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-k-raised border-b border-k-border">
              <h3 className="text-[11px] font-bold text-k-text3 uppercase tracking-wider">Resultado Operativo por OTM</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 12 }}>
                <thead>
                  <tr className="border-b border-k-border">
                    <th className="py-2 px-3 text-left text-[10px] font-bold text-k-text3 uppercase">OTM</th>
                    <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">HH</th>
                    <th className="py-2 px-3 text-right text-[10px] font-bold text-k-green uppercase">Ingreso valoriz.</th>
                    <th className="py-2 px-3 text-right text-[10px] font-bold text-k-red uppercase">Costo MO</th>
                    <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">Margen S/.</th>
                    <th className="py-2 px-3 text-right text-[10px] font-bold text-k-text3 uppercase">% Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.otms.map(o => (
                    <tr key={o.otm} className="border-b border-k-border last:border-0">
                      <td className="py-2 px-3">
                        <span className="font-mono text-[11px] text-k-text">{o.otm}</span>
                        {o.hh_sin_tarifa > 0 && (
                          <span title={`${fmt0(o.hh_sin_tarifa)} HH de cargos sin tarifa`} className="ml-2 inline-flex items-center gap-1 text-[9px] text-k-amber">
                            <AlertTriangle size={10} /> {fmt0(o.hh_sin_tarifa)} HH sin tarifa
                          </span>
                        )}
                        <div className="text-[10px] text-k-text3 truncate" style={{ maxWidth: 260 }}>{o.descripcion || ''}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-k-text3">{fmt0(o.hh_total)}</td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-k-green">{soles(o.ingreso_valorizado)}</td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-k-red">{soles(o.costo_mo)}</td>
                      <td className="py-2 px-3 text-right font-mono text-[11px]" style={{ color: mColor(o.margen) }}>{soles(o.margen)}</td>
                      <td className="py-2 px-3 text-right font-mono text-[11px]" style={{ color: mColor(o.margen) }}>{pct(o.pct_margen)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-k-border2">
                    <td className="py-2 px-3 font-bold text-k-text uppercase">Total</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-k-text">{fmt0(data.total.hh_total)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-k-green">{soles(data.total.ingreso_valorizado)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-k-red">{soles(data.total.costo_mo)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: mColor(data.total.margen) }}>{soles(data.total.margen)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: mColor(data.total.margen) }}>{pct(data.total.pct_margen)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-k-text3">
            Costo MO = HH reales del tareo × tarifa del cargo. Ingreso = monto valorizado de la OTM. El margen es a la fecha (acumulado). Materiales y equipos se incorporarán después.
          </p>
        </>
      )}
    </div>
  )
}
