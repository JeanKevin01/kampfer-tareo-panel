// Reporte por partida — SUSTENTO DE VALORIZACIÓN (Jean, 2026-07-19).
// Cuando el cliente pide el respaldo de lo valorizado, este documento junta
// por cada partida: sus cifras (metrado, HH, avance) + todos los partes de
// campo en orden cronológico (del más antiguo al más nuevo) con sus fotos.
// Vive FUERA del Layout: se abre en pestaña nueva y se exporta con
// «Imprimir → Guardar como PDF» del navegador (sin dependencias nuevas).
// La identidad visual la aporta BrandDoc (cabecera, tipografía, color, pie).
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import BrandDoc from '@/components/print/BrandDoc'

interface Foto { id: number; url: string | null; url_thumb: string | null; purgada: boolean }
interface ReporteBloque {
  id: number; fecha: string; area: string | null; turno: string | null
  actividad: string | null; supervisor: string; texto: string
  hh_dia: number; fotos: Foto[]
}
interface PartidaBloque {
  partida: {
    id: number; codigo: string; descripcion: string; unidad: string | null
    otm_id: string | null; otm_desc: string | null
    metrado_presup: number; metrado_ejec: number; avance: number | null
    hh_presup: number; hh_gastadas: number; hh_rango: number; sin_tareo: boolean
  }
  reportes: ReporteBloque[]
}

const nf = (v: number, d = 2) =>
  v.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })

const fechaLarga = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-PE',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Las fotos vienen con URL firmada relativa al API
const mediaUrl = (u: string) => (u.startsWith('http') ? u : `${API_BASE}${u}`)

const CIFRAS: { k: keyof PartidaBloque['partida']; label: string; fuerte?: boolean }[] = [
  { k: 'metrado_presup', label: 'Metrado presup.' },
  { k: 'metrado_ejec', label: 'Metrado ejecutado', fuerte: true },
  { k: 'avance', label: '% avance', fuerte: true },
  { k: 'hh_presup', label: 'HH presup.' },
  { k: 'hh_gastadas', label: 'HH gastadas' },
]

export default function ReportePartidaPrint() {
  const params = new URLSearchParams(window.location.search)
  const partidas = params.get('partidas') ?? ''
  const desde = params.get('desde') ?? ''
  const hasta = params.get('hasta') ?? ''

  const { data, isLoading, error } = useQuery<{ partidas: PartidaBloque[] }>({
    queryKey: ['reporte-partida', partidas, desde, hasta],
    queryFn: () => api(`/ev/programacion/reporte-partida?partidas=${partidas}`
      + `${desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`),
    enabled: !!partidas,
  })

  useEffect(() => { document.title = 'KAMPFER · Sustento por partida' }, [])

  if (!partidas) return <Aviso>Falta indicar las partidas.</Aviso>
  if (isLoading) return <Aviso><Loader2 className="animate-spin inline mr-2" size={16} />Armando el sustento…</Aviso>
  if (error) return <Aviso>No se pudo cargar: {(error as Error).message}</Aviso>

  const bloques = data?.partidas ?? []
  const hayPurgadas = bloques.some(b => b.reportes.some(r => r.fotos.some(f => f.purgada)))
  const nReportes = bloques.reduce((s, b) => s + b.reportes.length, 0)

  const valorCifra = (p: PartidaBloque['partida'], k: keyof PartidaBloque['partida']) => {
    if (k === 'avance') return p.avance == null ? '—' : `${(p.avance * 100).toFixed(1)}%`
    if (k === 'metrado_presup') return `${nf(p.metrado_presup)} ${p.unidad ?? ''}`.trim()
    if (k === 'metrado_ejec') return `${nf(p.metrado_ejec)} ${p.unidad ?? ''}`.trim()
    if (k === 'hh_presup') return nf(p.hh_presup, 1)
    if (k === 'hh_gastadas')
      return p.hh_rango !== p.hh_gastadas
        ? `${nf(p.hh_gastadas, 1)}  (${nf(p.hh_rango, 1)} en el periodo)`
        : nf(p.hh_gastadas, 1)
    return String(p[k] ?? '')
  }

  return (
    <BrandDoc
      tipo="Sustento de valorización"
      titulo="Reporte por partida"
      meta={<>
        {desde || hasta
          ? `Periodo: ${desde || 'inicio'} — ${hasta || 'hoy'}`
          : 'Todo el historial registrado'}
        {' · '}{bloques.length} partida{bloques.length !== 1 ? 's' : ''}
        {' · '}{nReportes} reporte{nReportes !== 1 ? 's' : ''} de campo
      </>}
      hint="Guarda el PDF antes de que la retención purgue las fotos de campo."
      aviso={hayPurgadas
        ? 'Algunas fotos ya fueron purgadas del disco por la política de retención; el texto del parte se conserva. Exporta el sustento antes de que venza la retención.'
        : undefined}
    >
      <style>{`
        .rp-part { margin-top: 26px; }
        .rp-part + .rp-part { border-top: 1px solid var(--linea2); padding-top: 22px; }
        .rp-part-cod { font-size: 17px; font-weight: 700; line-height: 1.2; }
        .rp-part-otm { font-size: 11.5px; color: var(--tinta2); margin: 2px 0 12px; }
        .rp-cifras { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px;
          background: var(--linea); border: 1px solid var(--linea); border-radius: 9px;
          overflow: hidden; margin-bottom: 16px; }
        .rp-cel { background: #fff; padding: 9px 12px; }
        .rp-cel-l { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--tinta3); }
        .rp-cel-v { font-size: 15px; font-weight: 600; margin-top: 3px; font-variant-numeric: tabular-nums; }
        .rp-cel-v.fuerte { color: #0a7d4f; }
        .rp-sintareo { font-size: 11.5px; color: #8a5a06; background: #fdf6e6;
          border: 1px solid #f0d69a; border-radius: 8px; padding: 9px 13px; margin-bottom: 16px; }
        .rp-rep { page-break-inside: avoid; margin-bottom: 22px; }
        .rp-rep-h { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
          border-bottom: 1px solid var(--linea); padding-bottom: 5px; margin-bottom: 8px; }
        .rp-rep-fecha { font-size: 13px; font-weight: 600; text-transform: capitalize; }
        .rp-rep-hh { font-size: 11px; color: var(--tinta2); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .rp-parte { font-family: 'Geist Mono', ui-monospace, Menlo, monospace;
          font-size: 11px; line-height: 1.65; white-space: pre-wrap;
          background: #f8fafc; border: 1px solid var(--linea2); border-radius: 8px; padding: 13px 15px; }
        .rp-fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .rp-fotos img { width: 100%; border-radius: 7px; border: 1px solid var(--linea); }
        .rp-foto-purgada { height: 150px; border: 1px dashed var(--linea); border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: var(--tinta3); font-style: italic; }
        .rp-vacio { font-size: 13px; color: var(--tinta3); font-style: italic; }
      `}</style>

      {bloques.map(b => (
        <section key={b.partida.id} className="rp-part">
          <div className="rp-part-cod">{b.partida.codigo} — {b.partida.descripcion}</div>
          <div className="rp-part-otm">
            {b.partida.otm_id}{b.partida.otm_desc ? ` · ${b.partida.otm_desc}` : ''}
          </div>

          {/* Cabecera de cifras: lo que el cliente pregunta al revisar */}
          <div className="rp-cifras">
            {CIFRAS.map(c => (
              <div key={c.k} className="rp-cel">
                <div className="rp-cel-l">{c.label}</div>
                <div className={`rp-cel-v${c.fuerte ? ' fuerte' : ''}`}>{valorCifra(b.partida, c.k)}</div>
              </div>
            ))}
          </div>

          {/* Incoherencia visible: hay partes de campo pero el tareo no cargó
              HH a esta partida. Mejor decirlo que imprimir un 0 sin explicar. */}
          {b.partida.sin_tareo && (
            <div className="rp-sintareo">
              Hay reportes de campo pero <b>ninguna HH del tareo quedó cargada a esta partida</b>.
              Revísalo en «Registros y HH» del día: el tareo pudo enviarse sin partida, con 0 HH,
              o lo reemplazó un envío posterior del mismo supervisor/OTM/día.
            </div>
          )}

          {b.reportes.length === 0 ? (
            <p className="rp-vacio">Sin reportes de campo en el periodo.</p>
          ) : b.reportes.map(r => (
            <div key={r.id} className="rp-rep">
              <div className="rp-rep-h">
                <span className="rp-rep-fecha">
                  {fechaLarga(r.fecha)}{r.actividad ? ` · ${r.actividad}` : ''}
                </span>
                {r.hh_dia > 0 && <span className="rp-rep-hh">{nf(r.hh_dia, 1)} HH</span>}
              </div>
              <pre className="rp-parte">{r.texto}</pre>
              {r.fotos.length > 0 && (
                <div className="rp-fotos">
                  {r.fotos.map(f => f.url
                    ? <img key={f.id} src={mediaUrl(f.url)} alt="" loading="lazy" />
                    : <div key={f.id} className="rp-foto-purgada">foto purgada del disco</div>)}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {bloques.length === 0 && <p className="rp-vacio">Sin datos para esas partidas.</p>}
    </BrandDoc>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#55606f',
    background: '#fff', minHeight: '100vh', fontFamily: "'Geist Variable', sans-serif" }}>{children}</div>
}
