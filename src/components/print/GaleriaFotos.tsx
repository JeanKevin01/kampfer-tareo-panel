// Galería de fotos de campo para los PDF exportables. Fotos de obra vienen en
// orientaciones mezcladas (verticales del celular, panorámicas); ponerlas en
// una grilla de ancho fijo las deja de altos dispares y con huecos.
//
// Solución: FILAS DE ALTURA UNIFORME sin recorte. Todas las fotos de una fila
// comparten la misma altura; el ancho de cada una se deriva de su propia forma
// (una vertical queda angosta, una panorámica ancha). Se llenan de izquierda a
// derecha y bajan de fila centradas. NO se recorta nada — crítico: las fotos
// del sustento traen círculos/anotaciones del supervisor que son la evidencia,
// y un recorte podría cortar justo la marca.
//
// Los estilos .gf* viven en BrandDoc (todas las vistas imprimibles lo usan).
import type { CSSProperties } from 'react'
import { API_BASE } from '@/lib/api'

export interface FotoMin {
  id: number
  url: string | null
  purgada: boolean
  ancho?: number | null
  alto?: number | null
}

const src = (u: string) => (u.startsWith('http') ? u : `${API_BASE}${u}`)
const ratio = (f: FotoMin) => (f.ancho && f.alto ? f.ancho / f.alto : 4 / 3)

/** alturaMm = altura uniforme de cada fila (por defecto 62 mm). */
export default function GaleriaFotos({ fotos, alturaMm = 62 }: { fotos: FotoMin[]; alturaMm?: number }) {
  if (!fotos.length) return null
  return (
    <div className="gf" style={{ '--gf-h': `${alturaMm}mm` } as CSSProperties}>
      {fotos.map(f => f.url
        ? <div key={f.id} className="gf-it">
            <img src={src(f.url)} alt="" loading="lazy" />
          </div>
        : <div key={f.id} className="gf-purgada" style={{ '--gf-ar': ratio(f) } as CSSProperties}>
            foto purgada del disco
          </div>)}
    </div>
  )
}
