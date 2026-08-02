// ── Menú «⋯ Más» de una cabecera ──────────────────────────────
// Regla del sistema de color (tanda 1): si una cabecera pasa de cuatro
// botones, los de menos uso se guardan aquí. Un planner nuevo abría
// Programación y veía seis botones idénticos sin saber cuál se usa a diario;
// esto deja arriba solo lo que se usa, sin esconder nada de verdad.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const panel = useRef<HTMLDivElement>(null)
  // La tira es ancha, así que dónde cabe se calcula, no se declara: el espacio
  // útil no es la ventana sino el área de contenido (el sidebar está fijo
  // encima y se comía la primera tarjeta). Se ancla a la derecha del botón y
  // se empuja hacia dentro si se saldría; si aun así no cabe, `flex-wrap`
  // reparte en dos filas.
  const [pos, setPos] = useState<{ top: number; left: number; max: number }>()

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

  useLayoutEffect(() => {
    if (!abierto) return
    const colocar = () => {
      const b = caja.current?.getBoundingClientRect()
      if (!b) return
      const cont = (caja.current?.closest('main') ?? document.body).getBoundingClientRect()
      const izq = cont.left + 8
      const der = cont.right - 8
      const max = Math.max(240, der - izq)
      // Se mide el ancho NATURAL (soltando un instante el tope de la vez
      // anterior y devolviéndolo): si no, al abrirlo en una ventana chica y
      // reabrirlo en una grande se quedaría partido en dos filas para siempre.
      const el = panel.current
      let natural = max
      if (el) {
        const tope = el.style.maxWidth
        el.style.maxWidth = 'none'
        natural = el.offsetWidth
        el.style.maxWidth = tope
      }
      const ancho = Math.min(natural, max)
      setPos({ top: b.bottom + 4, left: Math.min(Math.max(b.right - ancho, izq), der - ancho), max })
    }
    colocar()
    // Va en `fixed` (así no lo recorta ningún ancestro con overflow), y por eso
    // hay que reposicionarlo si la página se mueve debajo.
    window.addEventListener('resize', colocar)
    window.addEventListener('scroll', colocar, true)
    return () => {
      window.removeEventListener('resize', colocar)
      window.removeEventListener('scroll', colocar, true)
    }
  }, [abierto])

  const activos = items.filter(i => i.activo)

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto(v => !v)}
        // El tooltip dice QUÉ está puesto, no solo qué hay dentro: con el menú
        // cerrado esa es la única forma de saberlo sin abrirlo.
        title={activos.length
          ? `${etiqueta} — activo: ${activos.map(i => i.texto).join(' · ')}`
          : `${etiqueta}: ${items.map(i => i.texto).join(' · ')}`}
        aria-haspopup="menu" aria-expanded={abierto}
        className={`btn ${abierto || activos.length ? 'btn-on' : 'btn-terciario'}`}>
        <MoreHorizontal size={16} /> {etiqueta}
        {activos.length > 0 && <span className="font-bold">({activos.length})</span>}
      </button>
      {/* Tira HORIZONTAL, no lista vertical: en vertical el menú caía encima de
          las primeras filas de la tabla y había que cerrarlo para ver el efecto
          de lo que acababas de marcar. En horizontal ocupa el alto de una
          tarjeta y deja la tabla a la vista. `w-max` + `flex-wrap` con el ancho
          medido: si no caben todas en una fila, saltan a la siguiente en vez de
          salirse de la pantalla. */}
      {abierto && (
        <div role="menu" ref={panel}
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, maxWidth: pos?.max,
                   visibility: pos ? 'visible' : 'hidden' }}
          className="fixed z-40 w-max rounded-xl border border-k-border
                     bg-k-surface shadow-2xl p-1.5 flex flex-wrap items-stretch gap-1">
          {items.map(it => {
            // `activo` presente = es un INTERRUPTOR (se queda puesto), no una
            // acción de una vez. Los dos se comportan distinto:
            //  · el interruptor lleva ✓/○ y NO cierra el menú — si cerrara, se
            //    marcaría y no verías que quedó marcado, que es justo lo que
            //    pasaba: «le doy a Fijar columnas y no sé qué elegí»;
            //  · la acción (Contraer todo) sí cierra: ya hizo lo suyo.
            const esToggle = it.activo !== undefined
            return (
            <button key={it.texto} role={esToggle ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={esToggle ? !!it.activo : undefined}
              onClick={() => { it.onClick(); if (!esToggle) setAbierto(false) }}
              className={`w-[180px] text-left px-2.5 py-2 rounded-lg border transition-colors
                          ${it.activo
                            ? 'bg-amber-500/10 hover:bg-amber-500/15 border-k-amber/40'
                            : 'hover:bg-k-raised border-transparent'}`}>
              <span className="flex items-center gap-1.5">
                <span className={`flex-shrink-0 ${it.activo ? 'text-k-amber' : 'text-k-text3'}`}>
                  {esToggle ? (it.activo ? '✓' : '○') : it.icono}
                </span>
                <span className={`text-sm ${it.activo ? 'font-bold text-k-amber' : 'font-medium text-k-text'}`}>
                  {it.texto}
                </span>
              </span>
              {it.ayuda && <span className="block mt-0.5 text-[11px] text-k-text3 leading-snug">{it.ayuda}</span>}
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
