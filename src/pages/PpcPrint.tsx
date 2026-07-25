// Reporte de PPC (Last Planner) — vista imprimible para el cliente / archivo.
// Espeja el submódulo «PPC · Causas» de Programación: KPIs, PPC semanal,
// Pareto de causas de no cumplimiento, restricciones reportadas desde campo y
// PPC por supervisor. Vive FUERA del Layout: se abre en pestaña nueva y se
// exporta con «Imprimir → Guardar como PDF». Identidad = BrandDoc.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import BrandDoc from '@/components/print/BrandDoc'

interface Resp {
  semanal: { lunes: string; comprometidas: number; cumplidas: number; no_cumplidas: number; ppc: number | null }[]
  cnc: { causa: string; etiqueta: string; n: number }[]
  pareto_restricciones?: { causa: string; etiqueta: string; n: number }[]
  por_supervisor: { supervisor_id: string; nombre?: string; comprometidas: number; cumplidas: number; ppc: number | null }[]
}

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
// Semáforo lean: sano ≥75%, alerta ≥50%, crítico bajo eso.
const ppcHex = (v: number | null) => (v == null ? '#8a93a1' : v >= 0.75 ? '#0a7d4f' : v >= 0.5 ? '#b7791f' : '#c0392b')

export default function PpcPrint() {
  const params = new URLSearchParams(window.location.search)
  const semanas = Number(params.get('semanas')) || 8
  const proyecto = Number(params.get('proyecto_id')) || 1

  const { data, isLoading, error } = useQuery<Resp>({
    queryKey: ['ppc-print', proyecto, semanas],
    queryFn: () => api(`/ev/programacion/ppc?proyecto_id=${proyecto}&semanas=${semanas}`),
  })

  useEffect(() => { document.title = 'KAMPFER · Reporte de PPC' }, [])

  if (isLoading) return <Aviso><Loader2 className="animate-spin inline mr-2" size={16} />Armando el reporte de PPC…</Aviso>
  if (error) return <Aviso>No se pudo cargar: {(error as Error).message}</Aviso>

  const d = data!
  const totC = d.semanal.reduce((s, w) => s + w.comprometidas, 0)
  const totE = d.semanal.reduce((s, w) => s + w.cumplidas, 0)
  const totNC = d.semanal.reduce((s, w) => s + w.no_cumplidas, 0)
  const ppcGlobal = totC ? totE / totC : null
  const maxCnc = Math.max(1, ...d.cnc.map(c => c.n))
  const rest = d.pareto_restricciones ?? []
  const maxRest = Math.max(1, ...rest.map(c => c.n))

  const KPIS: [string, string, string][] = [
    ['PPC del periodo', pct(ppcGlobal), ppcHex(ppcGlobal)],
    ['Comprometidas', String(totC), '#10151f'],
    ['Cumplidas', String(totE), '#0a7d4f'],
    ['No cumplidas', String(totNC), '#c0392b'],
  ]

  return (
    <BrandDoc
      tipo="Programación · Last Planner"
      titulo="Reporte de PPC"
      meta={<>Porcentaje de Plan Cumplido · últimas {semanas} semanas · meta lean ≥ 75%</>}
      hint="Indicador de confiabilidad de la programación semanal."
    >
      <style>{`
        .pp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0 8px; }
        .pp-kpi { border: 1px solid var(--linea); border-radius: 10px; padding: 12px 14px; }
        .pp-kpi-v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
        .pp-kpi-l { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--tinta3); margin-top: 6px; }
        .pp-sec { font-size: 13px; font-weight: 700; margin: 26px 0 10px; }
        .pp-sec small { font-weight: 400; color: var(--tinta2); }
        .pp-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; page-break-inside: avoid; }
        .pp-row-lbl { font-size: 11px; color: var(--tinta2); flex: none; }
        .pp-bar { flex: 1; height: 15px; background: var(--linea2); border-radius: 4px; overflow: hidden; }
        .pp-bar > span { display: block; height: 100%; border-radius: 4px; }
        .pp-row-val { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; flex: none; text-align: right; }
        table.pp-tab { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        table.pp-tab th { text-align: left; font-size: 9px; letter-spacing: .05em; text-transform: uppercase;
          color: var(--tinta3); border-bottom: 1px solid var(--linea); padding: 6px 8px; }
        table.pp-tab td { padding: 6px 8px; border-bottom: 1px solid var(--linea2); }
        table.pp-tab td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .pp-vacio { font-size: 12px; color: var(--tinta3); font-style: italic; }
      `}</style>

      {/* KPIs */}
      <div className="pp-kpis">
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="pp-kpi">
            <div className="pp-kpi-v" style={{ color: c }}>{v}</div>
            <div className="pp-kpi-l">{l}</div>
          </div>
        ))}
      </div>

      {/* PPC semanal */}
      <div className="pp-sec">PPC semanal <small>(comprometido vs alcanzado — sano ≥ 75%)</small></div>
      {d.semanal.length === 0
        ? <p className="pp-vacio">Aún no hay actividades programadas en el periodo.</p>
        : d.semanal.map(w => (
          <div key={w.lunes} className="pp-row">
            <span className="pp-row-lbl" style={{ width: 54 }}>{fmtDia(w.lunes)}</span>
            <span className="pp-bar"><span style={{ width: `${Math.round((w.ppc ?? 0) * 100)}%`, background: ppcHex(w.ppc) }} /></span>
            <span className="pp-row-val" style={{ width: 42, color: ppcHex(w.ppc) }}>{pct(w.ppc)}</span>
            <span className="pp-row-lbl" style={{ width: 46, textAlign: 'right' }}>{w.cumplidas}/{w.comprometidas}</span>
          </div>
        ))}

      {/* Pareto de causas de no cumplimiento */}
      <div className="pp-sec">Causas de no cumplimiento <small>(Pareto)</small></div>
      {d.cnc.length === 0
        ? <p className="pp-vacio">Sin no-cumplimientos registrados en el periodo.</p>
        : d.cnc.map(c => (
          <div key={c.causa} className="pp-row">
            <span className="pp-row-lbl" style={{ width: 190 }}>{c.etiqueta}</span>
            <span className="pp-bar"><span style={{ width: `${Math.round((c.n / maxCnc) * 100)}%`, background: '#c0392b' }} /></span>
            <span className="pp-row-val" style={{ width: 26 }}>{c.n}</span>
          </div>
        ))}

      {/* Restricciones reportadas desde campo */}
      <div className="pp-sec">Restricciones que bajaron el rendimiento <small>(reportadas por los supervisores — no afectan el PPC)</small></div>
      {rest.length === 0
        ? <p className="pp-vacio">Ningún supervisor reportó restricciones en el periodo.</p>
        : rest.map(c => (
          <div key={c.causa} className="pp-row">
            <span className="pp-row-lbl" style={{ width: 190 }}>{c.etiqueta}</span>
            <span className="pp-bar"><span style={{ width: `${Math.round((c.n / maxRest) * 100)}%`, background: '#b7791f' }} /></span>
            <span className="pp-row-val" style={{ width: 26 }}>{c.n}</span>
          </div>
        ))}

      {/* PPC por supervisor */}
      <div className="pp-sec">PPC por supervisor</div>
      <table className="pp-tab">
        <thead><tr>
          <th>Supervisor</th><th style={{ textAlign: 'right' }}>Comprometidas</th>
          <th style={{ textAlign: 'right' }}>Cumplidas</th><th style={{ textAlign: 'right' }}>PPC</th>
        </tr></thead>
        <tbody>
          {d.por_supervisor.length === 0
            ? <tr><td colSpan={4} className="pp-vacio">Sin actividades asignadas a supervisores en el periodo.</td></tr>
            : d.por_supervisor.map(s => (
              <tr key={s.supervisor_id}>
                <td>{s.nombre ?? s.supervisor_id}</td>
                <td className="num">{s.comprometidas}</td>
                <td className="num">{s.cumplidas}</td>
                <td className="num" style={{ color: ppcHex(s.ppc), fontWeight: 700 }}>{pct(s.ppc)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </BrandDoc>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#55606f',
    background: '#fff', minHeight: '100vh', fontFamily: "'Geist Variable', sans-serif" }}>{children}</div>
}
