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
            <Route path="trabajadores" element={<Placeholder title="Trabajadores" desc="Gestión completa del personal activo e inactivo." icon="👷" />} />
            <Route path="importar" element={<Placeholder title="Importar Personal" desc="Carga masiva de trabajadores desde Excel." icon="📥" />} />
            <Route path="qrs" element={<Placeholder title="QRs" desc="Galería de códigos QR por trabajador." icon="📷" />} />
            <Route path="impresion-qr" element={<Placeholder title="Impresión QR Avanzada" desc="PDF paginado listo para imprimir en obra." icon="🖨️" />} />
            <Route path="registros" element={<Placeholder title="Registros y HH" desc="Ver, filtrar, editar y exportar el tareo diario." icon="📋" />} />
            <Route path="reportes" element={<Placeholder title="Reportes y Analytics" desc="Gráficos de HH por OTM, supervisor y semana." icon="📊" />} />
            <Route path="otms" element={<Placeholder title="OTMs" desc="Gestión de órdenes de trabajo misceláneas." icon="📝" />} />
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