import EdicionDatos from '@/pages/EdicionDatos'
import ImpresionQR from '@/pages/ImpresionQR'
import ImportarPersonal from '@/pages/ImportarPersonal'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Placeholder from '@/pages/Placeholder'
import Supervisores from '@/pages/Supervisores'
import Trabajadores from '@/pages/Trabajadores'
import OTMs from '@/pages/OTMs'
import QRs from '@/pages/QRs'
import RegistrosHH from '@/pages/RegistrosHH'
import Reportes from '@/pages/Reportes'
import Monitor from '@/pages/Monitor'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="supervisores" element={<Supervisores />} />
            <Route path="trabajadores" element={<Trabajadores />} />
            <Route path="importar"     element={<ImportarPersonal />} />
            <Route path="qrs"          element={<QRs />} />
            <Route path="impresion-qr" element={<ImpresionQR />} />
            <Route path="registros"    element={<RegistrosHH />} />
            <Route path="reportes"     element={<Reportes />} />
            <Route path="otms"         element={<OTMs />} />
            <Route path="presupuesto"  element={<Placeholder title="Presupuesto por OTM"   desc="Control de HH plan vs real por partida."               icon="💰" />} />
            <Route path="inventario"   element={<Placeholder title="Inventario y Materiales" desc="Registro de facturas y control de compras."          icon="📦" />} />
            <Route path="valorizacion" element={<Placeholder title="Valorización"           desc="Consolidado mensual para presentar a SMCV."           icon="🧾" />} />
            <Route path="rentabilidad" element={<Placeholder title="Rentabilidad"           desc="Margen real vs contractual por OTM."                  icon="📈" />} />
            <Route path="edicion" element={<EdicionDatos />} />
            <Route path="monitor"      element={<Monitor />} />
            <Route path="bitacora"     element={<Placeholder title="Bitácora"               desc="Log de acciones e importaciones del panel."           icon="📜" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}