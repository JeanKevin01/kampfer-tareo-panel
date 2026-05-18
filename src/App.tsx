import QRs from '@/pages/QRs'
import RegistrosHH from '@/pages/RegistrosHH'
import OTMs from '@/pages/OTMs'
import Trabajadores from '@/pages/Trabajadores'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Placeholder from '@/pages/Placeholder'

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
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="supervisores" element={<Placeholder title="Supervisores" desc="Gestión y seguimiento de supervisores de campo." icon="🦺" />} />
            <Route path="trabajadores" element={<Trabajadores />} />
            <Route path="importar" element={<Placeholder title="Importar Personal" desc="Carga masiva de trabajadores desde Excel." icon="📥" />} />
            <Route path="qrs" element={<QRs />} />
            <Route path="impresion-qr" element={<Placeholder title="Impresión QR Avanzada" desc="PDF paginado listo para imprimir en obra." icon="🖨️" />} />
            <Route path="registros" element={<RegistrosHH />} />
            <Route path="reportes" element={<Placeholder title="Reportes y Analytics" desc="Gráficos de HH por OTM, supervisor y semana." icon="📊" />} />
            <Route path="otms" element={<OTMs />} />
            <Route path="presupuesto" element={<Placeholder title="Presupuesto por OTM" desc="Control de HH plan vs real por partida." icon="💰" />} />
            <Route path="inventario" element={<Placeholder title="Inventario y Materiales" desc="Registro de facturas y control de compras." icon="📦" />} />
            <Route path="valorizacion" element={<Placeholder title="Valorización" desc="Consolidado mensual para presentar a SMCV." icon="🧾" />} />
            <Route path="rentabilidad" element={<Placeholder title="Rentabilidad" desc="Margen real vs contractual por OTM." icon="📈" />} />
            <Route path="edicion" element={<Placeholder title="Edición de Datos" desc="CRUD completo de trabajadores, OTMs y supervisores." icon="✏️" />} />
            <Route path="monitor" element={<Placeholder title="Monitor del Sistema" desc="Estado de API, n8n y base de datos en tiempo real." icon="🖥️" />} />
            <Route path="bitacora" element={<Placeholder title="Bitácora" desc="Log de acciones e importaciones del panel." icon="📜" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}