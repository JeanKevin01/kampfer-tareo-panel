import GuiaFases from './pages/GuiaFases'
import Bitacora from '@/pages/Bitacora'
import EdicionDatos from '@/pages/EdicionDatos'
import ImpresionQR from '@/pages/ImpresionQR'
import ImportarPersonal from '@/pages/ImportarPersonal'
import GenerarRDC from '@/pages/GenerarRDC'
import ValorGanado from '@/pages/ValorGanado'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Presupuesto from '@/pages/Presupuesto'
import ResultadoOperativo from '@/pages/ResultadoOperativo'
import Costos from '@/pages/Costos'
import Valorizacion from '@/pages/Valorizacion'
import Supervisores from '@/pages/Supervisores'
import Trabajadores from '@/pages/Trabajadores'
import OTMs from '@/pages/OTMs'
import QRs from '@/pages/QRs'
import RegistrosHH from '@/pages/RegistrosHH'
import Reportes from '@/pages/Reportes'
import Monitor from '@/pages/Monitor'
import Login from '@/pages/Login'
import Usuarios from '@/pages/Usuarios'
import Programacion from '@/pages/Programacion'
import ProgramacionPrint from '@/pages/ProgramacionPrint'
import LookaheadPrint from '@/pages/LookaheadPrint'
import ReportePartidaPrint from '@/pages/ReportePartidaPrint'
import MatrizHistorica from '@/pages/MatrizHistorica'
import { currentUser } from '@/lib/auth'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  // Compuerta de sesión: sin token válido → pantalla de login.
  if (!currentUser()) {
    return (
      <QueryClientProvider client={qc}>
        <Login />
      </QueryClientProvider>
    )
  }
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          {/* Fuera del Layout: vistas imprimibles (fondo blanco, sin sidebar) */}
          <Route path="/programacion/imprimir" element={<ProgramacionPrint />} />
          <Route path="/programacion/lookahead-imprimir" element={<LookaheadPrint />} />
          <Route path="/programacion/reporte-partida" element={<ReportePartidaPrint />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="programacion" element={<Programacion />} />
            <Route path="supervisores" element={<Supervisores />} />
            <Route path="trabajadores" element={<Trabajadores />} />
            <Route path="importar"     element={<ImportarPersonal />} />
            <Route path="qrs"          element={<QRs />} />
            <Route path="impresion-qr" element={<ImpresionQR />} />
            <Route path="registros"    element={<RegistrosHH />} />
            <Route path="matriz"       element={<MatrizHistorica />} />
            <Route path="reportes"     element={<Reportes />} />
            <Route path="monitor-tareo" element={<Navigate to="/monitor" replace />} />
            <Route path="otms"         element={<OTMs />} />
            <Route path="rdc"          element={<GenerarRDC />} />
            <Route path="valor-ganado" element={<ValorGanado />} />
            <Route path="presupuesto"  element={<Presupuesto />} />
            <Route path="guia-fases"   element={<GuiaFases />} />
            <Route path="inventario"   element={<Costos />} />
            <Route path="valorizacion" element={<Valorizacion />} />
            <Route path="rentabilidad" element={<ResultadoOperativo />} />
            <Route path="edicion"      element={<EdicionDatos />} />
            <Route path="monitor"      element={<Monitor />} />
            <Route path="bitacora"     element={<Bitacora />} />
            <Route path="usuarios"     element={<Usuarios />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}