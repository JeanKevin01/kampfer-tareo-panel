// Vista imprimible del LookAhead (formato Anexo 01 del ex-gerente).
// /programacion/lookahead-imprimir?desde=YYYY-MM-DD&semanas=N (FUERA del Layout);
// guardar como PDF con el diálogo de impresión (horizontal recomendado).
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import type { GridResp } from '@/components/LookaheadGrid'

const PROYECTO_ID = 1
const DIAS_1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const fmtLarga = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''))

const td: React.CSSProperties = { border: '1px solid #999', padding: '2px 5px', fontSize: 10 }
const tdC: React.CSSProperties = { ...td, textAlign: 'center' }

export default function LookaheadPrint() {
  const [params] = useSearchParams()
  const desde = params.get('desde') || iso(lunesDe(new Date()))
  const semanas = Math.min(8, Math.max(1, Number(params.get('semanas') || 4)))

  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid-print', desde, semanas],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${desde}&semanas=${semanas}`),
  })
  if (!grid.data) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Cargando LookAhead…</div>
  const d = grid.data
  const nActs = d.grupos.reduce((s, g) => s + g.actividades.length, 0)

  return (
    <div style={{ background: '#fff', color: '#111', minHeight: '100vh', fontFamily: 'Arial, sans-serif', padding: '20px 24px' }}>
      <style>{`
        @media print { .no-print { display: none !important } }
        @page { size: A3 landscape; margin: 10mm }
        table { border-collapse: collapse }
        tr { page-break-inside: avoid }
      `}</style>

      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#111', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={14} /> Imprimir / Guardar PDF
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>Usa orientación horizontal (A3 o A4 apaisado).</span>
      </div>

      <div style={{ borderBottom: '3px solid #111', paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>KAMPFER · LOOK AHEAD</div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 20 }}>
          Del {fmtLarga(d.desde)} al {fmtLarga(d.hasta)} · {semanas} semanas
        </h1>
        <div style={{ fontSize: 11, color: '#555' }}>
          {nActs} actividades · generado el {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })} ·
          {' '}celda: programado (azul) / real (verde = más, ámbar = igual, rojo = menos que lo programado) · ∅ = salto intencional
        </div>
      </div>

      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...td, background: '#111', color: '#fff', textAlign: 'left', minWidth: 190 }} rowSpan={2}>ACTIVIDADES</th>
            <th style={{ ...td, background: '#111', color: '#fff' }} rowSpan={2}>RESP</th>
            <th style={{ ...td, background: '#111', color: '#fff' }} rowSpan={2}>METRADO</th>
            <th style={{ ...td, background: '#111', color: '#fff' }} rowSpan={2}>UND</th>
            <th style={{ ...td, background: '#111', color: '#fff' }} rowSpan={2}>F. Inic</th>
            <th style={{ ...td, background: '#111', color: '#fff' }} rowSpan={2}>F. Fin</th>
            {d.semanas.map((s, i) => (
              <th key={s.lunes} colSpan={7} style={{ ...td, background: '#7b1c1c', color: '#fff' }}>
                {i === 0 ? 'SEMANA ACTUAL' : `SEMANA +${i}`} · {fmtCorta(s.lunes)} — {fmtCorta(s.domingo)}
              </th>
            ))}
          </tr>
          <tr>
            {d.fechas.map((f, i) => (
              <th key={f} style={{ ...tdC, background: '#eee', fontSize: 8, minWidth: 26 }}>
                {DIAS_1[i % 7]}<br />{fmtCorta(f)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.grupos.map(g => (
            <GrupoPrint key={g.otm_id ?? '-'} grupo={g} fechas={d.fechas} />
          ))}
          {nActs === 0 && (
            <tr><td colSpan={6 + d.fechas.length} style={{ ...tdC, padding: 20, color: '#777' }}>Sin actividades en el rango.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ borderTop: '1px solid #999', marginTop: 16, paddingTop: 6, fontSize: 9, color: '#777' }}>
        KAMPFER — del tareo al Resultado Operativo sin Excel · LookAhead generado automáticamente
        (formato de referencia: Anexo 01 - LookAhead)
      </div>
    </div>
  )
}

function GrupoPrint({ grupo, fechas }: { grupo: GridResp['grupos'][number]; fechas: string[] }) {
  return (
    <>
      <tr>
        <td colSpan={6 + fechas.length} style={{ ...td, background: '#dbe6f4', fontWeight: 700 }}>
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => (
        <tr key={a.id} style={a.estado === 'CANCELADO' ? { color: '#999' } : undefined}>
          <td style={td}>
            {a.titulo}
            {a.partida_codigo && <div style={{ fontSize: 8, color: '#666', fontFamily: 'monospace' }}>📌 {a.partida_codigo}</div>}
            {a.estado === 'NO_CUMPLIDA' && <div style={{ fontSize: 8, color: '#a11' }}>NO CUMPLIDA{a.causa_nc ? ` — ${a.causa_nc}` : ''}</div>}
          </td>
          <td style={tdC}>{a.supervisor_nombre?.split(' ')[0] || a.responsable || ''}</td>
          <td style={tdC}>
            <b>{a.metrado_prog != null ? num(a.metrado_prog) : ''}</b>
            {a.metrado_base != null && <div style={{ fontSize: 8, color: '#666' }}>base {num(a.metrado_base)}</div>}
          </td>
          <td style={tdC}>{a.und ?? ''}</td>
          <td style={tdC}>{fmtCorta(a.fecha)}</td>
          <td style={tdC}>{fmtCorta(a.fecha_fin)}</td>
          {fechas.map(f => {
            const p = a.prog[f]; const r = a.real[f]
            const esSalto = (a.dias_salto ?? []).includes(f)
            const clrR = r == null ? undefined
              : r > (p ?? 0) + 0.0005 ? '#186a2b' : r >= (p ?? 0) - 0.0005 ? '#8a6d1a' : '#a11212'
            return (
              <td key={f} style={{ ...tdC, padding: '1px 2px', background: esSalto ? '#e8e8e8' : p ? '#e2eefb' : undefined }}>
                {esSalto ? <span style={{ color: '#999' }}>∅</span> : null}
                {p ? <div style={{ color: '#1a4f9c', fontWeight: 700 }}>{num(p)}</div> : null}
                {r != null ? <div style={{ color: clrR, fontWeight: 700 }}>{num(r)}</div> : null}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
