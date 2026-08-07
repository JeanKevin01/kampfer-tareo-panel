import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ── Un fallo del API no es una lista vacía ──────────────────────────────────
// Auditoría 2026-08-06: `const { data: filas = [] } = useQuery(...)` era el
// patrón habitual del panel. Ese valor por defecto borra la diferencia entre
// «está vacío» y «no pude leerlo», y la UI acababa afirmando cosas falsas:
// «Sin conflictos pendientes ✓» con el endpoint en 403, o «registra avances
// semanales primero» con el endpoint en 500 y los avances ya registrados.
// Un endpoint (/ev/curva-fase) estuvo caído semanas sin que nadie lo notara.
//
// El panel NO tiene runner de tests (D12 del plan), así que el lint es la única
// red capaz de impedir que el patrón vuelva. Es bloqueante en CI.
//
// Alternativa correcta: <EstadoQuery> de components/ui, que obliga a resolver
// los CUATRO estados (cargando · error · precondición · vacío/datos).
const DEFAULT_EN_DATA = {
  selector: "VariableDeclarator[init.callee.name='useQuery'] > ObjectPattern > Property[key.name='data'] > AssignmentPattern",
  message: 'No pongas un valor por defecto en `data` de useQuery: convierte un fallo del API en «no hay datos» y la pantalla acaba afirmando algo falso. Usa <EstadoQuery> (components/ui) o mira q.isError.',
}

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
      'no-restricted-syntax': ['error', DEFAULT_EN_DATA],
    },
  },
  // ── TRINQUETE ────────────────────────────────────────────────────────────
  // La regla nace con 47 infracciones heredadas repartidas en estos archivos.
  // Arreglarlas todas de golpe sería un refactor de medio panel justo antes del
  // piloto, y el plan es explícito en que eso no se hace ahora.
  //
  // Así que la regla es ERROR en todo el proyecto —ningún archivo nuevo ni
  // ninguna página nueva puede volver a introducir el patrón— y AVISO solo en
  // esta lista, que es la deuda pendiente. La lista solo puede ENCOGER: cuando
  // una página se migra a <EstadoQuery>, se borra de aquí. El día que quede
  // vacía, se borra este bloque entero.
  //
  // Es el mismo trinquete que ya funcionó con el lint del panel (43 errores
  // heredados → 0 y bloqueante en la Fase S).
  {
    files: [
      'src/pages/Bitacora.tsx',
      'src/pages/Dashboard.tsx',
      'src/pages/EdicionDatos.tsx',
      'src/pages/GenerarRDC.tsx',
      'src/pages/GuiaFases.tsx',
      'src/pages/ImportarPartidas.tsx',
      'src/pages/ImportarPersonal.tsx',
      'src/pages/Monitor.tsx',
      'src/pages/OTMs.tsx',
      'src/pages/QRs.tsx',
      'src/pages/RegistrosHH.tsx',
      'src/pages/Reportes.tsx',
      'src/pages/Supervisores.tsx',
      'src/pages/TabISP.tsx',
      'src/pages/Trabajadores.tsx',
      'src/pages/Usuarios.tsx',
      'src/pages/ValorGanado.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['warn', DEFAULT_EN_DATA],
    },
  },
])
