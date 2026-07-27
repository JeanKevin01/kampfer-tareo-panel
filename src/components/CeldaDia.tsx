// Una celda = un día. Muestra el PROGRAMADO (azul, línea base) hasta que se
// registra el avance: al escribir encima se guarda el REAL del día (el meta NO
// cambia; el saldo se re-prorratea en los días siguientes) y la celda toma el
// semáforo verde/ámbar/rojo con un ✓ de "registrada".
// En días FUTUROS (editableProg + onProgramar) escribir REPLANIFICA el día:
// la celda queda manual ✎ (protegida, el resto se re-prorratea) y vaciarla
// la devuelve al prorrateo automático — misma lógica que el avance, en plan.
// Un día ◐ (medio día, pesa 0.5) se pinta con relleno SOLO hasta la mitad.
// Compartida por el LookAhead (Programación) y el tab «Avance diario» del VG.
//
// ── Barras (2026-07-27) ────────────────────────────────────────
// Los días seguidos de una actividad forman UNA barra sólida con el número en
// blanco, no cuadritos con un tinte al 20% que se confundían con la reja.
// El relleno va en un DIV interno, no en la celda: `border-collapse` hace que
// el navegador ignore `border-radius` en un <td>, y desde el div sí se pueden
// redondear los extremos (`run` dice cuál es cuál) y dejar la barra flotando
// dentro de la fila. La celda solo pinta la BANDA de los días en que no se
// trabaja, que sí ocupa todo el alto porque es de la columna, no del trabajo.
import { NIVEL_TXT, NIVEL_BG, nivelDe, num, numCorto } from '@/lib/lookahead'
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
  // Reja mínima: la horizontal entre filas y el corte entre semanas. Las
  // verticales de cada día llenaban la pantalla de gris sin aportar nada — la
  // estructura la dan las barras, las bandas y la línea de hoy.
  const marco = `relative border-b border-k-border/50 ${finSemana ? 'border-r-2 border-r-k-text3/40' : ''}`
  // La línea de HOY va como BORDE, no como sombra interior: un inset se pinta
  // por debajo de los hijos, y el div de la barra lo taparía justo en las filas
  // que tienen trabajo ese día — la línea quedaría cortada a trozos.
  const estiloTd = esHoy ? { borderLeft: '3px solid rgb(var(--k-green))' } : undefined

  if (esSalto) {
    return <td title="Salto intencional de la actividad (edítalo en el modal o en el dock)"
      style={estiloTd}
      className={`${marco} px-0.5 py-0.5 text-center text-[10px] bg-k-border/70 text-k-text2`}>∅</td>
  }
  const registrada = real != null
  const nivel = nivelDe(real, prog, laborable)
  // Banda de columna (no se trabaja) vs barra de actividad: la primera ocupa
  // todo el alto de la celda, la segunda flota dentro de la fila.
  const banda = nivel === 'gris'
  const relleno = nivel && !banda ? NIVEL_BG[nivel] : ''
  const curva = run === 'solo' ? 'rounded-md' : run === 'ini' ? 'rounded-l-md'
    : run === 'fin' ? 'rounded-r-md' : ''
  // Medio día: TRAMA DIAGONAL sobre el color pleno. Antes era un relleno a
  // media altura, y al pasar el número a blanco el texto caía sobre la mitad
  // transparente y desaparecía. Rayado se distingue de lejos y el número se
  // sigue leyendo.
  const estiloBarra = esMedio && relleno
    ? { backgroundImage: 'repeating-linear-gradient(45deg, rgb(255 255 255 / .30) 0 3px, transparent 3px 7px)' }
    : undefined

  const modoProg = !editable && !!editableProg && !!onProgramar
  const titulo = (esMedio ? 'Medio día (pesa 0.5). ' : '') + (esManual ? 'Celda replanificada a mano (✎, protegida). ' : '') + (registrada
    ? `Programado: ${prog != null ? num(prog) : '—'} · Real registrado: ${num(real!)}`
    : modoProg
      ? `Programado: ${prog != null ? num(prog) : '—'} — escribe para REPLANIFICAR este día (el resto se re-prorratea); vaciar vuelve al prorrateo automático`
      : (prog ?? 0) > 0 ? `Programado: ${num(prog!)} — escribe el avance real del día` : '')
  const valor = registrada ? real : prog
  // Sobre el relleno sólido las marcas van en blanco; sobre celda vacía, en gris.
  const tinta = relleno ? 'text-white/85' : 'text-k-text3'
  const marcas = (
    <>
      {esMedio && <span className={`absolute top-0 left-0.5 text-[7px] leading-none ${tinta}`} title="Medio día (pesa 0.5)">◐</span>}
      {esManual && <span className={`absolute bottom-0 left-0.5 text-[7px] leading-none ${tinta}`} title="Replanificada a mano (protegida)">✎</span>}
      {registrada && <span className={`absolute top-0 right-0.5 text-[7px] leading-none ${tinta}`} title="Avance registrado">✓</span>}
    </>
  )
  const barraCls = `${relleno} ${curva} ${relleno ? NIVEL_TXT[nivel] : ''}
    relative my-0.5 min-h-[1.15rem] flex items-center justify-center text-[10px] tabular-nums`

  if (!editable && !modoProg) {
    return (
      <td title={titulo} style={estiloTd}
        className={`${marco} p-0 text-center ${banda ? NIVEL_BG.gris : ''}`}>
        <div className={barraCls} style={estiloBarra}>
          {marcas}
          {valor != null && valor > 0 ? numCorto(valor) : ''}
        </div>
      </td>
    )
  }
  // Lo que se ve en la casilla va recortado (cabe en 44 px); si el planner no
  // toca nada NO se guarda nada — así el recorte nunca pisa el valor exacto que
  // hay detrás. Lo que decide eso es si TECLEÓ (dataset.tocado), no si el texto
  // cambió: la celda muestra el PROGRAMADO hasta que hay avance, y escribir el
  // mismo número que el plan («hice lo previsto») es el caso más frecuente de
  // todos — comparar contra el texto lo daba por «no editado» y no guardaba.
  const mostrado = valor != null && valor > 0 ? numCorto(valor) : ''
  const commit = (el: HTMLInputElement) => {
    const tecleo = el.dataset.tocado === '1'
    delete el.dataset.tocado
    if (!tecleo) return
    const limpio = el.value.trim()
    // Si dejó el texto tal cual, vale el número EXACTO que hay detrás y no el
    // recortado que se ve: teclear «41.7» sobre un 41.6667 no lo redondea.
    const v = limpio === '' ? null
      : limpio === mostrado && valor != null ? valor : Number(limpio)
    if (limpio !== '' && (Number.isNaN(v) || v! < 0)) { el.value = mostrado; return }
    if (modoProg) {
      // Replanificar el PROGRAMADO del día; vaciar libera la celda manual.
      if (v === (prog ?? null)) { el.value = mostrado; return }
      onProgramar!(v)
      return
    }
    // vaciar una celda registrada borra el avance del día (vuelve al plan)
    if (registrada ? v === real : v === null) { el.value = mostrado; return }
    onRegistrar(v)
  }
  return (
    <td title={titulo} style={estiloTd}
      className={`${marco} p-0 text-center ${banda ? NIVEL_BG.gris : ''}`}>
      <div className={barraCls} style={estiloBarra}>
        {marcas}
        {/* No controlado + key: al llegar el valor del servidor la celda se re-monta.
            El foco no cambia el fondo (taparía la barra): se marca con un anillo. */}
        <input key={`${prog ?? '-'}|${real ?? '-'}`} defaultValue={mostrado}
          onInput={e => { (e.target as HTMLInputElement).dataset.tocado = '1' }}
          onBlur={e => commit(e.target)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`w-11 bg-transparent text-center text-[10px] tabular-nums py-0.5 outline-none
            focus:ring-2 focus:ring-inset focus:ring-k-amber rounded
            ${relleno ? 'text-white font-bold placeholder:text-white/50' : 'text-k-plan'}`}
          inputMode="decimal" />
      </div>
    </td>
  )
}
