import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ── Un fallo del API no es una lista vacía ──────────────────────────────────
// Auditoría 2026-08-06: rellenar `data` con un valor por defecto era el patrón
// habitual del panel. Ese relleno borra la diferencia entre «está vacío» y «no
// pude leerlo», y la UI acababa afirmando cosas falsas: «Sin conflictos
// pendientes ✓» con el endpoint en 403, «registra avances semanales primero»
// con el endpoint en 500 y los avances ya registrados, o «S/ 0» de margen en la
// pantalla que mira gerencia. Un endpoint (/ev/curva-fase) estuvo caído semanas
// sin que nadie lo notara.
//
// El panel NO tiene runner de tests (D12 del plan), así que el lint es la única
// red capaz de impedir que el patrón vuelva. Es bloqueante en CI.
//
// Alternativa correcta: <EstadoQuery> de components/ui, que obliga a resolver
// los CUATRO estados (cargando · error · precondición · vacío/datos).
//
// El patrón tiene DOS formas y hacen falta las dos reglas. La 1ª ronda solo
// escribió la primera y por eso `Programacion.tsx` —el archivo más grande del
// panel, con 38 infracciones y un «✓ Todas las partidas están ubicadas» que se
// pinta con la consulta caída— no aparecía por ningún lado.
const DEFAULT_EN_DATA = {
  // `const { data: filas = [] } = useQuery(...)`
  selector: "VariableDeclarator[init.callee.name='useQuery'] > ObjectPattern > Property[key.name='data'] > AssignmentPattern",
  message: 'No pongas un valor por defecto en `data` de useQuery: convierte un fallo del API en «no hay datos» y la pantalla acaba afirmando algo falso. Usa <EstadoQuery> (components/ui) o mira q.isError.',
}
const RELLENO_TRAS_DATA = {
  // `q.data ?? []`
  selector: "LogicalExpression[operator='??'][left.property.name='data']",
  message: 'No rellenes `q.data` con `?? []`: un 403 o un 500 pasa a leerse como «no hay nada» y la pantalla afirma algo que no comprobó. Usa <EstadoQuery> (components/ui) o mira q.isError antes.',
}
const RELLENO_TRAS_CAMPO = {
  // `q.data?.filas ?? []`
  selector: "LogicalExpression[operator='??'] > ChainExpression > MemberExpression[object.property.name='data']",
  message: 'No rellenes `q.data?.campo` con `?? []`: un 403 o un 500 pasa a leerse como «no hay nada» y la pantalla afirma algo que no comprobó. Usa <EstadoQuery> (components/ui) o mira q.isError antes.',
}
const REGLAS_DATA = [DEFAULT_EN_DATA, RELLENO_TRAS_DATA, RELLENO_TRAS_CAMPO]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...REGLAS_DATA],
    },
  },
  // ── TRINQUETE ────────────────────────────────────────────────────────────
  // Las tres reglas nacen con ~142 infracciones heredadas repartidas en estos
  // archivos. Arreglarlas todas de golpe sería un refactor de medio panel justo
  // antes del piloto, y el plan es explícito en que eso no se hace ahora.
  //
  // Así que las reglas son ERROR en todo el proyecto —ningún archivo nuevo ni
  // ninguna página nueva puede volver a introducir el patrón— y AVISO solo en
  // esta lista, que es la deuda pendiente. La lista solo puede ENCOGER: cuando
  // una página se migra a <EstadoQuery>, se borra de aquí. El día que quede
  // vacía, se borra este bloque entero.
  //
  // ⚠ Esta lista es la MEDIDA de la deuda, así que tiene que ser completa. La
  // 1ª ronda listaba 17 archivos y parecía que ese era todo el problema; eran
  // 17 archivos de UNA de las tres formas. Al añadir una regla nueva, medir
  // primero y meter aquí TODO lo que salga, aunque duela el número.
  //
  // Es el mismo trinquete que ya funcionó con el lint del panel (43 errores
  // heredados → 0 y bloqueante en la Fase S).
  {
    files: [
      'src/components/CalendarioLaboral.tsx',
      'src/components/Fiabilidad.tsx',
      'src/components/HistogramaMO.tsx',
      'src/components/HistogramaPersonal.tsx',
      'src/components/HistorialSemana.tsx',
      'src/components/HojaSemanal.tsx',
      'src/components/LookaheadGrid.tsx',
      'src/components/ProgramarLote.tsx',
      'src/components/maestros/AltaPartidasLote.tsx',
      'src/components/maestros/CostosMaestro.tsx',
      'src/pages/Bitacora.tsx',
      'src/pages/Costos.tsx',
      'src/pages/Dashboard.tsx',
      'src/pages/EdicionDatos.tsx',
      'src/pages/GenerarRDC.tsx',
      'src/pages/GuiaFases.tsx',
      'src/pages/ImportarPartidas.tsx',
      'src/pages/ImportarPersonal.tsx',
      'src/pages/MatrizHistorica.tsx',
      'src/pages/Monitor.tsx',
      'src/pages/OTMs.tsx',
      'src/pages/PpcCliente.tsx',
      'src/pages/PpcPrint.tsx',
      'src/pages/Presupuesto.tsx',
      'src/pages/Programacion.tsx',
      'src/pages/QRs.tsx',
      'src/pages/RegistrosHH.tsx',
      'src/pages/Reportes.tsx',
      'src/pages/ResultadoOperativo.tsx',
      'src/pages/Supervisores.tsx',
      'src/pages/TabISP.tsx',
      'src/pages/Trabajadores.tsx',
      'src/pages/Usuarios.tsx',
      'src/pages/ValorGanado.tsx',
      'src/pages/Valorizacion.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['warn', ...REGLAS_DATA],
    },
  },
])
