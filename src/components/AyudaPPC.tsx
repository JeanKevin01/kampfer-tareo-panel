// ── Ayuda del tab PPC · Causas ────────────────────────────────
// Es la pantalla más difícil del módulo: tiene DOS indicadores que se leen
// juntos (PPC y HH no planificadas), DOS ventanas de tiempo distintas en la
// misma pantalla (la semana del cierre y el acumulado de N semanas), y un
// vocabulario que no es obvio — «comprometida», «no planificada», «propuesto».
// Sin esto, el planner lee el 33% como una nota y no como un diagnóstico.
//
// Mismo esqueleto que AyudaLookahead (encargo de Jean 2026-08-01).
import { useState } from 'react'

const TEMAS = [
  'Qué mide esta pantalla',
  'Comprometer la semana',
  'Trabajo no planificado',
  'Las causas (CNC)',
  'Cerrar la semana',
] as const
type Tema = typeof TEMAS[number]

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[12px] font-bold text-k-amber uppercase tracking-wide mt-4 first:mt-0">{children}</h3>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12px] text-k-text2 leading-relaxed mt-1.5">{children}</p>
)
const Tabla = ({ filas, cab }: { cab: [string, string]; filas: [React.ReactNode, React.ReactNode][] }) => (
  <table className="w-full mt-2 text-[11px] border-collapse">
    <thead>
      <tr>{cab.map(c => (
        <th key={c} className="border border-k-border bg-k-raised px-2 py-1 text-left
                               text-[10px] font-bold uppercase text-k-text3">{c}</th>
      ))}</tr>
    </thead>
    <tbody>
      {filas.map((f, i) => (
        <tr key={i}>
          <td className="border border-k-border px-2 py-1 align-top whitespace-nowrap">{f[0]}</td>
          <td className="border border-k-border px-2 py-1 align-top text-k-text2">{f[1]}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

function Contenido({ tema }: { tema: Tema }) {
  if (tema === 'Qué mide esta pantalla') return (
    <>
      <P>
        Dos indicadores que <b>solo sirven juntos</b>. Por separado cada uno se puede ver bien
        mientras la obra va mal.
      </P>
      <Tabla cab={['Indicador', 'Qué responde']} filas={[
        [<b>PPC</b>, <>De lo que <b>prometiste</b> esta semana, ¿cuánto cumpliste? Mide la
          <b> confiabilidad de tu palabra</b>, no cuánto trabajaste.</>],
        [<b>HH no planificadas</b>, <>De las horas que <b>gastaste</b>, ¿cuántas se fueron en cosas
          que nadie había comprometido? Mide <b>cuánto improvisa</b> la obra.</>],
      ]} />
      <P>
        Por qué el par: puedes tener <b>100% de PPC prometiendo tres cosas</b> y hacer el resto de la
        semana a lo que vaya saliendo. El PPC solo no lo detecta — el segundo sí. Y al revés: bajar
        la improvisación sin cumplir lo prometido tampoco es mejorar.
      </P>
      <H>Por qué las HH y no el número de actividades</H>
      <P>
        Porque una actividad de 4 HH y una de 200 no pesan igual. Si no hay tareo cargado el
        indicador muestra <b>—</b> y nunca 0: un cero diría «no improvisamos nada» cuando lo que pasa
        es que no hay datos.
      </P>
      <H>Ojo: son DOS ventanas de tiempo</H>
      <P>
        Arriba navegas <b>semana a semana</b> (es la del cierre). La bandeja de trabajo no
        planificado de abajo es un <b>acumulado de las últimas N semanas</b> —el selector del
        tab—, para clasificar de una vez todo lo pendiente. Por eso no cambia al mover la semana.
        Si quieres que la siga, marca <b>«Solo la semana de arriba»</b>.
      </P>
    </>
  )

  if (tema === 'Comprometer la semana') return (
    <>
      <P>
        Es el acto más importante de esta pantalla, y el que hace que todo lo demás signifique algo.
        Comprometer <b>congela</b> qué actividades prometiste y <b>cuánto metrado</b> de cada una.
      </P>
      <H>Con la semana comprometida</H>
      <Tabla cab={['', '']} filas={[
        [<b>No planificada</b>, <>Es <b>exacto</b>: no planificada = no está en el conjunto que
          congelaste. Sin nada que deducir ni que desmarcar.</>],
        [<b>El PPC no se mueve solo</b>, <>El denominador queda fijo. Correr la F.Inicio de algo que
          no hiciste ya no lo saca del indicador, y bajarle el metrado tampoco.</>],
      ]} />
      <H>Sin comprometer (lo que ves si no lo haces)</H>
      <P>
        El sistema <b>deduce</b> qué fue no planificado por la <b>fecha en que se creó</b> cada
        actividad. Y eso marca de más un plan que se acordó el lunes y se tecleó el martes: por eso
        aparecen 15 no planificadas en una semana normal. El PPC se llama <b>«propuesto»</b>{' '}
        justamente por eso — es una foto provisional, no una medición.
      </P>
      <P>
        Hay un cortafuegos: si <b>todas</b> las actividades de la semana resultan posteriores, no se
        marca ninguna. Una marca que cae al 100% de las filas no distingue nada, y casi siempre
        significa que el plan se cargó al sistema después (arranque, carga histórica).
      </P>
      <P>
        <b>La costumbre que hay que tomar:</b> comprometer el lunes por la mañana, antes de que la
        semana arranque. Desde ahí, lo que entre es no planificado sin nada que discutir.
      </P>
    </>
  )

  if (tema === 'Trabajo no planificado') return (
    <>
      <P>
        Lo que entró sin estar comprometido. <b>No cuenta en el PPC</b> —nadie lo prometió— pero sí
        en las HH no planificadas. Clasificarlo es lo que convierte «15 no planificadas» en algo que
        se puede atacar.
      </P>
      <H>Los cuatro motivos, y qué haces con cada uno</H>
      <Tabla cab={['Motivo', 'Qué hacer']} filas={[
        [<b>Omisión del planner</b>, <>Era previsible y no se vio. Se corrige <b>estirando el
          LookAhead</b>: si aparece seguido, tu horizonte es corto.</>],
        [<b>Imprevisto o emergencia</b>, <>No era previsible. No se corrige planificando mejor: se
          absorbe con <b>holgura</b>.</>],
        [<b>Pedido del cliente</b>, <>No es tuyo. Es <b>sustento de adicional</b> — esto es plata que
          normalmente se pierde por no tenerla anotada.</>],
        [<b className="text-k-green">Se adelantó</b>, <>Estaba para otra semana. <b>No cuenta</b> en
          el indicador: adelantar es resecuenciar, no improvisar, y castigarlo penalizaría ser
          flexible.</>],
      ]} />
      <P>
        Lo que está <b>sin clasificar también cuenta</b>, a propósito: si lo pendiente desapareciera
        del número, desaparecería el incentivo a clasificarlo.
      </P>
      <H>«¿Desplazó a alguna?»</H>
      <P>
        Es el campo que cierra el círculo: enlaza lo que entró con la comprometida que se quedó sin
        cuadrilla. Con eso el PPC deja de decir «no cumplimos» y pasa a decir «no cumplimos{' '}
        <b>porque</b> entró esto».
      </P>
      <H>No existe «volverla planificada»</H>
      <P>
        Y no es una carencia: si se pudiera meter al plan algo que ya entró, el indicador de
        improvisación se limpiaría solo y dejaría de medir nada. El camino es hacia adelante —
        clasificar, decir a quién desplazó, y comprometer la semana siguiente a tiempo.
      </P>
    </>
  )

  if (tema === 'Las causas (CNC)') return (
    <>
      <P>
        Cuando una comprometida no se cumple hay que decir <b>por qué</b>. Son dos cosas distintas y
        no se mezclan:
      </P>
      <Tabla cab={['Campo', 'Para quién']} filas={[
        [<b>Categoría (interno)</b>, <>Del catálogo CNC. Es lo que alimenta el <b>Pareto</b> y lo
          único que sirve para mejorar. <b>Al cliente no se le entrega.</b></>],
        [<b>Explicación escrita</b>, <>Texto libre: qué pasó exactamente. Es lo que <b>sí</b> sale en
          el reporte del cliente. Sin ella, esa fila sale en blanco.</>],
      ]} />
      <P>
        La causa también puede venir <b>de campo</b>: si el supervisor marcó una al no poder ejecutar,
        aparece como referencia con un botón <b>usar</b>, para no reescribirla de memoria.
      </P>
      <H>Para qué sirve el Pareto</H>
      <P>
        Para no repartir esfuerzo a ciegas. Si domina <b>falta de materiales</b>, el problema es
        logística; si domina <b>mala programación</b>, es tuyo. Son problemas distintos con
        soluciones opuestas, y sin categorizar no se distinguen: al mes nadie se acuerda de por qué
        no salió.
      </P>
    </>
  )

  if (tema === 'Cerrar la semana') return (
    <>
      <P>
        Cerrar <b>congela el veredicto</b>: el PPC de esa semana deja de recalcularse y pasa a ser
        historia. Es lo que permite comparar semana contra semana — un indicador que se sigue
        moviendo hacia atrás no es una serie, es una opinión.
      </P>
      <Tabla cab={['Estado', 'Qué significa']} filas={[
        [<b>Vigente</b>, <>El PPC se calcula con el plan de <b>hoy</b>: todavía puede cambiar solo.</>],
        [<b>Comprometido</b>, <>El denominador está congelado. Reprogramar ya no lo mueve.</>],
        [<b>Cerrada</b>, <>El veredicto está congelado. No se recalcula.</>],
      ]} />
      <P>
        Todo esto queda en una <b>bitácora</b> —quién comprometió, quién cerró, cuándo, con cuánto
        metrado—, y es de solo lectura: los cuatro actos que pueden mover un indicador ya publicado
        dejan rastro. Si reabres una semana y el PPC cambia, ahí queda dicho.
      </P>
      <H>Antes de cerrar</H>
      <P>
        Repasa que no queden <b>no cumplidas sin categoría</b> ni <b>sin explicación escrita</b>: son
        los dos avisos ámbar de arriba. Después de cerrar se puede corregir, pero ya con un reabrir
        de por medio que queda anotado.
      </P>
    </>
  )
}

export default function AyudaPPC({ onCerrar }: { onCerrar: () => void }) {
  const [tema, setTema] = useState<Tema>('Qué mide esta pantalla')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()}
        className="bg-k-surface border border-k-border rounded-xl shadow-2xl w-full max-w-4xl
                   max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-k-border flex-shrink-0">
          <p className="text-sm font-bold text-k-text">Cómo se lee el PPC</p>
          <span className="text-[11px] text-k-text3">— confiabilidad de la promesa y trabajo no planificado</span>
          <button onClick={onCerrar} className="ml-auto text-k-text3 hover:text-k-text">✕</button>
        </div>
        <div className="flex-1 flex min-h-0">
          <nav className="w-52 flex-shrink-0 border-r border-k-border py-2 overflow-y-auto">
            {TEMAS.map(t => (
              <button key={t} onClick={() => setTema(t)}
                className={`w-full text-left text-[12px] px-3 py-2 border-l-2 ${
                  tema === t
                    ? 'border-k-amber bg-k-amber/10 text-k-amber font-bold'
                    : 'border-transparent text-k-text2 hover:bg-k-raised'}`}>
                {t}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <Contenido tema={tema} />
          </div>
        </div>
      </div>
    </div>
  )
}
