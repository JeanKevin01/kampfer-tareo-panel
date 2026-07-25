// Toggle de tema claro/oscuro del panel. El tema es una clase `claro` en
// <html> que redefine los canales k-* (ver index.css). Se recuerda en
// localStorage y se aplica en index.html ANTES de pintar (sin parpadeo); aquí
// solo se alterna y se sincroniza el color de la barra del sistema.
import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'

function aplicar(claro: boolean) {
  document.documentElement.classList.toggle('claro', claro)
  try { localStorage.setItem('kp_tema', claro ? 'claro' : 'oscuro') } catch { /* modo privado */ }
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', claro ? '#eef1f6' : '#060810')
}

export default function ThemeToggle() {
  const [claro, setClaro] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('claro'))

  const toggle = () => { const v = !claro; setClaro(v); aplicar(v) }

  return (
    <button onClick={toggle} type="button"
      title={claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label="Cambiar entre tema claro y oscuro"
      className="text-k-text3 hover:text-k-amber transition-colors p-1.5 rounded-lg hover:bg-k-raised">
      {claro ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  )
}
