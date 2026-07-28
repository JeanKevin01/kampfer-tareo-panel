// ── QRs del personal ─────────────────────────────────────────
// Eran DOS pestañas —«QRs» (galería + descarga) e «Impresión QR» (selección +
// hojas de carnets)— que compartían el filtro, la cuadrícula y el botón de
// imprimir. Verlas separadas obligaba a elegir pestaña antes de saber qué se
// quería hacer. Ahora es una sola: se filtra, se marca lo que haga falta (o
// nada, y va todo lo filtrado) y se imprime o se descarga suelto.
// Encargo de Jean (2026-07-28).
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  Search, Printer, Download, CheckSquare, Square, Loader2, Grid2x2, Grid3x3,
} from 'lucide-react'

import { api } from '@/lib/api'

interface Trabajador { id: string; nombre: string; cargo: string; activo: boolean }

function svgDe(id: string) {
  return document.getElementById(`qr-${id}`)?.querySelector('svg') ?? null
}

/** Descarga el QR suelto: sirve para pegarlo en un documento o mandarlo. */
function descargar(t: Trabajador) {
  const svg = svgDe(t.id)
  if (!svg) return
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `QR_${t.id}_${t.nombre.replace(/\s+/g, '_')}.svg`
  a.click()
  URL.revokeObjectURL(a.href)
}

function imprimir(lista: Trabajador[], cols: number) {
  const win = window.open('', '_blank')
  if (!win) return
  const cards = lista.map(t => {
    const svg = svgDe(t.id)
    const svgStr = svg ? new XMLSerializer().serializeToString(svg) : ''
    const partes = t.nombre.split(' ')
    const l1 = partes.slice(0, 2).join(' ')
    const l2 = partes.slice(2).join(' ')
    return `
      <div class="card">
        <div class="qr">${svgStr}</div>
        <p class="nom">${l1}</p>
        ${l2 ? `<p class="nom">${l2}</p>` : ''}
        <p class="carg">${t.cargo}</p>
        <p class="id">ID: ${t.id}</p>
      </div>`
  }).join('')
  const cardSize = cols === 4 ? 140 : cols === 5 ? 110 : 90
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>QRs Kampfer — ${lista.length} trabajadores</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;background:#fff;padding:8px}
      h1{font-size:11px;color:#666;margin-bottom:8px;text-align:center}
      .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px}
      .card{border:1px solid #ccc;border-radius:6px;padding:8px;text-align:center;break-inside:avoid;page-break-inside:avoid}
      .qr svg{width:${cardSize}px!important;height:${cardSize}px!important}
      .nom{font-size:8px;font-weight:700;margin-top:4px;line-height:1.3;color:#111}
      .carg{font-size:7px;color:#666;margin-top:1px}
      .id{font-size:8px;color:#d97706;font-family:monospace;font-weight:700;margin-top:2px}
      @media print{
        @page{margin:6mm}
        body{padding:0}
      }
    </style>
  </head><body>
    <h1>KAMPFER · ${lista.length} trabajadores</h1>
    <div class="grid">${cards}</div>
    <script>window.onload=()=>{ setTimeout(()=>window.print(), 300) }</scr` + `ipt>
  </body></html>`)
  win.document.close()
}

export default function QRs() {
  const [search, setSearch]           = useState('')
  const [cargoFilter, setCargoFilter] = useState('TODOS')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cols, setCols]               = useState(4)

  const { data: trabajadores = [], isLoading } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
  })

  const activos = useMemo(() => trabajadores.filter(t => t.activo), [trabajadores])
  const cargos = useMemo(() =>
    ['TODOS', ...[...new Set(activos.map(t => t.cargo))].sort()], [activos])
  const filtered = useMemo(() => activos.filter(t => {
    const q = search.toUpperCase()
    return (t.nombre.includes(q) || t.cargo.includes(q) || t.id.includes(q)) &&
           (cargoFilter === 'TODOS' || t.cargo === cargoFilter)
  }), [activos, search, cargoFilter])

  // Sin selección se imprime lo que está a la vista: el caso habitual es
  // «imprimir toda la cuadrilla», y obligar a marcarlos uno por uno sobraba.
  const aImprimir = seleccionados.size > 0
    ? activos.filter(t => seleccionados.has(t.id))
    : filtered
  const todosSel = filtered.length > 0 && filtered.every(t => seleccionados.has(t.id))

  const toggleTodos = () => setSeleccionados(prev => {
    const next = new Set(prev)
    filtered.forEach(t => (todosSel ? next.delete(t.id) : next.add(t.id)))
    return next
  })
  const toggle = (id: string) => setSeleccionados(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">
          Cada QR encodea el <span className="text-k-amber font-bold">ID numérico</span> del
          trabajador. Si cambia el nombre o el cargo, el QR físico sigue siendo válido.
        </p>
        <button onClick={() => imprimir(aImprimir, cols)} disabled={aImprimir.length === 0}
          title={seleccionados.size > 0
            ? `Imprime los ${seleccionados.size} seleccionados`
            : 'Sin selección se imprime todo lo que estás viendo'}
          className="btn btn-primario">
          <Printer size={15} /> Imprimir ({aImprimir.length})
        </button>
      </div>

      {/* Controles */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
          <input type="text" placeholder="Buscar por nombre, cargo o ID…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
        </div>

        <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text2 outline-none focus:border-k-amber transition-colors">
          {cargos.map(c => <option key={c} value={c} className="bg-k-raised">{c}</option>)}
        </select>

        {/* Carnets por fila al imprimir */}
        <div className="flex items-center gap-1 bg-k-raised border border-k-border rounded-lg p-1">
          {[{ val: 4, Icon: Grid2x2 }, { val: 5, Icon: Grid3x3 }, { val: 6, Icon: Grid3x3 }]
            .map(({ val, Icon }) => (
              <button key={val} onClick={() => setCols(val)} title={`${val} carnets por fila`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                  cols === val ? 'bg-k-amber text-black' : 'text-k-text3 hover:text-k-text'}`}>
                <Icon size={13} /> {val} col
              </button>
            ))}
        </div>

        <button onClick={toggleTodos} disabled={filtered.length === 0}
          className="btn btn-secundario">
          {todosSel
            ? <><CheckSquare size={14} className="text-k-amber" /> Deseleccionar todos</>
            : <><Square size={14} /> Seleccionar todos</>}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-k-text3 uppercase tracking-wide">
          {isLoading ? 'Cargando…'
            : `${filtered.length} de ${activos.length} trabajadores${
              seleccionados.size > 0 ? ` · ${seleccionados.size} seleccionados` : ''}`}
        </span>
        {seleccionados.size > 0 && (
          <button onClick={() => setSeleccionados(new Set())}
            className="text-[11px] text-k-text3 hover:text-k-red transition-colors">
            Limpiar selección
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-k-text3">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando trabajadores…
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filtered.map(t => {
            const sel = seleccionados.has(t.id)
            return (
              <div key={t.id} onClick={() => toggle(t.id)}
                className={`relative rounded-xl p-3 flex flex-col items-center text-center cursor-pointer transition-all select-none group ${
                  sel ? 'bg-amber-500/10 border-2 border-k-amber'
                      : 'bg-k-surface border border-k-border hover:border-k-border2'}`}>
                <div className={`absolute top-2 right-2 transition-colors ${
                  sel ? 'text-k-amber' : 'text-k-text3'}`}>
                  {sel ? <CheckSquare size={14} /> : <Square size={14} />}
                </div>

                <div id={`qr-${t.id}`}
                  className={`bg-white rounded-lg p-1.5 mb-2 transition-all ${sel ? 'ring-2 ring-k-amber' : ''}`}>
                  <QRCodeSVG value={t.id} size={100} level="M" />
                </div>

                <p className="text-[10px] font-bold text-k-text leading-tight mb-0.5 line-clamp-2">{t.nombre}</p>
                <p className="text-[9px] text-k-text3 mb-1">{t.cargo}</p>
                <p className="font-mono text-[10px] text-k-amber font-bold">ID: {t.id}</p>

                <button onClick={e => { e.stopPropagation(); descargar(t) }}
                  title="Descargar este QR suelto (SVG)"
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-k-text3 hover:text-k-amber bg-k-raised border border-k-border hover:border-k-amber/30 rounded-lg py-1.5 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100">
                  <Download size={11} /> SVG
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-3 opacity-20">🖨️</div>
          <p className="text-k-text3 text-sm">Sin resultados para ese filtro</p>
        </div>
      )}
    </div>
  )
}
