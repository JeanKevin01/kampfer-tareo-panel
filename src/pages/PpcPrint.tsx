// Reporte de PPC (Last Planner) — vista imprimible PARA OFICINA / gerencia.
// El del cliente es otro documento (`PpcCliente.tsx`): aquí sí van las
// categorías de no cumplimiento, que son el diagnóstico interno.
// Página 1 (vertical): resumen del submódulo «PPC · Causas» — KPIs, PPC
// semanal, Pareto de causas, restricciones y PPC por supervisor (últimas N
// semanas). Páginas siguientes (horizontal): el DETALLE por semana del rango
// elegido — la tabla F030b (actividades × días, comprometido vs alcanzado,
// cumplimiento, causa y restricciones), agrupada por OTM. Vive FUERA del
// Layout: se exporta con «Imprimir → Guardar como PDF». Identidad = BrandDoc.
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import { tendenciaPPC } from '@/lib/tendencia'
import BrandDoc from '@/components/print/BrandDoc'

interface Restriccion { cat: string; detalle: string; fecha: string }
interface Resp {
  semanal: { lunes: string; comprometidas: number; cumplidas: number; no_cumplidas: number; ppc: number | null }[]
  cnc: { causa: string; etiqueta: string; n: number }[]
  pareto_restricciones?: { causa: string; etiqueta: string; n: number }[]
  por_supervisor: { supervisor_id: string; nombre?: string; comprometidas: number; cumplidas: number; ppc: number | null }[]
  restricciones?: Record<string, Restriccion[]>
  cnc_catalogo?: Record<string, string>
}

interface ActGrid {
  id: number; titulo: string; estado: string; fecha: string; fecha_fin: string
  partida_codigo?: string | null; und?: string | null
  responsable?: string | null; supervisor_nombre?: string | null
  causa_nc?: string | null; causa_nc_cat?: string | null
  causa_nc_planner?: string | null; causa_nc_planner_cat?: string | null
  prog: Record<string, number>; real: Record<string, number>
}
interface GridResp {
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  grupos: { otm_id: string | null; otm_desc: string | null; actividades: ActGrid[] }[]
  cnc: Record<string, string>
}

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
// Semáforo lean: sano ≥75%, alerta ≥50%, crítico bajo eso.
const ppcHex = (v: number | null) => (v == null ? '#8a93a1' : v >= 0.75 ? '#0a7d4f' : v >= 0.5 ? '#b7791f' : '#c0392b')
// Número compacto para las celdas de metrado (vacío si es 0).
const nc = (v: number) => (!v ? '' : String(Math.round(v * 100) / 100))
const hoy = () => iso(new Date())

export default function PpcPrint() {
  const params = new URLSearchParams(window.location.search)
  const semanas = Number(params.get('semanas')) || 8
  const proyecto = Number(params.get('proyecto_id')) || 1
  const desde = params.get('desde') || ''
  const hasta = params.get('hasta') || ''

  // Semanas (lunes ISO) que abarca el rango de detalle elegido.
  const weeks = useMemo(() => {
    if (!desde) return [] as string[]
    const out: string[] = []
    let m = lunesDe(new Date(desde + 'T12:00:00'))
    const end = iso(lunesDe(new Date((hasta || desde) + 'T12:00:00')))
    let g = 0
    while (iso(m) <= end && g < 8) { out.push(iso(m)); m = new Date(m); m.setDate(m.getDate() + 7); g++ }
    return out
  }, [desde, hasta])

  // Con rango pedido, TODO el reporte es de ese rango: KPIs, histograma y
  // tendencia incluidos. Antes el resumen eran siempre las últimas N semanas,
  // así que un reporte del 13 al 26 traía además la semana en curso —a medio
  // correr— y la tendencia salía cayendo por una semana que aún no terminaba.
  const resumen = useQuery<Resp>({
    queryKey: ['ppc-print', proyecto, semanas, desde, hasta],
    queryFn: () => api(`/ev/programacion/ppc?proyecto_id=${proyecto}` + (desde
      ? `&desde=${desde}&hasta=${hasta || desde}`
      : `&semanas=${semanas}`)),
  })
  const grid = useQuery<GridResp>({
    queryKey: ['ppc-detalle', proyecto, weeks[0], weeks.length],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${proyecto}&desde=${weeks[0]}&semanas=${weeks.length}`),
    enabled: weeks.length > 0,
  })

  useEffect(() => { document.title = 'KAMPFER · Reporte de PPC' }, [])

  if (resumen.isLoading || (weeks.length > 0 && grid.isLoading))
    return <Aviso><Loader2 className="animate-spin inline mr-2" size={16} />Armando el reporte de PPC…</Aviso>
  if (resumen.error) return <Aviso>No se pudo cargar: {(resumen.error as Error).message}</Aviso>

  const d = resumen.data!
  const totC = d.semanal.reduce((s, w) => s + w.comprometidas, 0)
  const totE = d.semanal.reduce((s, w) => s + w.cumplidas, 0)
  const totNC = d.semanal.reduce((s, w) => s + w.no_cumplidas, 0)
  const ppcGlobal = totC ? totE / totC : null
  const maxCnc = Math.max(1, ...d.cnc.map(c => c.n))
  const rest = d.pareto_restricciones ?? []
  const maxRest = Math.max(1, ...rest.map(c => c.n))
  const cncCat = d.cnc_catalogo ?? {}
  const restPorAct = d.restricciones ?? {}

  const KPIS: [string, string, string][] = [
    ['PPC del periodo', pct(ppcGlobal), ppcHex(ppcGlobal)],
    ['Comprometidas', String(totC), '#10151f'],
    ['Cumplidas', String(totE), '#0a7d4f'],
    ['No cumplidas', String(totNC), '#c0392b'],
  ]

  const semGrid = grid.data?.semanas ?? []
  const grupos = grid.data?.grupos ?? []
  const cncGrid = grid.data?.cnc ?? {}

  return (
    <BrandDoc
      tipo="Programación · Last Planner"
      titulo="Reporte de PPC"
      meta={<>Porcentaje de Plan Cumplido · meta lean ≥ 75% · {desde
        ? <>periodo {fmtDia(weeks[0])} — {fmtDia(iso(new Date(new Date(weeks[weeks.length - 1] + 'T12:00:00').getTime() + 6 * 864e5)))}</>
        : <>últimas {semanas} semanas</>}</>}
      hint="Resumen + detalle semanal por partidas. Indicador de confiabilidad de la programación."
    >
      <style>{`
        @page detLand { size: A4 landscape; margin: 10mm; }
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

        /* Detalle semanal (F030b) — página horizontal */
        .pp-det { page: detLand; break-before: page; }
        /* El pie vuelve al @page vertical, y cambiar de tipo de página abre una
           hoja nueva: quedaba una última hoja con solo el pie. Con detalle, el
           pie se queda en la misma página horizontal. */
        ${weeks.length > 0 ? '.kd-foot { page: detLand; }' : ''}
        .pp-det-h { font-size: 15px; font-weight: 700; margin: 4px 0 2px; }
        .pp-det-h small { font-weight: 400; font-size: 11px; color: var(--tinta2); }
        table.pp-f { width: 100%; border-collapse: collapse; font-size: 7.6px; table-layout: fixed; margin-top: 6px; }
        table.pp-f th, table.pp-f td { border: 1px solid var(--linea); padding: 2.5px 4px; vertical-align: top; }
        table.pp-f thead th { background: #f4f6f9; text-transform: uppercase; letter-spacing: .03em;
          font-size: 6.8px; color: var(--tinta2); text-align: center; }
        table.pp-f th.act, table.pp-f td.act { text-align: left; }
        .pp-otm { background: #eef2fb; font-weight: 700; color: #24406b; font-size: 8px;
          text-transform: none; letter-spacing: 0; }
        .pp-d { text-align: center; font-variant-numeric: tabular-nums; line-height: 1.25; }
        .pp-d .p { color: #2563eb; }
        .pp-d .r { font-weight: 700; }
        .pp-num { text-align: right; font-variant-numeric: tabular-nums; }
        .pp-cu { text-align: center; font-weight: 700; }
        .pp-obs { font-size: 7px; color: var(--tinta2); }
        .pp-obs b { color: #b45309; }
      `}</style>

      {/* ── Página 1: resumen ── */}
      <div className="pp-kpis">
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="pp-kpi">
            <div className="pp-kpi-v" style={{ color: c }}>{v}</div>
            <div className="pp-kpi-l">{l}</div>
          </div>
        ))}
      </div>

      <div className="pp-sec">PPC semanal <small>(comprometido vs alcanzado — sano ≥ 75%)</small></div>
      {d.semanal.length === 0
        ? <p className="pp-vacio">Aún no hay actividades programadas en el periodo.</p>
        : <HistogramaPPC semanal={d.semanal} />}

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

      {/* ── Páginas de detalle: una tabla F030b por semana (horizontal) ── */}
      {semGrid.map(w => (
        <SemanaDetalle key={w.lunes} semana={w} grupos={grupos}
          cncGrid={cncGrid} cncCat={cncCat} restPorAct={restPorAct} />
      ))}
    </BrandDoc>
  )
}

// ── Histograma del PPC con línea de tendencia ────────────────
// Para el dueño de la empresa el dato no es el porcentaje de una semana suelta
// sino hacia dónde va: un 68% subiendo desde 50% y un 68% cayendo desde 85% se
// gestionan al revés. Barras = cada semana; recta = mínimos cuadrados sobre las
// semanas con veredicto; punteada = la meta lean del 75%.
function HistogramaPPC({ semanal }: {
  semanal: { lunes: string; comprometidas: number; cumplidas: number; ppc: number | null }[]
}) {
  const W = 640, H = 190, PAD_L = 26, PAD_B = 26, PAD_T = 14
  const x0 = PAD_L, y0 = H - PAD_B, ancho = W - PAD_L - 8, alto = H - PAD_B - PAD_T
  const n = semanal.length
  const paso = ancho / Math.max(n, 1)
  const barra = Math.min(paso * 0.62, 34)
  const yDe = (v: number) => y0 - v * alto
  const cx = (i: number) => x0 + paso * i + paso / 2

  const t = tendenciaPPC(semanal.map(w => w.ppc))
  const rotulo = Math.max(1, Math.ceil(n / 13))    // no apiñar 26 fechas

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
        aria-label="Histograma del PPC semanal con línea de tendencia">
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={x0} y1={yDe(v)} x2={W - 8} y2={yDe(v)}
              stroke={v === 0.75 ? '#0a7d4f' : '#e4e8ee'} strokeWidth={v === 0 ? 1 : 0.8}
              strokeDasharray={v === 0.75 ? '4 3' : undefined} />
            <text x={x0 - 5} y={yDe(v) + 3} textAnchor="end" fontSize="7.5" fill="#8a93a1">
              {v * 100}
            </text>
          </g>
        ))}
        {semanal.map((w, i) => {
          const v = w.ppc ?? 0
          const h = Math.max(v * alto, w.ppc == null ? 0 : 1.5)
          return (
            <g key={w.lunes}>
              <rect x={cx(i) - barra / 2} y={y0 - h} width={barra} height={h}
                fill={ppcHex(w.ppc)} opacity={0.85} rx={2} />
              {w.ppc != null && (
                <text x={cx(i)} y={y0 - h - 4} textAnchor="middle" fontSize="7.5"
                  fontWeight={700} fill={ppcHex(w.ppc)}>{pct(w.ppc)}</text>
              )}
              {i % rotulo === 0 && (
                <text x={cx(i)} y={y0 + 10} textAnchor="middle" fontSize="7" fill="#8a93a1">
                  {fmtDia(w.lunes)}
                </text>
              )}
              <text x={cx(i)} y={y0 + 19} textAnchor="middle" fontSize="6.5" fill="#c9cfd8">
                {w.cumplidas}/{w.comprometidas}
              </text>
            </g>
          )
        })}
        {t && (
          <line x1={cx(t.desde)} y1={yDe(t.yDesde)} x2={cx(t.hasta)} y2={yDe(t.yHasta)}
            stroke="#24406b" strokeWidth={1.6} strokeDasharray="6 3" />
        )}
      </svg>
      <p style={{ fontSize: 10, color: 'var(--tinta2)', marginTop: 2 }}>
        Barras: PPC de cada semana (debajo, cumplidas/comprometidas). Línea punteada verde: meta
        lean del 75%.{' '}
        {t
          ? <>Línea azul: <b>tendencia</b> — {t.puntosPorSemana > 0 ? `sube ${t.puntosPorSemana}`
            : t.puntosPorSemana < 0 ? `baja ${Math.abs(t.puntosPorSemana)}` : 'estable, 0'} punto
            {Math.abs(t.puntosPorSemana) !== 1 ? 's' : ''} por semana.</>
          : 'Con tres semanas con veredicto se dibuja además la línea de tendencia.'}
      </p>
    </>
  )
}

// Cumplimiento automático (mismo criterio que EvaluacionSemanal / el motor PPC).
function cumpl(a: ActGrid, comprom: number, alcanz: number, fechas: string[]): [string, string] {
  if (a.estado === 'EJECUTADO') return ['SÍ', '#0a7d4f']
  if (a.estado === 'NO_CUMPLIDA') return ['NO', '#c0392b']
  if (a.estado === 'CANCELADO') return ['—', '#8a93a1']
  if (comprom <= 0) return ['…', '#b7791f']
  if (alcanz >= comprom - 5e-4) return ['SÍ', '#0a7d4f']
  if (fechas.length && fechas[6] < hoy()) return ['NO', '#c0392b']
  return ['…', '#b7791f']
}

function SemanaDetalle({ semana, grupos, cncGrid, cncCat, restPorAct }: {
  semana: GridResp['semanas'][number]
  grupos: GridResp['grupos']
  cncGrid: Record<string, string>
  cncCat: Record<string, string>
  restPorAct: Record<string, Restriccion[]>
}) {
  const F = semana.fechas
  // Solo las actividades que se solapan con esta semana.
  const solapa = (a: ActGrid) => a.fecha <= F[6] && (a.fecha_fin || a.fecha) >= F[0]
  const gruposSem = grupos
    .map(g => ({ ...g, actividades: g.actividades.filter(solapa) }))
    .filter(g => g.actividades.length > 0)

  const causaTxt = (a: ActGrid) => {
    const cat = a.causa_nc_planner_cat || a.causa_nc_cat
    const det = a.causa_nc_planner || a.causa_nc
    if (!cat && !det) return ''
    return `${cat ? (cncGrid[cat] || cncCat[cat] || cat) : ''}${det ? ` — ${det}` : ''}`
  }
  const restTxt = (a: ActGrid) => (restPorAct[String(a.id)] ?? [])
    .map(r => r.detalle || cncCat[r.cat] || r.cat).join(' · ')

  return (
    <section className="pp-det">
      <div className="pp-det-h">Detalle semanal <small>· {fmtDia(F[0])} — {fmtDia(F[6])} {F[6].slice(0, 4)}</small></div>
      {gruposSem.length === 0 ? (
        <p className="pp-vacio">Semana sin actividades programadas.</p>
      ) : (
        <table className="pp-f">
          <colgroup>
            <col style={{ width: '17%' }} /><col style={{ width: '4%' }} /><col style={{ width: '9%' }} />
            {F.map((_, i) => <col key={i} style={{ width: '5.5%' }} />)}
            <col style={{ width: '5%' }} /><col style={{ width: '5%' }} /><col style={{ width: '4%' }} />
            <col style={{ width: '15.5%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="act">Actividad</th><th>Und</th><th className="act">Resp.</th>
              {F.map((f, i) => <th key={f}>{DIAS1[i]}<br />{Number(f.slice(8, 10))}</th>)}
              <th>Comp.</th><th>Alc.</th><th>Cumpl.</th><th className="act">Causa / restricciones</th>
            </tr>
          </thead>
          <tbody>
            {gruposSem.map(g => (
              <FragmentGrupo key={g.otm_id ?? '-'} g={g} F={F}
                causaTxt={causaTxt} restTxt={restTxt} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function FragmentGrupo({ g, F, causaTxt, restTxt }: {
  g: GridResp['grupos'][number]; F: string[]
  causaTxt: (a: ActGrid) => string; restTxt: (a: ActGrid) => string
}) {
  return (
    <>
      <tr><td className="pp-otm" colSpan={3 + F.length + 4}>{g.otm_id ?? 'Sin OTM'}{g.otm_desc ? ` — ${g.otm_desc}` : ''}</td></tr>
      {g.actividades.map(a => {
        const comprom = F.reduce((s, f) => s + (a.prog[f] ?? 0), 0)
        const alcanz = F.reduce((s, f) => s + (a.real[f] ?? 0), 0)
        const [cu, cuHex] = cumpl(a, comprom, alcanz, F)
        const causa = causaTxt(a)
        const restr = restTxt(a)
        return (
          <tr key={a.id}>
            <td className="act">
              {a.titulo}
              {a.partida_codigo && <span style={{ color: '#8a93a1' }}> · {a.partida_codigo}</span>}
            </td>
            <td>{a.und ?? ''}</td>
            <td className="act">{a.supervisor_nombre || a.responsable || ''}</td>
            {F.map(f => {
              const p = a.prog[f] ?? 0
              const r = a.real[f] ?? 0
              const rHex = !r ? '#c9cfd8' : r > p + 5e-4 ? '#0a7d4f' : r >= p - 5e-4 ? '#b7791f' : '#c0392b'
              return (
                <td key={f} className="pp-d">
                  <div className="p">{nc(p) || '·'}</div>
                  <div className="r" style={{ color: rHex }}>{nc(r) || (p ? '0' : '')}</div>
                </td>
              )
            })}
            <td className="pp-num">{nc(comprom) || '—'}</td>
            <td className="pp-num">{nc(alcanz) || '—'}</td>
            <td className="pp-cu" style={{ color: cuHex }}>{cu}</td>
            <td className="pp-obs">
              {causa && <div><b>NC:</b> {causa}</div>}
              {restr && <div>⚠ {restr}</div>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#55606f',
    background: '#fff', minHeight: '100vh', fontFamily: "'Geist Variable', sans-serif" }}>{children}</div>
}
