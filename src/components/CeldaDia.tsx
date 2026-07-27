// Una celda = un día. Muestra el PROGRAMADO (celeste, línea base) hasta que
// se registra el avance: al escribir encima se guarda el REAL del día (el
// meta NO cambia; el saldo se re-prorratea en los días siguientes) y la celda
// toma el semáforo verde/ámbar/rojo con un ✓ de "registrada".
// En días FUTUROS (editableProg + onProgramar) escribir REPLANIFICA el día:
// la celda queda manual ✎ (protegida, el resto se re-prorratea) y vaciarla
// la devuelve al prorrateo automático — misma lógica que el avance, en plan.
// Un día ◐ (medio día, pesa 0.5) se pinta con relleno SOLO hasta la mitad.
// Compartida por el LookAhead (Programación) y el tab «Avance diario» del VG.
//
// Los días seguidos de una misma actividad se dibujan como UNA BARRA
// (2026-07-27): sin bordes verticales entre ellos y con un remate en los
// extremos. Antes eran números sueltos que había que juntar con la vista; una
// barra dice de un vistazo cuándo empieza y cuándo acaba. `run` dice qué parte
// de la barra es cada celda; lo calcula la fila, que ve la secuencia entera.
import { NIVEL_TXT, NIVEL_BG, NIVEL_RGBA, nivelDe, num } from '@/lib/lookahead'
import type { Run } from '@/lib/lookahead'

export default function CeldaDia({ prog, real, editable, esSalto, esMedio, laborable, onRegistrar,
  editableProg, onProgramar, esManual, run, esHoy, finSemana }: {
  prog: number | undefined; real: number | undefined
  editable: boolean; esSalto: boolean; esMedio: boolean; laborable: boolean
  onRegistrar: (v: number | null) => void
  editableProg?: boolean; onProgramar?: (v: number | null) => void; esManual?: boolean
  /** posición dentro de la barra de días seguidos */
  run?: Run
  /** el día de hoy lleva la línea vertical que orienta toda la tabla */
  esHoy?: boolean
  /** último día de la semana: separador grueso entre bloques */
  finSemana?: boolean
}) {
  // Reja mínima: solo la horizontal entre filas y el corte entre semanas. Las
  // verticales de cada día llenaban la pantalla de gris sin aportar nada — la
  // estructura la dan las barras, las bandas de fin de semana y la línea de hoy.
  const marco = `border-b border-k-border/50 ${finSemana ? 'border-r-2 border-r-k-border2' : ''}`
  // OJO: con `border-collapse: collapse` el navegador IGNORA border-radius en
  // las celdas, así que los extremos de la barra no se redondean por clase. Se
  // marcan con un filete del mismo color en el borde exterior: da el remate sin
  // pelearse con el modelo de bordes de la tabla, y la continuidad —que es lo
  // que hace que se lea como barra— ya la da el fondo sin verticales.
  const remate = run === 'ini' || run === 'solo' ? 'inset 2px 0 0 rgb(var(--k-border2))' : ''
  const remateFin = run === 'fin' || run === 'solo' ? 'inset -2px 0 0 rgb(var(--k-border2))' : ''
  const sombraHoy = esHoy ? 'inset 2px 0 0 rgb(var(--k-green))' : ''
  // La línea de hoy manda sobre el remate izquierdo (es la referencia global).
  const sombra = [sombraHoy || remate, remateFin].filter(Boolean).join(', ')

  if (esSalto) {
    return <td title="Salto intencional de la actividad (edítalo en el modal o en el dock)"
      style={sombra ? { boxShadow: sombra } : undefined}
      className={`${marco} px-0.5 py-0.5 text-center text-[10px] bg-k-border/40 text-k-text2`}>∅</td>
  }
  const registrada = real != null
  const nivel = nivelDe(real, prog, laborable)
  const clr = nivel ? `${NIVEL_TXT[nivel]}${esMedio ? '' : ` ${NIVEL_BG[nivel]}`}` : ''
  // Medio día: el fondo llena solo la MITAD inferior de la celda (notorio)
  const estilo: React.CSSProperties = {}
  if (esMedio && nivel) estilo.background = `linear-gradient(to top, ${NIVEL_RGBA[nivel]} 50%, transparent 50%)`
  if (sombra) estilo.boxShadow = sombra
  const modoProg = !editable && !!editableProg && !!onProgramar
  const titulo = (esMedio ? 'Medio día (pesa 0.5). ' : '') + (esManual ? 'Celda replanificada a mano (✎, protegida). ' : '') + (registrada
    ? `Programado: ${prog != null ? num(prog) : '—'} · Real registrado: ${num(real!)}`
    : modoProg
      ? `Programado: ${prog != null ? num(prog) : '—'} — escribe para REPLANIFICAR este día (el resto se re-prorratea); vaciar vuelve al prorrateo automático`
      : (prog ?? 0) > 0 ? `Programado: ${num(prog!)} — escribe el avance real del día` : '')
  const valor = registrada ? real : prog
  const marcas = (
    <>
      {esMedio && <span className="absolute top-0 left-0.5 text-[7px] leading-none text-k-text3" title="Medio día (pesa 0.5)">◐</span>}
      {esManual && <span className="absolute bottom-0 left-0.5 text-[7px] leading-none text-k-plan" title="Replanificada a mano (protegida)">✎</span>}
    </>
  )
  if (!editable && !modoProg) {
    return <td title={titulo} style={estilo}
      className={`relative ${marco} px-0.5 py-0.5 text-center text-[10px] tabular-nums ${clr}`}>
      {marcas}
      {valor != null && valor > 0 ? num(valor) : ''}</td>
  }
  const commit = (el: HTMLInputElement) => {
    const limpio = el.value.trim()
    const v = limpio === '' ? null : Number(limpio)
    if (limpio !== '' && (Number.isNaN(v) || v! < 0)) { el.value = valor != null ? num(valor) : ''; return }
    if (modoProg) {
      // Replanificar el PROGRAMADO del día; vaciar libera la celda manual.
      if (v === (prog ?? null)) { el.value = valor != null ? num(valor) : ''; return }
      onProgramar!(v)
      return
    }
    // vaciar una celda registrada borra el avance del día (vuelve a celeste)
    if (registrada ? v === real : v === null) { el.value = valor != null ? num(valor) : ''; return }
    onRegistrar(v)
  }
  return (
    <td title={titulo} style={estilo}
      className={`relative ${marco} p-0 text-center ${clr || (modoProg ? 'text-k-plan' : '')}`}>
      {marcas}
      {registrada && <span className="absolute top-0 right-0.5 text-[7px] leading-none text-current opacity-90" title="Avance registrado">✓</span>}
      {/* No controlado + key: al llegar el valor del servidor la celda se re-monta */}
      <input key={`${prog ?? '-'}|${real ?? '-'}`} defaultValue={valor != null ? num(valor) : ''}
        onBlur={e => commit(e.target)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-11 bg-transparent text-center text-[10px] tabular-nums py-1 outline-none focus:bg-k-raised"
        inputMode="decimal" />
    </td>
  )
}
