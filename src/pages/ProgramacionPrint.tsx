// Vista imprimible del reporte semanal de campo (actividades + fotos).
// Se abre en /programacion/imprimir?lunes=YYYY-MM-DD (FUERA del Layout) y el
// usuario la guarda como PDF con el diálogo de impresión del navegador.
// Importante: imprimir/guardar dentro de los ~15 min de la carga (las URLs de
// las fotos están firmadas con TTL corto; recargar la página las renueva).
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import type { Semana, Reporte } from '@/pages/Programacion'

const PROYECTO_ID = 1
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const fmtLarga = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ProgramacionPrint() {
  const [params] = useSearchParams()
  const lunes = params.get('lunes') || iso(lunesDe(new Date()))

  const sem = useQuery<Semana>({
    queryKey: ['programacion-print', lunes],
    queryFn: () => api(`/ev/programacion/semana?proyecto_id=${PROYECTO_ID}&lunes=${lunes}`),
  })

  if (!sem.data) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Cargando reporte…</div>
  const s = sem.data
  const repsPorId = new Map(s.reportes.map(r => [r.id, r]))

  return (
    <div style={{ background: '#fff', color: '#111', minHeight: '100vh', fontFamily: 'Georgia, serif' }}>
      <style>{`
        @media print { .no-print { display: none !important } }
        .foto-print { max-width: 100%; width: 46%; border: 1px solid #ccc; border-radius: 4px; margin: 4px 2% 4px 0; }
        .dia-print { page-break-inside: avoid; }
      `}</style>

      <div className="no-print" style={{ padding: '12px 40px', background: '#f4f4f4', borderBottom: '1px solid #ddd', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#111', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={14} /> Imprimir / Guardar PDF
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>Guarda el PDF antes de purgar las fotos de esta semana.</span>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 40px' }}>
        <div style={{ borderBottom: '3px solid #111', paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>KAMPFER · REPORTE SEMANAL DE CAMPO</div>
          <h1 style={{ margin: '6px 0 2px', fontSize: 26 }}>
            Semana del {fmtLarga(s.fechas[0])} al {fmtLarga(s.fechas[6])}
          </h1>
          <div style={{ fontSize: 12, color: '#555' }}>
            {s.actividades.length} actividades programadas · {s.reportes.length} reportes de campo ·
            generado el {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {s.fechas.map((f, i) => {
          const acts = s.actividades.filter(a => a.fecha === f)
          const libres = s.reportes.filter(r => r.fecha === f && !r.actividad_id)
          if (acts.length === 0 && libres.length === 0) return null
          return (
            <div key={f} className="dia-print" style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 16, borderBottom: '1px solid #999', paddingBottom: 4 }}>
                {DIAS[i]} {fmtLarga(f)}
              </h2>
              {acts.map(a => (
                <div key={a.id} style={{ margin: '10px 0 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {a.otm_id ? `[${a.otm_id}] ` : ''}{a.titulo}
                    <span style={{
                      fontSize: 10, fontWeight: 700, marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                      background: a.estado === 'EJECUTADO' ? '#d8f5dc' : a.estado === 'CANCELADO' ? '#fbdcdc' : '#fdf0d0',
                      color: a.estado === 'EJECUTADO' ? '#186a2b' : a.estado === 'CANCELADO' ? '#8f1d1d' : '#7c5a10',
                    }}>{a.estado}</span>
                  </div>
                  {a.responsable && <div style={{ fontSize: 12, color: '#555' }}>Responsable: {a.responsable}</div>}
                  {a.descripcion && <div style={{ fontSize: 12, margin: '4px 0' }}>{a.descripcion}</div>}
                  {a.reportes.map(id => { const r = repsPorId.get(id); return r ? <BloqueReporte key={id} rep={r} /> : null })}
                </div>
              ))}
              {libres.map(r => (
                <div key={r.id} style={{ margin: '10px 0 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.otm_id ? `[${r.otm_id}] ` : ''}Reporte de campo</div>
                  <BloqueReporte rep={r} />
                </div>
              ))}
            </div>
          )
        })}

        {s.actividades.length === 0 && s.reportes.length === 0 && (
          <p style={{ color: '#777' }}>Semana sin actividades ni reportes.</p>
        )}

        <div style={{ borderTop: '1px solid #999', marginTop: 30, paddingTop: 8, fontSize: 10, color: '#777' }}>
          KAMPFER — del tareo al Resultado Operativo sin Excel · reporte generado automáticamente desde los datos de campo
        </div>
      </div>
    </div>
  )
}

function BloqueReporte({ rep }: { rep: Reporte }) {
  return (
    <div style={{ margin: '6px 0 6px 12px', paddingLeft: 10, borderLeft: '3px solid #ccc' }}>
      {rep.descripcion && <div style={{ fontSize: 12, marginBottom: 4 }}>{rep.descripcion}</div>}
      <div style={{ fontSize: 11, color: '#666' }}>{rep.supervisor_nombre || rep.supervisor_id}</div>
      <div>
        {rep.fotos.map(f => f.url
          ? <img key={f.id} className="foto-print" src={`${API_BASE}${f.url}`} alt="" />
          : <span key={f.id} style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>[foto purgada] </span>)}
      </div>
    </div>
  )
}
