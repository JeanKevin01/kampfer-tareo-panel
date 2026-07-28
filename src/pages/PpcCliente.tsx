// Reporte de cumplimiento PARA EL CLIENTE — vista imprimible.
//
// Es un documento distinto al de oficina, no otro formato del mismo. Al cliente
// no se le entrega el diagnóstico interno: «falta de materiales» o «falta de
// mano de obra» es lo que la oficina técnica usa para atacar lo que se repite,
// y puesto en una carta se lee como una confesión sin contexto. Lo que sí se le
// entrega es qué se avanzó cada día, cuánto se hizo en la semana, si se cumplió
// lo comprometido y la EXPLICACIÓN que el planner escribió del caso.
//
// Una hoja por semana (horizontal). Si el rango es de una sola semana, sale una
// sola — el pedido de Jean: la barra semanal, no una tendencia de gerencia.
import { useEffect, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import BrandDoc from '@/components/print/BrandDoc'

interface ActCierre {
  actividad_id: number
  titulo: string
  comprometido: number
  alcanzado: number
  cumplida: boolean
  no_planificada: boolean
  causa?: string | null
}
interface Cierre {
  cerrada: boolean
  lunes: string
  hasta: string
  parcial: boolean
  comprometidas: number
  cumplidas: number
  ppc: number | null
  actividades: ActCierre[]
}
interface ActGrid {
  id: number; titulo: string; estado: string; fecha: string; fecha_fin: string
  partida_codigo?: string | null; und?: string | null
  prog: Record<string, number>; real: Record<string, number>
}
interface GridResp {
  semanas: { lunes: string; domingo: string; fechas: string[] }[]
  grupos: { otm_id: string | null; otm_desc: string | null; actividades: ActGrid[] }[]
}

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
const ppcHex = (v: number | null) => (v == null ? '#8a93a1' : v >= 0.75 ? '#0a7d4f' : v >= 0.5 ? '#b7791f' : '#c0392b')
const nc = (v: number) => (!v ? '' : String(Math.round(v * 100) / 100))

export default function PpcCliente() {
  const params = new URLSearchParams(window.location.search)
  const proyecto = Number(params.get('proyecto_id')) || 1
  const desde = params.get('desde') || iso(lunesDe(new Date()))
  const hasta = params.get('hasta') || desde

  // Semanas (lunes ISO) del rango. Tope de 8, como el reporte de oficina.
  const weeks = useMemo(() => {
    const out: string[] = []
    let m = lunesDe(new Date(desde + 'T12:00:00'))
    const end = iso(lunesDe(new Date(hasta + 'T12:00:00')))
    while (iso(m) <= end && out.length < 8) {
      out.push(iso(m)); m = new Date(m); m.setDate(m.getDate() + 7)
    }
    return out
  }, [desde, hasta])

  const grid = useQuery<GridResp>({
    queryKey: ['ppc-cli-grid', proyecto, weeks[0], weeks.length],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${proyecto}&desde=${weeks[0]}&semanas=${weeks.length}`),
    enabled: weeks.length > 0,
  })
  // El veredicto y la explicación salen del cierre: congelado si la semana ya
  // se cerró, propuesto si todavía no. Recalcularlos aquí daría un número
  // distinto al que el planner revisó — y el cliente vería otra cosa.
  const cierres = useQueries({
    queries: weeks.map(lunes => ({
      queryKey: ['ppc-cli-cierre', proyecto, lunes],
      queryFn: (): Promise<Cierre> =>
        api(`/ev/programacion/cierre-semana?lunes=${lunes}&proyecto_id=${proyecto}`),
    })),
  })

  useEffect(() => { document.title = 'KAMPFER · Cumplimiento semanal' }, [])

  if (grid.isLoading || cierres.some(c => c.isLoading))
    return <Aviso><Loader2 className="animate-spin inline mr-2" size={16} />Armando el reporte…</Aviso>
  if (grid.error) return <Aviso>No se pudo cargar: {(grid.error as Error).message}</Aviso>
  // Sin el cierre no hay veredicto ni explicación: el reporte saldría con las
  // columnas vacías y nadie sabría por qué. Mejor decirlo.
  if (cierres.length > 0 && cierres.every(c => c.isError))
    return <Aviso>
      Este reporte necesita el API con el <b>cierre de semana</b> (migración 0036).
      Haz el Redeploy y <b>alembic upgrade head</b> en Coolify, y vuelve a abrirlo.
    </Aviso>

  const semGrid = grid.data?.semanas ?? []
  const grupos = grid.data?.grupos ?? []
  const porLunes = new Map<string, Cierre>()
  cierres.forEach((c, i) => { if (c.data) porLunes.set(weeks[i], c.data) })

  const barras = weeks.map(l => ({ lunes: l, c: porLunes.get(l) }))
  const totC = barras.reduce((s, b) => s + (b.c?.comprometidas ?? 0), 0)
  const totE = barras.reduce((s, b) => s + (b.c?.cumplidas ?? 0), 0)
  const global = totC ? totE / totC : null
  const finRango = weeks.length
    ? iso(new Date(new Date(weeks[weeks.length - 1] + 'T12:00:00').getTime() + 6 * 864e5))
    : hasta

  return (
    <BrandDoc
      tipo="Programación · Cumplimiento semanal"
      titulo="Avance y cumplimiento"
      meta={<>{fmtDia(weeks[0] ?? desde)} — {fmtDia(finRango)} · {weeks.length} semana{weeks.length !== 1 ? 's' : ''}</>}
      hint="Avance día a día, cumplimiento del compromiso semanal y explicación de lo que no se alcanzó."
    >
      <style>{`
        @page cliLand { size: A4 landscape; margin: 10mm; }
        .cl-cab { display: flex; align-items: flex-end; gap: 28px; margin: 20px 0 6px; }
        .cl-big { font-size: 34px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
        .cl-big-l { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--tinta3); margin-top: 6px; }
        .cl-nota { font-size: 11px; color: var(--tinta2); max-width: 320px; line-height: 1.5; }
        .cl-sec { font-size: 13px; font-weight: 700; margin: 24px 0 10px; }
        .cl-sec small { font-weight: 400; color: var(--tinta2); }
        .cl-row { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; page-break-inside: avoid; }
        .cl-lbl { font-size: 11px; color: var(--tinta2); flex: none; }
        .cl-bar { flex: 1; height: 16px; background: var(--linea2); border-radius: 4px; overflow: hidden; }
        .cl-bar > span { display: block; height: 100%; border-radius: 4px; }
        .cl-val { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; flex: none; text-align: right; }
        .cl-vacio { font-size: 12px; color: var(--tinta3); font-style: italic; }

        .cl-det { page: cliLand; break-before: page; }
        /* El pie vuelve al @page vertical, y cambiar de tipo de página abre una
           hoja nueva: quedaba una última hoja con solo el pie. */
        .kd-foot { page: cliLand; }
        .cl-det-h { font-size: 15px; font-weight: 700; margin: 4px 0 2px; }
        .cl-det-h small { font-weight: 400; font-size: 11px; color: var(--tinta2); }
        table.cl-t { width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; margin-top: 8px; }
        table.cl-t th, table.cl-t td { border: 1px solid var(--linea); padding: 3px 4px; vertical-align: top; }
        table.cl-t thead th { background: #f4f6f9; text-transform: uppercase; letter-spacing: .03em;
          font-size: 7px; color: var(--tinta2); text-align: center; }
        table.cl-t th.izq, table.cl-t td.izq { text-align: left; }
        .cl-otm { background: #eef2fb; font-weight: 700; color: #24406b; font-size: 8.5px;
          text-transform: none; letter-spacing: 0; }
        .cl-d { text-align: center; font-variant-numeric: tabular-nums; line-height: 1.3; }
        .cl-d .p { color: #2563eb; }
        .cl-d .r { font-weight: 700; }
        .cl-num { text-align: right; font-variant-numeric: tabular-nums; }
        .cl-cu { text-align: center; font-weight: 700; }
        .cl-obs { font-size: 7.5px; color: var(--tinta2); }
        /* El adicional se destaca: es trabajo que se ejecutó fuera del plan de
           la semana y sustenta lo que se hizo de más. */
        tr.cl-adic td { background: #fdf6e6; }
        tr.cl-adic td.izq { border-left: 2.5px solid #d97706; }
        .cl-chip {
          display: inline-block; background: #d97706; color: #fff; font-size: 6px;
          font-weight: 700; letter-spacing: .07em; padding: 1px 4px; border-radius: 3px;
          vertical-align: middle; margin-right: 4px;
        }
        .cl-add { font-size: 7px; color: #b45309; font-weight: 600; }
        .cl-pie { font-size: 8.5px; color: var(--tinta3); margin-top: 8px; line-height: 1.5; }
      `}</style>

      <div className="cl-cab">
        <div>
          <div className="cl-big" style={{ color: ppcHex(global) }}>{pct(global)}</div>
          <div className="cl-big-l">Compromisos cumplidos</div>
        </div>
        <div>
          <div className="cl-big">{totE}<span style={{ color: 'var(--tinta3)', fontWeight: 400 }}>/{totC}</span></div>
          <div className="cl-big-l">Del plan de la{weeks.length !== 1 ? 's' : ''} semana{weeks.length !== 1 ? 's' : ''}</div>
        </div>
        <p className="cl-nota">
          Se compara el <b>total de la semana</b>, no día por día: si el plan pedía 100 el jueves y
          100 el viernes y se hicieron 50 y 150, el compromiso está cumplido.
        </p>
      </div>

      <div className="cl-sec">Cumplimiento por semana</div>
      {barras.length === 0
        ? <p className="cl-vacio">Sin semanas en el rango.</p>
        : barras.map(b => (
          <div key={b.lunes} className="cl-row">
            <span className="cl-lbl" style={{ width: 96 }}>
              Semana del {fmtDia(b.lunes)}
            </span>
            <span className="cl-bar">
              <span style={{ width: `${Math.round((b.c?.ppc ?? 0) * 100)}%`, background: ppcHex(b.c?.ppc ?? null) }} />
            </span>
            <span className="cl-val" style={{ width: 42, color: ppcHex(b.c?.ppc ?? null) }}>{pct(b.c?.ppc ?? null)}</span>
            <span className="cl-lbl" style={{ width: 108, textAlign: 'right' }}>
              {b.c ? `${b.c.cumplidas} de ${b.c.comprometidas} compromisos` : '—'}
            </span>
          </div>
        ))}

      {barras.some(b => b.c?.parcial) && (
        <p className="cl-pie">
          Las semanas marcadas como corte parcial se cerraron antes del domingo: los días
          posteriores al corte se informan en la semana siguiente.
        </p>
      )}

      {semGrid.map(w => (
        <SemanaCliente key={w.lunes} semana={w} grupos={grupos} cierre={porLunes.get(w.lunes)} />
      ))}
    </BrandDoc>
  )
}

function SemanaCliente({ semana, grupos, cierre }: {
  semana: GridResp['semanas'][number]
  grupos: GridResp['grupos']
  cierre?: Cierre
}) {
  const F = semana.fechas
  const solapa = (a: ActGrid) => a.fecha <= F[6] && (a.fecha_fin || a.fecha) >= F[0]
  const gruposSem = grupos
    .map(g => ({ ...g, actividades: g.actividades.filter(a => solapa(a) && a.estado !== 'CANCELADO') }))
    .filter(g => g.actividades.length > 0)
  const juicio = new Map<number, ActCierre>()
  for (const a of cierre?.actividades ?? []) juicio.set(a.actividad_id, a)

  return (
    <section className="cl-det">
      <div className="cl-det-h">
        Semana del {fmtDia(F[0])} al {fmtDia(F[6])} {F[6].slice(0, 4)}
        {cierre && <small> · {cierre.cumplidas} de {cierre.comprometidas} compromisos cumplidos
          {cierre.parcial ? ` · contado hasta el ${fmtDia(cierre.hasta)}` : ''}</small>}
      </div>
      {gruposSem.length === 0 ? (
        <p className="cl-vacio">Semana sin actividades programadas.</p>
      ) : (
        <table className="cl-t">
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '4%' }} />
            {F.map((_, i) => <col key={i} style={{ width: '5.4%' }} />)}
            <col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '5%' }} />
            <col style={{ width: '21.2%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="izq">Actividad</th><th>Und</th>
              {F.map((f, i) => <th key={f}>{DIAS1[i]}<br />{Number(f.slice(8, 10))}</th>)}
              <th>Progr.</th><th>Ejec.</th><th>Cumplió</th><th className="izq">Observación</th>
            </tr>
          </thead>
          <tbody>
            {gruposSem.map(g => (
              <GrupoCliente key={g.otm_id ?? '-'} g={g} F={F} juicio={juicio} />
            ))}
          </tbody>
        </table>
      )}
      <p className="cl-pie">
        Por día: en azul lo <b>programado</b> y debajo lo <b>ejecutado</b>. PROGR. y EJEC. son los
        totales de la semana, y son los que deciden el cumplimiento.
        {(cierre?.actividades ?? []).some(a => a.no_planificada) && <>
          {' '}Las filas marcadas <b style={{ color: '#b45309' }}>ADICIONAL</b> son trabajo
          ejecutado que no estaba en el plan comprometido de la semana: se informa como
          ejecutado, pero queda fuera del cálculo de cumplimiento.
        </>}
        {cierre?.cerrada
          ? ' Semana cerrada: estas cifras ya no se recalculan.'
          : ' Semana aún abierta: las cifras pueden variar hasta el cierre.'}
      </p>
    </section>
  )
}

function GrupoCliente({ g, F, juicio }: {
  g: GridResp['grupos'][number]; F: string[]; juicio: Map<number, ActCierre>
}) {
  return (
    <>
      <tr>
        <td className="cl-otm" colSpan={2 + F.length + 4}>
          {g.otm_id ?? 'Sin OTM'}{g.otm_desc ? ` — ${g.otm_desc}` : ''}
        </td>
      </tr>
      {g.actividades.map(a => {
        const comprom = F.reduce((s, f) => s + (a.prog[f] ?? 0), 0)
        const alcanz = F.reduce((s, f) => s + (a.real[f] ?? 0), 0)
        const j = juicio.get(a.id)
        // Sin veredicto del cierre la actividad solo atraviesa la semana: se
        // informa el avance, no se la juzga.
        const [cu, cuHex] = !j ? ['—', '#8a93a1']
          : j.no_planificada ? ['+', '#b45309']
            : j.cumplida ? ['SÍ', '#0a7d4f'] : ['NO', '#c0392b']
        return (
          <tr key={a.id} className={j?.no_planificada ? 'cl-adic' : undefined}>
            <td className="izq">
              {j?.no_planificada && <span className="cl-chip">ADICIONAL</span>}
              {a.titulo}
              {a.partida_codigo && <span style={{ color: '#8a93a1' }}> · {a.partida_codigo}</span>}
            </td>
            <td style={{ textAlign: 'center' }}>{a.und ?? ''}</td>
            {F.map(f => {
              const p = a.prog[f] ?? 0
              const r = a.real[f] ?? 0
              const rHex = !r ? '#c9cfd8' : r >= p - 5e-4 ? '#0a7d4f' : '#c0392b'
              return (
                <td key={f} className="cl-d">
                  <div className="p">{nc(p) || '·'}</div>
                  <div className="r" style={{ color: rHex }}>{nc(r) || (p ? '0' : '')}</div>
                </td>
              )
            })}
            <td className="cl-num">{nc(comprom) || '—'}</td>
            <td className="cl-num">{nc(alcanz) || '—'}</td>
            <td className="cl-cu" style={{ color: cuHex }}>{cu}</td>
            <td className="cl-obs">
              {/* Solo la explicación redactada. La categoría interna del Pareto
                  se queda en el reporte de oficina. */}
              {j?.no_planificada && <div className="cl-add">Fuera del plan de la semana</div>}
              {j && !j.cumplida && !j.no_planificada && (j.causa?.trim()
                ? j.causa
                : <span style={{ color: '#8a93a1', fontStyle: 'italic' }}>Sin observación registrada</span>)}
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
