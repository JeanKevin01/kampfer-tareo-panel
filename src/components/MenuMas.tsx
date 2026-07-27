// ── Menú «⋯ Más» de una cabecera ──────────────────────────────
// Regla del sistema de color (tanda 1): si una cabecera pasa de cuatro
// botones, los de menos uso se guardan aquí. Un planner nuevo abría
// Programación y veía seis botones idénticos sin saber cuál se usa a diario;
// esto deja arriba solo lo que se usa, sin esconder nada de verdad.
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface ItemMas {
  icono?: React.ReactNode
  texto: string
  /** una línea explicando qué hace: es lo que aprende el que no conoce el módulo */
  ayuda?: string
  onClick: () => void
  /** para los que abren/cierran un panel: se marca el que está abierto */
  activo?: boolean
}

export default function MenuMas({ items, etiqueta = 'Más' }: {
  items: ItemMas[]
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  // Cerrar al clicar fuera o con Esc: un menú que se queda pegado tapa la
  // tabla que hay debajo.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', esc) }
  }, [abierto])

  const alguoActivo = items.some(i => i.activo)

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto(v => !v)}
        title={`${etiqueta}: ${items.map(i => i.texto).join(' · ')}`}
        aria-haspopup="menu" aria-expanded={abierto}
        className={`btn ${abierto || alguoActivo ? 'btn-on' : 'btn-terciario'}`}>
        <MoreHorizontal size={16} /> {etiqueta}
      </button>
      {abierto && (
        <div role="menu"
          className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-k-border
                     bg-k-surface shadow-2xl overflow-hidden">
          {items.map(it => (
            <button key={it.texto} role="menuitem"
              onClick={() => { it.onClick(); setAbierto(false) }}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2 border-b border-k-border
                          last:border-b-0 hover:bg-k-raised ${it.activo ? 'text-k-amber' : 'text-k-text2'}`}>
              <span className="mt-0.5 flex-shrink-0">{it.icono}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-k-text">{it.texto}</span>
                {it.ayuda && <span className="block text-[11px] text-k-text3 leading-snug">{it.ayuda}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
