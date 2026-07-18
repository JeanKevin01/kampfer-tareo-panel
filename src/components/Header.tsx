import { useLocation } from 'react-router-dom'
import { Bell, RefreshCw } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/supervisores': 'Supervisores',
  '/trabajadores': 'Trabajadores',
  '/importar':     'Importar Personal',
  '/qrs':          'QRs · Códigos por Trabajador',
  '/impresion-qr': 'Impresión QR Avanzada',
  '/registros':    'Registros y Horas Hombre',
  '/reportes':     'Reportes y Analytics',
  '/otms':         'Órdenes de Trabajo Misceláneas',
  '/presupuesto':  'Presupuesto por proyecto',
  '/inventario':   'Inventario y Materiales',
  '/valorizacion': 'Valorización',
  '/rentabilidad': 'Rentabilidad',
  '/edicion':      'Edición de Datos',
  '/monitor':      'Monitor del Sistema',
  '/bitacora':     'Bitácora de Actividad',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Panel Maestro'
  const fecha = new Date().toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <header className="h-16 bg-k-surface border-b border-k-border flex items-center px-6 gap-4 flex-shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="font-condensed font-bold text-[18px] text-k-text tracking-tight leading-none truncate">
          {title}
        </h1>
        <p className="text-[10px] text-k-text3 capitalize mt-0.5">{fecha}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button className="w-8 h-8 rounded-lg border border-k-border bg-k-raised flex items-center justify-center text-k-text3 hover:text-k-text transition-colors">
          <RefreshCw size={13} />
        </button>
        <button className="w-8 h-8 rounded-lg border border-k-border bg-k-raised flex items-center justify-center text-k-text3 hover:text-k-text transition-colors relative">
          <Bell size={13} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-k-amber" />
        </button>
        <div className="flex items-center gap-2 bg-k-raised border border-k-border rounded-lg px-3 h-8 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-k-green animate-pulse" />
          <span className="text-[11px] text-k-text2 font-medium">Sistema activo</span>
        </div>
      </div>
    </header>
  )
}