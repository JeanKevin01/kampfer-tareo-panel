// Vista imprimible del reporte semanal de campo (actividades + fotos).
// Se abre en /programacion/imprimir?lunes=YYYY-MM-DD (FUERA del Layout) y el
// usuario la guarda como PDF con el diálogo de impresión del navegador.
// Importante: imprimir/guardar dentro de los ~15 min de la carga (las URLs de
// las fotos están firmadas con TTL corto; recargar la página las renueva).
// Identidad visual compartida vía BrandDoc.
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, API_BASE } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import { CNC } from '@/lib/catalogos'
import BrandDoc from '@/components/print/BrandDoc'
import type { Semana, Reporte } from '@/pages/Programacion'

const PROYECTO_ID = 1
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const fmtLarga = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

const ESTADO_LBL: Record<string, string> = { NO_CUMPLIDA: 'NO CUMPLIDA' }

export default function ProgramacionPrint() {
  const [params] = useSearchParams()
  const lunes = params.get('lunes') || iso(lunesDe(new Date()))

  const sem = useQuery<Semana>({
    queryKey: ['programacion-print', lunes],
    queryFn: () => api(`/ev/programacion/semana?proyecto_id=${PROYECTO_ID}&lunes=${lunes}`),
  })

  if (!sem.data) return <div style={{ padding: 40, fontFamily: "'Geist Variable', sans-serif", color: '#55606f' }}>Cargando reporte…</div>
  const s = sem.data
  const repsPorId = new Map(s.reportes.map(r => [r.id, r]))

  const comp = s.actividades.filter(a => a.estado !== 'CANCELADO')
  const cump = comp.filter(a => a.estado === 'EJECUTADO').length
  const nc = comp.filter(a => a.estado === 'NO_CUMPLIDA')
  const ppc = comp.length ? Math.round((cump / comp.length) * 100) : null

  return (
    <BrandDoc
      tipo="Reporte semanal de campo"
      titulo={`Semana del ${fmtLarga(s.fechas[0])} al ${fmtLarga(s.fechas[6])}`}
      meta={<>
        {s.actividades.length} actividades programadas · {s.reportes.length} reportes de campo
        {ppc != null && <>
          {' · '}<b style={{ color: '#10151f' }}>PPC {ppc}%</b> ({cump} de {comp.length} compromisos cumplidos)
          {nc.length > 0 && <>
            {' · Causas: '}
            {Object.entries(nc.reduce((m: Record<string, number>, a) => {
              const k = CNC[a.causa_nc_cat ?? ''] ?? 'Otros'; m[k] = (m[k] || 0) + 1; return m
            }, {})).map(([k, n]) => `${k} (${n})`).join(', ')}
          </>}
        </>}
      </>}
      hint="Guarda el PDF antes de purgar las fotos de esta semana."
    >
      <style>{`
        .pr-dia { page-break-inside: avoid; margin-top: 22px; }
        .pr-dia-h { font-size: 15px; font-weight: 700; border-bottom: 1px solid var(--linea);
          padding-bottom: 4px; margin-bottom: 4px; }
        .pr-act { margin: 12px 0 4px; }
        .pr-act-t { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .pr-chip { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; padding: 2px 9px; border-radius: 999px; }
        .pr-EJECUTADO { background: #dcf5e4; color: #0a7d4f; }
        .pr-NO_CUMPLIDA { background: #fbe0e0; color: #b3261e; }
        .pr-CANCELADO { background: #edeff2; color: #6b7280; }
        .pr-PROGRAMADO { background: #fdf0d3; color: #8a5a06; }
        .pr-sub { font-size: 11.5px; color: var(--tinta2); margin-top: 2px; }
        .pr-desc { font-size: 12px; margin: 4px 0; }
        .pr-causa { font-size: 12px; margin: 4px 0; color: #b3261e; }
        .pr-libre { font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
        .pr-rep { margin: 6px 0 6px 12px; padding-left: 11px; border-left: 3px solid var(--linea); }
        .pr-rep-d { font-size: 12px; margin-bottom: 4px; }
        .pr-rep-s { font-size: 11px; color: var(--tinta2); }
        .pr-foto { width: 46%; border: 1px solid var(--linea); border-radius: 6px; margin: 5px 2% 5px 0; }
        .pr-foto-p { font-size: 11px; color: var(--tinta3); font-style: italic; }
        .pr-vacio { color: var(--tinta3); margin-top: 18px; }
      `}</style>

      {s.fechas.map((f, i) => {
        const acts = s.actividades.filter(a => a.fecha === f)
        const libres = s.reportes.filter(r => r.fecha === f && !r.actividad_id)
        if (acts.length === 0 && libres.length === 0) return null
        return (
          <div key={f} className="pr-dia">
            <div className="pr-dia-h">{DIAS[i]} {fmtLarga(f)}</div>
            {acts.map(a => (
              <div key={a.id} className="pr-act">
                <div className="pr-act-t">
                  <span>{a.otm_id ? `[${a.otm_id}] ` : ''}{a.titulo}</span>
                  <span className={`pr-chip pr-${a.estado}`}>{ESTADO_LBL[a.estado] ?? a.estado}</span>
                </div>
                {(a.supervisor_nombre || a.responsable) && (
                  <div className="pr-sub">
                    {a.supervisor_nombre ? `Supervisor: ${a.supervisor_nombre}` : ''}
                    {a.supervisor_nombre && a.responsable ? ' · ' : ''}
                    {a.responsable ? `Responsable: ${a.responsable}` : ''}
                  </div>
                )}
                {a.descripcion && <div className="pr-desc">{a.descripcion}</div>}
                {a.estado === 'NO_CUMPLIDA' && (a.causa_nc_cat || a.causa_nc) && (
                  <div className="pr-causa">
                    <b>Causa de no cumplimiento:</b> {CNC[a.causa_nc_cat ?? ''] ?? ''}{a.causa_nc ? ` — ${a.causa_nc}` : ''}
                  </div>
                )}
                {a.reportes.map(id => { const r = repsPorId.get(id); return r ? <BloqueReporte key={id} rep={r} /> : null })}
              </div>
            ))}
            {libres.map(r => (
              <div key={r.id}>
                <div className="pr-libre">{r.otm_id ? `[${r.otm_id}] ` : ''}Reporte de campo</div>
                <BloqueReporte rep={r} />
              </div>
            ))}
          </div>
        )
      })}

      {s.actividades.length === 0 && s.reportes.length === 0 && (
        <p className="pr-vacio">Semana sin actividades ni reportes.</p>
      )}
    </BrandDoc>
  )
}

function BloqueReporte({ rep }: { rep: Reporte }) {
  return (
    <div className="pr-rep">
      {rep.descripcion && <div className="pr-rep-d">{rep.descripcion}</div>}
      <div className="pr-rep-s">{rep.supervisor_nombre || rep.supervisor_id}</div>
      <div>
        {rep.fotos.map(f => f.url
          ? <img key={f.id} className="pr-foto" src={`${API_BASE}${f.url}`} alt="" />
          : <span key={f.id} className="pr-foto-p">[foto purgada] </span>)}
      </div>
    </div>
  )
}
