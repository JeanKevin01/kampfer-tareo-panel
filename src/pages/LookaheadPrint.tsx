// Vista imprimible del LookAhead (formato Anexo 01 del ex-gerente).
// /programacion/lookahead-imprimir?desde=YYYY-MM-DD&semanas=N (FUERA del Layout);
// guardar como PDF con el diálogo de impresión (horizontal recomendado).
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { lunesDe, iso } from '@/lib/semana'
import BrandDoc from '@/components/print/BrandDoc'
import { fmtDeps, numerosDeGrid } from '@/lib/lookahead'
import type { MapaNumeros } from '@/lib/lookahead'
import type { GridResp } from '@/components/LookaheadGrid'
import { leerFiltrosDeUrl, pasaFiltros, tieneTrabajoEn, describirFiltros } from '@/lib/lookaheadFiltros'

const PROYECTO_ID = 1
const DIAS_1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const fmtLarga = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''))

const TINTA = '#10151f'
const td: React.CSSProperties = { border: '1px solid #c8cdd6', padding: '2px 5px', fontSize: 10 }
const tdC: React.CSSProperties = { ...td, textAlign: 'center' }

export default function LookaheadPrint() {
  const [params] = useSearchParams()
  const desde = params.get('desde') || iso(lunesDe(new Date()))
  const semanas = Math.min(8, Math.max(1, Number(params.get('semanas') || 4)))
  const filtros = leerFiltrosDeUrl(params)

  const grid = useQuery<GridResp>({
    queryKey: ['lookahead-grid-print', desde, semanas],
    queryFn: () => api(`/ev/programacion/lookahead-grid?proyecto_id=${PROYECTO_ID}&desde=${desde}&semanas=${semanas}`),
  })
  if (!grid.data) return <div style={{ padding: 40, fontFamily: "'Geist Variable', sans-serif", color: '#55606f' }}>Cargando LookAhead…</div>
  const bruto = grid.data
  const nTotal = bruto.grupos.reduce((s, g) => s + g.actividades.length, 0)
  // Los MISMOS filtros de la pantalla (llegan en la URL). Antes esta vista
  // ignoraba los filtros: se miraba una obra recortada, se imprimía la entera,
  // y el papel decía otra cosa que la reunión.
  const porId = new Map(bruto.grupos.flatMap(g => g.actividades).map(a => [a.id, a]))
  const salvados = new Set<number>()
  if (filtros.soloConTrabajo) {
    for (const g of bruto.grupos) for (const a of g.actividades) {
      if (!tieneTrabajoEn(a, bruto.fechas, () => false)) continue
      salvados.add(a.id)
      let p = a.padre_id
      while (p) { salvados.add(p); p = porId.get(p)?.padre_id ?? null }
    }
  }
  const d = {
    ...bruto,
    grupos: bruto.grupos
      .map(g => ({ ...g, actividades: g.actividades.filter(a =>
        (!filtros.soloConTrabajo || salvados.has(a.id)) && pasaFiltros(a, filtros, () => false)) }))
      .filter(g => g.actividades.length > 0),
  }
  const nActs = d.grupos.reduce((s, g) => s + g.actividades.length, 0)
  const recorte = describirFiltros(filtros)

  return (
    <BrandDoc
      tipo="Look Ahead"
      titulo={`Del ${fmtLarga(d.desde)} al ${fmtLarga(d.hasta)} · ${semanas} semanas`}
      meta={<>
        {/* Si el papel es un recorte hay que decirlo ARRIBA: quien lo recibe no
            sabe que faltan filas, y un informe incompleto sin avisar engaña. */}
        {nActs < nTotal && (
          <b style={{ color: '#8a5a00' }}>
            Vista filtrada: {nActs} de {nTotal} actividades
            {recorte.length ? ` — ${recorte.join(' · ')}` : ''}
            {filtros.soloConTrabajo && !recorte.length ? ' — solo las que tienen trabajo en el periodo' : ''}
            {' · '}
          </b>
        )}
        {nActs} actividades · celda: programado (azul) / real (verde = más, ámbar = igual,
        rojo = menos que lo programado) · ∅ = salto intencional
      </>}
      hint="Usa orientación horizontal (A3 o A4 apaisado)."
      page="size: A3 landscape; margin: 10mm"
      wide
    >
      <style>{`
        .lk-t { border-collapse: collapse; width: 100%; }
        .lk-t tr { page-break-inside: avoid; }
      `}</style>

      <table className="lk-t">
        <thead>
          <tr>
            <th style={{ ...td, background: TINTA, color: '#fff', textAlign: 'left', minWidth: 190 }} rowSpan={2}>ACTIVIDADES</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>RESP</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>METRADO</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>UND</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>PLAZO</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>F. Inic</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>F. Fin</th>
            <th style={{ ...td, background: TINTA, color: '#fff' }} rowSpan={2}>DESPUÉS DE</th>
            {d.semanas.map((s, i) => (
              <th key={s.lunes} colSpan={7}
                style={{ ...td, background: i === 0 ? TINTA : '#3a4152', color: '#fff', letterSpacing: '.03em' }}>
                {i === 0 ? 'SEMANA ACTUAL' : `SEMANA +${i}`} · {fmtCorta(s.lunes)} — {fmtCorta(s.domingo)}
              </th>
            ))}
          </tr>
          <tr>
            {d.fechas.map((f, i) => (
              <th key={f} style={{ ...tdC, background: '#eef1f5', fontSize: 8, minWidth: 26 }}>
                {DIAS_1[i % 7]}<br />{fmtCorta(f)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.grupos.map(g => (
            <GrupoPrint key={g.otm_id ?? '-'} grupo={g} fechas={d.fechas}
              numeros={numerosDeGrid(d.grupos.flatMap(x => x.actividades))} />
          ))}
          {nActs === 0 && (
            <tr><td colSpan={8 + d.fechas.length} style={{ ...tdC, padding: 20, color: '#8a93a1' }}>Sin actividades en el rango.</td></tr>
          )}
        </tbody>
      </table>
    </BrandDoc>
  )
}

function GrupoPrint({ grupo, fechas, numeros }: {
  grupo: GridResp['grupos'][number]; fechas: string[]; numeros: MapaNumeros
}) {
  return (
    <>
      <tr>
        <td colSpan={8 + fechas.length} style={{ ...td, background: '#dbe6f4', fontWeight: 700 }}>
          {grupo.otm_id ?? 'Sin OTM'}{grupo.otm_desc ? ` — ${grupo.otm_desc}` : ''}
        </td>
      </tr>
      {grupo.actividades.map(a => (
        <tr key={a.id} style={a.estado === 'CANCELADO' ? { color: '#999' } : undefined}>
          <td style={td}>
            {/* La sub-fila se sangra y lleva su número: impreso, el árbol tiene
                que leerse igual que en pantalla o la reunión no lo sigue. */}
            {a.padre_id ? (
              <span style={{ paddingLeft: 10 }}>
                <span style={{ fontFamily: 'monospace', color: '#666' }}>
                  {numeros.get(a.id) ?? a.id}{' '}
                </span>
                {a.titulo}
              </span>
            ) : a.titulo}
            {a.padre_id && (a.desglose_1 || a.desglose_2) && (
              <div style={{ fontSize: 8, color: '#456', paddingLeft: 10 }}>
                ▸ {[a.desglose_1, a.desglose_2].filter(Boolean).join(' · ')}
              </div>
            )}
            {a.partida_codigo && <div style={{ fontSize: 8, color: '#666', fontFamily: 'monospace' }}>📌 {a.partida_codigo}</div>}
            {a.estado === 'NO_CUMPLIDA' && <div style={{ fontSize: 8, color: '#a11' }}>NO CUMPLIDA{a.causa_nc ? ` — ${a.causa_nc}` : ''}</div>}
          </td>
          <td style={tdC}>{a.supervisor_nombre?.split(' ')[0] || a.responsable || ''}</td>
          <td style={tdC}>
            <b>{a.metrado_prog != null ? num(a.metrado_prog) : ''}</b>
            {a.metrado_base != null && <div style={{ fontSize: 8, color: '#666' }}>base {num(a.metrado_base)}</div>}
          </td>
          <td style={tdC}>{a.und ?? ''}</td>
          <td style={tdC}>{a.plazo_dias != null ? num(a.plazo_dias) : ''}</td>
          <td style={tdC}>{fmtCorta(a.fecha)}</td>
          <td style={tdC}>{fmtCorta(a.fecha_fin)}</td>
          <td style={{ ...tdC, fontFamily: 'monospace', fontSize: 8 }}>{fmtDeps(a.predecesoras, numeros)}</td>
          {fechas.map(f => {
            const p = a.prog[f]; const r = a.real[f]
            const esSalto = (a.dias_salto ?? []).includes(f)
            const esMedio = (a.dias_medio ?? []).includes(f)
            const clrR = r == null ? undefined
              : r > (p ?? 0) + 0.0005 ? '#186a2b' : r >= (p ?? 0) - 0.0005 ? '#8a6d1a' : '#a11212'
            const fondo = esSalto ? '#e8e8e8'
              : esMedio && p ? 'linear-gradient(to top, #e2eefb 50%, transparent 50%)'
              : p ? '#e2eefb' : undefined
            return (
              <td key={f} style={{ ...tdC, padding: '1px 2px', background: fondo }}>
                {esSalto ? <span style={{ color: '#999' }}>∅</span> : null}
                {esMedio ? <span style={{ color: '#999', fontSize: 7 }}>◐</span> : null}
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
