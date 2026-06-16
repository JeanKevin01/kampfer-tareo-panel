import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, UserCheck, Users, Upload, QrCode, Printer,
  Table2, BarChart3, ClipboardList, FileSpreadsheet, Package,
  Receipt, TrendingUp, PenLine, Activity, History, ChevronRight, Target,
  FileText,
  type LucideIcon,
} from 'lucide-react'

interface NavItem  { path: string; label: string; icon: LucideIcon }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Operaciones',
    items: [
      { path: '/dashboard',    label: 'Dashboard',      icon: LayoutDashboard },
      { path: '/supervisores', label: 'Supervisores',   icon: UserCheck },
    ],
  },
  {
    label: 'Personal',
    items: [
      { path: '/trabajadores', label: 'Trabajadores',   icon: Users },
      { path: '/importar',     label: 'Importar',       icon: Upload },
      { path: '/qrs',          label: 'QRs',            icon: QrCode },
      { path: '/impresion-qr', label: 'Impresión QR',   icon: Printer },
    ],
  },
  {
    label: 'Tareo',
    items: [
      { path: '/registros',    label: 'Registros y HH', icon: Table2 },
      { path: '/reportes',     label: 'Analytics',      icon: BarChart3 },
    ],
  },
  {
    label: 'Control',
    items: [
      { path: '/otms',         label: 'OTMs',           icon: ClipboardList },
      { path: '/rdc',          label: 'Generar RDC',    icon: FileText },
      { path: '/valor-ganado', label: 'Valor Ganado',   icon: Target },
      { path: '/presupuesto',  label: 'Presupuesto',    icon: FileSpreadsheet },
      { path: '/guia-fases',   label: 'Guía de Fases',  icon: BookOpen },
      { path: '/inventario',   label: 'Inventario',     icon: Package },
      { path: '/valorizacion', label: 'Valorización',   icon: Receipt },
      { path: '/rentabilidad', label: 'Rentabilidad',   icon: TrendingUp },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { path: '/edicion',      label: 'Edición Datos',  icon: PenLine },
      { path: '/monitor',      label: 'Monitor',        icon: Activity },
      { path: '/bitacora',     label: 'Bitácora',       icon: History },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="w-60 bg-k-void border-r border-k-border flex flex-col flex-shrink-0">

      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-k-border flex-shrink-0">
        <div>
          <div className="font-condensed font-extrabold text-xl text-k-amber tracking-[.2em] leading-none">
            KAMPFER
          </div>
          <div className="text-[9px] text-k-text3 tracking-widest uppercase mt-1">
            Panel · SMCV Misc.
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="text-[9px] font-bold text-k-text3 uppercase tracking-[.15em] px-3 mb-1">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-[13px] font-medium transition-all duration-100 group ` +
                  (isActive
                    ? 'bg-amber-500/10 text-k-amber border border-amber-500/20'
                    : 'text-k-text2 hover:bg-k-raised hover:text-k-text border border-transparent')
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={15}
                      className={isActive ? 'text-k-amber' : 'text-k-text3 group-hover:text-k-text2 transition-colors'}
                    />
                    <span className="flex-1 leading-none">{item.label}</span>
                    {isActive && <ChevronRight size={11} className="text-k-amber/60" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="h-11 border-t border-k-border flex items-center px-5 flex-shrink-0">
        <span className="text-[9px] text-k-text3 tracking-wider">v1.0 · 2026</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-k-green animate-pulse" />
          <span className="text-[9px] text-k-text3">Live</span>
        </div>
      </div>
    </aside>
  )
}