import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Search, Printer, CheckSquare, Square, Loader2, Grid2x2, Grid3x3 } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE
interface Trabajador { id: string; nombre: string; cargo: string; activo: boolean }

function imprimirSeleccion(lista: Trabajador[], cols: number) {
  const win = window.open('', '_blank')
  if (!win) return
  const cards = lista.map(t => {
    const wrap = document.getElementById(`iqr-${t.id}`)
    const svg  = wrap?.querySelector('svg')
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
    <h1>KAMPFER · SMCV Misceláneos · ${lista.length} trabajadores</h1>
    <div class="grid">${cards}</div>
    <script>window.onload=()=>{ setTimeout(()=>window.print(), 300) }<\/script>
  </body></html>`)
  win.document.close()
}

export default function ImpresionQR() {
  const [search, setSearch]           = useState('')
  const [cargoFilter, setCargoFilter] = useState('TODOS')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cols, setCols]               = useState(4)

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

  const todosSeleccionados = filtered.length > 0 && filtered.every(t => seleccionados.has(t.id))

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccionados(prev => {
        const next = new Set(prev)
        filtered.forEach(t => next.delete(t.id))
        return next
      })
    } else {
      setSeleccionados(prev => {
        const next = new Set(prev)
        filtered.forEach(t => next.add(t.id))
        return next
      })
    }
  }

  function toggle(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const listaImprimir = activos.filter(t => seleccionados.has(t.id))

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">
          Selecciona los trabajadores que quieres imprimir
        </p>
        <button
          onClick={() => imprimirSeleccion(listaImprimir, cols)}
          disabled={seleccionados.size === 0}
          className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
          <Printer size={15} />
          Imprimir {seleccionados.size > 0 ? `(${seleccionados.size})` : ''}
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

        {/* Columnas de impresión */}
        <div className="flex items-center gap-1 bg-k-raised border border-k-border rounded-lg p-1">
          {[
            { val: 4, Icon: Grid2x2,  label: '4 col' },
            { val: 5, Icon: Grid3x3,  label: '5 col' },
            { val: 6, Icon: Grid3x3,  label: '6 col' },
          ].map(({ val, Icon, label }) => (
            <button key={val} onClick={() => setCols(val)}
              title={label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                cols === val ? 'bg-k-amber text-black' : 'text-k-text3 hover:text-k-text'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Seleccionar todos */}
        <button onClick={toggleTodos} disabled={filtered.length === 0}
          className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 hover:text-k-text font-bold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
          {todosSeleccionados
            ? <><CheckSquare size={14} className="text-k-amber" /> Deseleccionar todos</>
            : <><Square size={14} /> Seleccionar todos</>
          }
        </button>
      </div>

      {/* Info selección */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-k-text3 uppercase tracking-wide">
          {isLoading ? 'Cargando…' : `${filtered.length} de ${activos.length} trabajadores · ${seleccionados.size} seleccionados`}
        </span>
        {seleccionados.size > 0 && (
          <button onClick={() => setSeleccionados(new Set())}
            className="text-[11px] text-k-text3 hover:text-k-red transition-colors">
            Limpiar selección
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-k-text3">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando…
        </div>
      )}

      {/* Grid */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filtered.map(t => {
            const selected = seleccionados.has(t.id)
            return (
              <div key={t.id}
                onClick={() => toggle(t.id)}
                className={`relative rounded-xl p-3 flex flex-col items-center text-center cursor-pointer transition-all select-none ${
                  selected
                    ? 'bg-amber-500/10 border-2 border-k-amber'
                    : 'bg-k-surface border border-k-border hover:border-k-border2'
                }`}>

                {/* Checkbox */}
                <div className={`absolute top-2 right-2 transition-colors ${
                  selected ? 'text-k-amber' : 'text-k-text3'}`}>
                  {selected ? <CheckSquare size={14} /> : <Square size={14} />}
                </div>

                {/* QR */}
                <div id={`iqr-${t.id}`}
                  className={`bg-white rounded-lg p-1.5 mb-2 transition-all ${selected ? 'ring-2 ring-k-amber' : ''}`}>
                  <QRCodeSVG value={t.id} size={100} level="M" />
                </div>

                <p className="text-[10px] font-bold text-k-text leading-tight mb-0.5 line-clamp-2">{t.nombre}</p>
                <p className="text-[9px] text-k-text3 mb-1">{t.cargo}</p>
                <p className="font-mono text-[10px] text-k-amber font-bold">ID: {t.id}</p>
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