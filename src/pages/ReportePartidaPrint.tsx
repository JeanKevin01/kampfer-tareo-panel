// Reporte por partida — SUSTENTO DE VALORIZACIÓN (Jean, 2026-07-19).
// Cuando el cliente pide el respaldo de lo valorizado, este documento junta
// por cada partida: sus cifras (metrado, HH, avance) + todos los partes de
// campo en orden cronológico (del más antiguo al más nuevo) con sus fotos.
// Vive FUERA del Layout: se abre en pestaña nueva y se exporta con
// «Imprimir → Guardar como PDF» del navegador (sin dependencias nuevas).
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import { api, API_BASE } from '@/lib/api'

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

  return (
    <div className="bg-white text-black min-h-screen">
      <style>{`@media print { .no-print { display: none !important } .quiebre { page-break-inside: avoid } }`}</style>

      <div className="no-print sticky top-0 bg-white border-b border-gray-300 px-8 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {bloques.length} partida{bloques.length !== 1 ? 's' : ''} ·{' '}
          {bloques.reduce((s, b) => s + b.reportes.length, 0)} reportes de campo
        </span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2 rounded">
          <Printer size={14} /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="px-10 py-8 max-w-[820px] mx-auto" style={{ fontFamily: 'Georgia, serif' }}>
        <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mb-1">
          Kampfer · Sustento de valorización
        </p>
        <h1 className="text-2xl font-bold mb-1">Reporte por partida</h1>
        <p className="text-sm text-gray-600">
          {desde || hasta
            ? `Periodo: ${desde || 'inicio'} — ${hasta || 'hoy'}`
            : 'Todo el historial registrado'}
          {' · '}generado el {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {hayPurgadas && (
          <p className="text-[11px] text-amber-700 border border-amber-300 bg-amber-50 rounded px-3 py-2 mt-3">
            Algunas fotos ya fueron purgadas del disco por la política de retención; el texto del
            parte se conserva. Exporta el sustento antes de que venza la retención.
          </p>
        )}
        <hr className="my-6 border-black" />

        {bloques.map(b => (
          <section key={b.partida.id} className="mb-10">
            <h2 className="text-lg font-bold leading-tight">
              {b.partida.codigo} — {b.partida.descripcion}
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              {b.partida.otm_id}{b.partida.otm_desc ? ` · ${b.partida.otm_desc}` : ''}
            </p>

            {/* Cabecera de cifras: lo que el cliente pregunta al revisar */}
            <table className="w-full text-xs border-collapse mb-5">
              <tbody>
                <tr className="bg-gray-100">
                  {['Metrado presupuestado', 'Metrado ejecutado', '% avance', 'HH presupuestadas', 'HH gastadas'].map(h => (
                    <th key={h} className="border border-gray-300 px-2 py-1.5 text-left font-bold">{h}</th>
                  ))}
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {nf(b.partida.metrado_presup)} {b.partida.unidad ?? ''}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 font-bold">
                    {nf(b.partida.metrado_ejec)} {b.partida.unidad ?? ''}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 font-bold">
                    {b.partida.avance == null ? '—' : `${(b.partida.avance * 100).toFixed(1)}%`}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5">{nf(b.partida.hh_presup, 1)}</td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {nf(b.partida.hh_gastadas, 1)}
                    {b.partida.hh_rango !== b.partida.hh_gastadas && (
                      <span className="text-gray-500"> ({nf(b.partida.hh_rango, 1)} en el periodo)</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Incoherencia visible: hay partes de campo pero el tareo no cargó
                HH a esta partida. Mejor decirlo que imprimir un 0 sin explicar. */}
            {b.partida.sin_tareo && (
              <p className="text-[11px] text-amber-700 border border-amber-300 bg-amber-50 rounded px-3 py-2 mb-5">
                Hay reportes de campo pero <b>ninguna HH del tareo quedó cargada a esta partida</b>.
                Revísalo en «Registros y HH» del día: el tareo pudo enviarse sin partida, con 0 HH,
                o lo reemplazó un envío posterior del mismo supervisor/OTM/día.
              </p>
            )}

            {b.reportes.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Sin reportes de campo en el periodo.</p>
            ) : b.reportes.map(r => (
              <div key={r.id} className="quiebre mb-7">
                <h3 className="text-sm font-bold border-b border-gray-300 pb-1 mb-2 flex justify-between gap-3">
                  <span>{fechaLarga(r.fecha)}{r.actividad ? ` · ${r.actividad}` : ''}</span>
                  {r.hh_dia > 0 && (
                    <span className="font-normal text-xs text-gray-600 whitespace-nowrap">
                      {nf(r.hh_dia, 1)} HH
                    </span>
                  )}
                </h3>
                {/* El parte tal como lo envió el supervisor */}
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-3"
                  style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{r.texto}</pre>
                {r.fotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {r.fotos.map(f => f.url
                      ? <img key={f.id} src={mediaUrl(f.url)} alt=""
                          className="w-full rounded border border-gray-300" loading="lazy" />
                      : <div key={f.id}
                          className="h-40 rounded border border-dashed border-gray-300 flex items-center justify-center text-[11px] text-gray-400 italic">
                          foto purgada del disco
                        </div>)}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}

        {bloques.length === 0 && <p className="text-gray-500">Sin datos para esas partidas.</p>}
      </div>
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="p-10 text-center text-gray-600 bg-white min-h-screen">{children}</div>
}
