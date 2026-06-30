import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Search, Download, Printer, Loader2 } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE
interface Trabajador { id: string; nombre: string; cargo: string; activo: boolean }

function getSVG(wrapId: string) {
  return document.getElementById(wrapId)?.querySelector('svg') ?? null
}

function downloadQR(id: string, nombre: string) {
  const svg = getSVG(`qr-wrap-${id}`)
  if (!svg) return
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `QR_${id}_${nombre.replace(/\s+/g,'_')}.svg`
  a.click()
}

function printQRs(lista: Trabajador[]) {
  const win = window.open('', '_blank')
  if (!win) return
  const cards = lista.map(t => {
    const svg = getSVG(`qr-wrap-${t.id}`)
    const svgStr = svg ? new XMLSerializer().serializeToString(svg) : ''
    const partes = t.nombre.split(' ')
    const l1 = partes.slice(0,2).join(' ')
    const l2 = partes.slice(2).join(' ')
    return `<div class="card">${svgStr}<p class="nom">${l1}</p>${l2 ? `<p class="nom">${l2}</p>` : ''}<p class="carg">${t.cargo}</p><p class="id">ID: ${t.id}</p></div>`
  }).join('')
  win.document.write(`<!DOCTYPE html><html><head><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px}
    .card{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;break-inside:avoid}
    .card svg{width:120px!important;height:120px!important}
    .nom{font-size:9px;font-weight:700;margin-top:5px;line-height:1.3;color:#111}
    .carg{font-size:8px;color:#666;margin-top:2px}
    .id{font-size:9px;color:#d97706;font-family:monospace;font-weight:700;margin-top:3px}
    @media print{@page{margin:8mm}}
  </style></head><body><div class="grid">${cards}</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`)
  win.document.close()
}

export default function QRs() {
  const [search, setSearch]           = useState('')
  const [cargoFilter, setCargoFilter] = useState('TODOS')

  const { data: trabajadores = [], isLoading } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => fetch(API + '/admin/trabajadores').then(r => r.json()),
  })

  const activos = useMemo(() => trabajadores.filter(t => t.activo), [trabajadores])

  const cargos = useMemo(() =>
    ['TODOS', ...[...new Set(activos.map(t => t.cargo))].sort()], [activos])

  const filtered = useMemo(() => activos.filter(t => {
    const q = search.toUpperCase()
    return (t.nombre.includes(q) || t.cargo.includes(q) || t.id.includes(q)) &&
           (cargoFilter === 'TODOS' || t.cargo === cargoFilter)
  }), [activos, search, cargoFilter])

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">
          Cada QR encodea el <span className="text-k-amber font-bold">ID numérico</span> del trabajador.
          Si cambia el nombre o cargo, el QR físico sigue siendo válido.
        </p>
        <button onClick={() => printQRs(filtered)} disabled={filtered.length === 0}
          className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
          <Printer size={15} /> Imprimir {filtered.length > 0 ? `(${filtered.length})` : ''}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
          <input type="text" placeholder="Buscar por nombre, cargo o ID…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
        </div>
        <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text2 outline-none focus:border-k-amber transition-colors">
          {cargos.map(c => <option key={c} value={c} className="bg-k-raised">{c}</option>)}
        </select>
      </div>

      <p className="text-[11px] text-k-text3 uppercase tracking-wide">
        {isLoading ? 'Cargando…' : `${filtered.length} de ${activos.length} trabajadores`}
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-k-text3">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando trabajadores…
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-3 opacity-20">📷</div>
          <p className="text-k-text3 text-sm">Sin resultados para ese filtro</p>
        </div>
      )}

      {/* Grid QRs */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(t => (
            <div key={t.id}
              className="bg-k-surface border border-k-border rounded-xl p-4 flex flex-col items-center text-center hover:border-k-border2 transition-colors group">
              <div id={`qr-wrap-${t.id}`}
                className="bg-white rounded-lg p-2 mb-3 flex items-center justify-center">
                <QRCodeSVG value={t.id} size={114} level="M" />
              </div>
              <p className="text-[11px] font-bold text-k-text leading-tight mb-1 line-clamp-2">{t.nombre}</p>
              <p className="text-[10px] text-k-text3 mb-2">{t.cargo}</p>
              <p className="font-mono text-[11px] text-k-amber font-bold">ID: {t.id}</p>
              <button onClick={() => downloadQR(t.id, t.nombre)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-k-text3 hover:text-k-amber bg-k-raised border border-k-border hover:border-k-amber/30 rounded-lg py-1.5 transition-all opacity-0 group-hover:opacity-100">
                <Download size={11} /> Descargar SVG
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}