// ── Ayuda del LookAhead ───────────────────────────────────────
// Encargo de Jean: los 5 párrafos que vivían al pie de la cuadrícula le
// robaban pantalla al «Excel». Aquí caben enteros —y con más detalle— sin
// costar ni una fila: se abren con el botón «?» de la barra superior.
// Organizada por temas, no por orden de aparición: el planner entra a
// resolver UNA duda concreta.
import { useState } from 'react'

const TEMAS = [
  'Leer la cuadrícula',
  'Programar y avanzar',
  'Editar sin abrir nada',
  'Vincular actividades',
  'Dock de dependencias',
  'Encontrar entre muchas',
  'A dónde va este dato',
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
const Cod = ({ children }: { children: React.ReactNode }) => (
  <code className="font-mono text-k-blue bg-k-void border border-k-border rounded px-1">{children}</code>
)
const Cel = ({ clase, estilo, children }: {
  clase: string; estilo?: React.CSSProperties; children: React.ReactNode
}) => (
  <span style={estilo}
    className={`inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${clase}`}>{children}</span>
)

function Contenido({ tema }: { tema: Tema }) {
  if (tema === 'Leer la cuadrícula') return (
    <>
      <P>
        Cada fila es una <b>actividad</b>: un trabajo con fechas, un metrado comprometido y un
        responsable. Las columnas de la derecha son los <b>días</b> de las semanas que estés viendo.
        Una misma partida puede tener varias actividades (sus etapas): se agrupan bajo una cabecera
        de color.
      </P>
      <P>
        Los días seguidos de una actividad se dibujan como <b>una barra</b>: dónde empieza, dónde
        termina y cuánto dura se ve sin leer los números. La barra se corta en los días que no se
        trabajan — la <b>banda gris</b> de domingos y feriados, y los saltos ∅ de esa actividad.
        La <b className="text-k-green">línea verde vertical</b> es <b>hoy</b>: a su izquierda está
        lo que ya pasó, a su derecha lo que viene.
      </P>
      <H>Dos formas de ver una fila</H>
      <Tabla cab={['Estado', 'Cómo se ve']} filas={[
        [<b>En curso o pendiente</b>,
          <>Una casilla por día con su metrado, editable. Es la superficie de trabajo: aquí se
            programa y se anota el avance.</>],
        [<b className="text-k-green">Cumplida</b>,
          <>Se resume en <b>una sola barra verde con el total</b> (<b>✓ 120 m³</b>): ya es historia y
            no hace falta el detalle. Clic en la barra —o en el <b className="text-k-green">⊞</b> del
            nombre— para abrirla y corregir un día.</>],
        [<b>Vencida sin cumplirse</b>,
          <>Se queda en <b>detalle día a día</b> a propósito: es justo donde quieres ver qué días
            fallaron.</>],
      ]} />
      <H>El color de una celda</H>
      <Tabla cab={['Celda', 'Qué significa']} filas={[
        [<Cel clase="border-transparent bg-k-plan-solido text-white">120</Cel>,
          <>PROGRAMADO. Es la <b>línea base</b>: el metrado meta repartido entre los días laborables
            del rango, saltando feriados, domingos y saltos ∅.</>],
        [<Cel clase="border-transparent bg-k-green-solido text-white">140 ✓</Cel>,
          <>Avance real <b>mayor</b> que lo programado ese día.</>],
        [<Cel clase="border-transparent bg-k-alerta-solido text-white">120 ✓</Cel>,
          <>Avance real <b>igual</b> a lo programado.</>],
        [<Cel clase="border-transparent bg-k-red-solido text-white">80 ✓</Cel>,
          <>Avance real <b>menor</b>: ese día se quedó corto.</>],
        [<Cel clase="border-k-border bg-k-border text-k-text2">gris</Cel>,
          <>Día no laborable: domingo, feriado del calendario del proyecto. La banda baja por toda
            la columna, así la semana se lee como semana.</>],
        [<Cel clase="border-k-border text-k-text3">∅</Cel>,
          <>Salto intencional de esa actividad (paro programado). No se le reparte metrado.</>],
        [<Cel clase="border-transparent bg-k-plan-solido text-white"
          estilo={{ backgroundImage: 'repeating-linear-gradient(45deg, rgb(255 255 255 / .30) 0 3px, transparent 3px 7px)' }}>◐ 20.8</Cel>,
          <><b>Medio día</b>: el rayado diagonal lo distingue de un día entero. Pesa <b>0.5</b> al
            repartir el metrado, así que le toca la mitad que a sus vecinos.</>],
        [<Cel clase="border-k-border text-k-text3">✎</Cel>,
          <>Celda <b>manual</b>: la escribiste tú y queda protegida de los re-prorrateos.</>],
      ]} />
      <H>El punto de color del nombre</H>
      <P>
        Es el estado: <b className="text-k-plan">azul</b> programado · <b className="text-k-green">verde</b> ejecutado
        · <b className="text-k-red">rojo</b> no cumplida (con su causa debajo) · <b>gris</b> cancelada.
        El ámbar ya no aparece en los datos: quedó reservado para los <b>botones de acción</b>, así
        que si algo está en ámbar es porque se puede pulsar.
        El <b className="text-k-red">🔴</b> al lado del
        título marca las que hay que revisar: con metrado pero <b>sin partida</b> (no se puede anotar
        su avance y el PPC las castiga), o con la partida <b>sin HH presupuestadas</b>.
        El <b className="text-k-red">⛔</b> cuenta las restricciones sin liberar.
      </P>
    </>
  )

  if (tema === 'Programar y avanzar') return (
    <>
      <H>1 · Programar</H>
      <P>
        Programar es decir <b>qué metrado</b> se hace <b>entre qué fechas</b>. El sistema reparte solo
        ese metrado entre los días hábiles del rango — no hay que llenar día por día. Ese reparto es
        la <b>línea base</b> contra la que después se compara todo.
      </P>
      <P>
        Para varias partidas de golpe usa <b>Programar por partidas</b> en la cabecera: eliges el
        proyecto, marcas partidas del árbol y pones fechas y metrado a cada una. El metrado viene ya
        propuesto desde el presupuesto.
      </P>
      <H>2 · Anotar el avance del día</H>
      <P>
        Escribe encima de la celda del día (hasta hoy). Queda registrada con <b>✓</b> y el color te
        dice cómo fuiste contra lo programado. Los días <b>anteriores no se tocan</b>, y el
        <b> saldo se re-prorratea en los días que faltan</b> para llegar al meta en la F.Fin.
        Vaciar la celda borra ese avance.
      </P>
      <H>3 · Replanificar un día futuro</H>
      <P>
        Escribir en un día <b>posterior a hoy</b> no registra avance: <b>replanifica</b>. Esa celda
        queda manual (<b>✎</b>) y protegida, y el resto del plan se acomoda solo alrededor. Vaciarla
        la devuelve al prorrateo automático.
      </P>
      <P>
        <b>El meta no cambia por replanificar.</b> El total comprometido solo se cambia en el campo
        METRADO de la actividad.
      </P>
    </>
  )

  if (tema === 'Editar sin abrir nada') return (
    <>
      <P>
        <b>Doble clic</b> sobre METRADO, PLAZO, F.Inic, F.Fin o DESPUÉS DE y escribe. Enter guarda,
        Esc cancela. No hace falta abrir la actividad para lo del día a día.
      </P>
      <Tabla cab={['Campo', 'Qué hace al cambiarlo']} filas={[
        ['METRADO', <>Cambia el meta de la actividad y vuelve a repartir los días pendientes.</>],
        ['PLAZO', <>Duración en <b>días hábiles</b> (medio día = <b>0.5</b>, un salto ∅ = 0). Al
          escribirlo se <b>recalcula la F.Fin</b> conservando el inicio.</>],
        ['F. Inic', <>La barra se <b>desplaza sin estirarse</b>: conserva el plazo.</>],
        ['F. Fin', <>Recalcula el plazo.</>],
        ['DESPUÉS DE', <>Las antecesoras, con la sintaxis de Project (ver «Vincular actividades»).</>],
      ]} />
      <H>Fijar columnas</H>
      <P>
        Con el scroll en una semana lejana se pierde de vista qué fila estás leyendo. La <b>#</b> y
        <b> ACTIVIDADES</b> están siempre congeladas; el botón <b>⇥ Fijar columnas</b> congela además
        <b> DESPUÉS DE</b>, que se pega detrás de ACTIVIDADES mientras las intermedias pasan por
        debajo. Con eso ves, en cualquier semana, <b>qué es</b> la actividad y <b>de qué depende</b>.
      </P>
      <H>Otros atajos de la cabecera</H>
      <P>
        <b>☰ Compacto</b> deja cada fila en una línea (el código de partida y la etapa pasan al
        tooltip) y cabe el doble. <b>⊟ Contraer todo</b> compacta las partidas por etapas y pliega los
        proyectos. <b>Exportar PDF</b> abre la vista de impresión en A3 apaisado.
      </P>
    </>
  )

  if (tema === 'Vincular actividades') return (
    <>
      <P>
        Vincular es decir <b>qué va después de qué</b>. Sirve para que al mover una actividad se
        muevan solas las que dependen de ella, en vez de corregirlas a mano una por una.
      </P>
      <H>Tres formas, de la más rápida a la más visual</H>
      <Tabla cab={['Forma', 'Cómo']} filas={[
        [<b>Escribir</b>, <>En la columna <b>DESPUÉS DE</b> (o en la barra del dock), con el
          <b> #</b> de la primera columna. Es la más rápida y admite varias.</>],
        [<b>Marcar y encadenar</b>, <>Clic en el <b>#</b> de varias filas (queda el orden 1º, 2º, 3º…)
          y pulsa <b>⛓ FS</b>, <b>SS</b> o <b>FF</b>. O el botón <b>⛓ Encadenar las N etapas</b> de la
          cabecera de una partida.</>],
        [<b>🔗 Vincular</b>, <>Dos clics: primero la que va PRIMERO, después la que sigue. Los clics
          siguientes van encadenando. Esc sale.</>],
      ]} />
      <H>La sintaxis (la misma de Project)</H>
      <Tabla cab={['Escribes', 'Significa']} filas={[
        [<Cod>12</Cod>, <>Empieza cuando <b>termina</b> la #12. Es lo normal (FS con 0 de espera).</>],
        [<Cod>12FS+2</Cod>, <>2 días hábiles <b>después</b> de que termine la #12.</>],
        [<Cod>12SS</Cod>, <>Arranca <b>cuando arranca</b> la #12 (van juntas).</>],
        [<Cod>12SS+1</Cod>, <>Arranca 1 día después de que arranque la #12: «el encofrado entra un día
          después de que empiece el habilitado».</>],
        [<Cod>12FF-1</Cod>, <>No puede <b>terminar</b> antes que la #12 (con 1 día de traslape).</>],
        [<Cod>8;12SS-1</Cod>, <><b>Varias antecesoras</b>, separadas por <b>;</b> — igual que Project.</>],
        [<Cod>(vacío)</Cod>, <>Quita todos los vínculos de esa fila. Borrar solo un número quita ese.</>],
      ]} />
      <H>Los tres tipos</H>
      <Tabla cab={['Tipo', 'Regla']} filas={[
        [<b>FS</b>, <>Fin → Inicio. La sucesora arranca al <b>terminar</b> la antecesora (+lag). El clásico.</>],
        [<b>SS</b>, <>Inicio → Inicio. Arranca cuando <b>arranca</b> la antecesora (+lag). Para traslapes.</>],
        [<b>FF</b>, <>Fin → Fin. No puede <b>terminar</b> antes que la antecesora (+lag). «El curado no
          cierra antes que el vaciado».</>],
      ]} />
      <P>
        El número que sigue al tipo es el <b>lag</b>: días hábiles de espera, y <b>negativo</b> para
        traslapar. Mover una antecesora <b>empuja</b> a sus sucesoras conservando el plazo de cada una,
        y <b>nunca las adelanta</b> — si te sobra holgura, la decides tú.
      </P>
      <P>
        El sistema <b>rechaza los ciclos</b> (A después de B y B después de A) con un aviso, así que
        no puedes dejar la red en un estado imposible.
      </P>
    </>
  )

  if (tema === 'Dock de dependencias') return (
    <>
      <P>
        Se abre <b>abajo, a lo ancho</b>, para no taparte ninguna columna de días: puedes editar
        mirando las fechas. Lo abre el <b>🔗</b> del nombre, el chip de la columna DESPUÉS DE, o el
        <b className="text-k-red"> ⛓ vincular</b> rojo de las actividades que no dependen de nada.
      </P>
      <H>La franja de arriba</H>
      <P>
        Todo lo que define la actividad, en una línea y editable: <b>metrado</b>, <b>F.Inicio</b>,
        <b> F.Fin</b>, <b>plazo</b>, el <b>supervisor a cargo</b> (elegido del padrón — al asignarlo,
        la actividad le aparece en la agenda de su teléfono) y <b>DESPUÉS DE</b> con la sintaxis de
        Project. Enter o salir del campo guarda; el sistema re-prorratea y corre la cascada.
      </P>
      <P>
        Debajo del nombre se lee de qué <b>partida</b> es y, si programa una etapa, cuál:
        <b className="text-k-wbs"> ◆ Transporte (20%)</b>. Con varias etapas de la misma
        partida en pantalla, es lo único que las distingue.
      </P>
      <H>Los días del rango</H>
      <P>
        La segunda franja lista los días entre F.Inicio y F.Fin. <b>Clic en un día</b> lo cicla:
        se trabaja → <b className="text-k-red">∅ salto</b> (no se trabaja, pesa 0) →
        <b className="text-sky-300"> ◐ medio día</b> (pesa 0.5) → se trabaja. Los días grises son
        los no laborables del calendario del proyecto: ya estaban fuera del reparto.
      </P>
      <P>
        <b>Ojo con lo que hace un salto:</b> no recorta el trabajo. Conserva el <b>plazo</b> en días
        hábiles y <b>corre la F.Fin</b> — un paro de un día empuja el fin un día, y por eso aparece
        un chip nuevo al final. El metrado total no se pierde nunca; se reparte entre los días que
        quedan, sin tocar los ya avanzados. Y si mueves las sucesoras, la cascada las empuja sola.
      </P>
      <H>El grafo</H>
      <P>
        Se lee de izquierda a derecha como una red: <b className="text-k-blue">antecesoras</b> →
        actividad en foco → <b className="text-green-400">sucesoras</b>. Sube y baja por la cadena
        mientras haya un solo vínculo; donde hay varias, se muestran en paralelo.
        <b> Clic en cualquier tarjeta</b> la trae a la franja de arriba, y editas esa sin cerrar nada.
      </P>
      <P>
        En la cuadrícula, la cadena de la actividad en foco queda pintada (antecesoras en azul,
        sucesoras en verde) pero <b>el resto de filas no se atenúa</b>: así se ven igual de claras
        las que todavía no tienen ningún vínculo, que suelen ser las que quieres atar.
      </P>
      <P>
        <b>⌄ Solo datos</b> pliega el grafo y deja la franja: es el modo para programar rápido
        viendo casi toda la cuadrícula.
      </P>
    </>
  )

  if (tema === 'Encontrar entre muchas') return (
    <>
      <P>
        Con 100 partidas la cuadrícula deja de ser navegable a ojo. Todo lo de abajo filtra en el
        acto, sobre lo que ya está cargado.
      </P>
      <Tabla cab={['Herramienta', 'Qué filtra']} filas={[
        [<b>Buscador</b>, <>Título, código o descripción de la partida, etapa, responsable o
          <b> #</b>. Ignora tildes: «liberacion» encuentra «Liberación». Escribe <Cod>#48</Cod> para
          saltar a una actividad concreta.</>],
        [<b>Responsable</b>, <>Solo las de un supervisor.</>],
        [<b>Estado</b>, <>Programado, ejecutado, no cumplida, cancelado.</>],
        [<b>⛔ Con restricción</b>, <>Las que todavía tienen restricciones sin liberar.</>],
        [<b>🔴 Por revisar</b>, <>Las que están mal formadas: con metrado pero sin partida, o con la
          partida sin HH cargadas.</>],
      ]} />
      <P>
        <b>Ojo:</b> el LookAhead solo trae las actividades que <b>cruzan las semanas visibles</b>, así
        que mover la ventana de fechas también acota. Si buscas una y no aparece, amplía a 6 semanas
        o retrocede.
      </P>
      <H>Partidas por etapas</H>
      <P>
        Una partida desplegada en varias etapas se agrupa bajo una cabecera con su <b>color de
        cadena</b>. Clic en la cabecera para <b>compactarla en una sola fila</b> (suma el programado y
        el real de todas sus etapas, solo lectura), y clic de nuevo para desplegarla y editar.
      </P>
    </>
  )

  return (
    <>
      <P>
        Lo que llenas aquí no se queda aquí. Es el mismo dato que leen los otros módulos — por eso no
        hay que anotar nada dos veces.
      </P>
      <Tabla cab={['Lo que escribes', 'A dónde llega']} filas={[
        [<b>Avance real del día</b>, <>Al <b>avance diario de Valor Ganado</b> de esa partida (y de esa
          etapa, si la actividad programa un hito). Es <b>un solo dato</b>: cambiarlo en cualquiera de
          los dos sitios lo cambia en ambos, y de ahí salen el % de avance, las HH ganadas, el PF y el
          ISP.</>],
        [<b>Metrado programado</b>, <>Al <b>comprometido de la semana</b> del PPC. Si no programas
          celdas, esa actividad no cuenta como compromiso.</>],
        [<b>Cumplimiento</b>, <>Se calcula solo: <b>SI</b> apenas el real alcanza al comprometido
          (aunque sea antes), <b>NO</b> recién con la semana cerrada. Marcar «No cumplida» con causa
          manda, y esa causa alimenta el <b>Pareto de causas</b>.</>],
        [<b>Supervisor a cargo</b>, <>A la <b>agenda de la app de campo</b> de esa persona: ve la
          actividad del día, la tarea y reporta.</>],
      ]} />
      <P>
        Por eso el <b className="text-k-red">🔴</b> importa: una actividad con metrado pero sin partida
        no tiene dónde descargar el avance — se programa, se ejecuta, y el valor ganado no se entera.
      </P>
    </>
  )
}

export default function AyudaLookahead({ onCerrar }: { onCerrar: () => void }) {
  const [tema, setTema] = useState<Tema>('Leer la cuadrícula')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()}
        className="bg-k-surface border border-k-border rounded-xl shadow-2xl w-full max-w-4xl
                   max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-k-border flex-shrink-0">
          <p className="text-sm font-bold text-k-text">Cómo se usa el LookAhead</p>
          <span className="text-[11px] text-k-text3">— programación semanal tipo Last Planner</span>
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
