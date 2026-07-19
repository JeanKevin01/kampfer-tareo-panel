import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, UserCheck, Users, Upload, QrCode, Printer,
  Table2, BarChart3, ClipboardList, FileSpreadsheet, Package, CalendarDays, Grid3X3,
  Receipt, TrendingUp, PenLine, Activity, History, ChevronRight, Target,
  FileText, LogOut, ShieldCheck, PanelLeftClose, PanelLeft,
  type LucideIcon,
} from 'lucide-react'
import { currentUser, logout } from '@/lib/auth'

interface NavItem  { path: string; label: string; icon: LucideIcon; adminOnly?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Operaciones',
    items: [
      { path: '/dashboard',    label: 'Dashboard',      icon: LayoutDashboard },
      { path: '/programacion', label: 'Programación',   icon: CalendarDays },
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
      { path: '/matriz',       label: 'Matriz histórica', icon: Grid3X3 },
      { path: '/reportes',     label: 'Analytics',      icon: BarChart3 },
    ],
  },
  {
    label: 'Control',
    items: [
      { path: '/otms',         label: 'Proyectos',           icon: ClipboardList },
      { path: '/rdc',          label: 'Generar RDC',    icon: FileText },
      { path: '/valor-ganado', label: 'Valor Ganado',   icon: Target },
      { path: '/presupuesto',  label: 'Presupuesto',    icon: FileSpreadsheet },
      { path: '/guia-fases',   label: 'Guía de Fases',  icon: FileText },
      { path: '/inventario',   label: 'Costos',         icon: Package },
      { path: '/valorizacion', label: 'Valorización',   icon: Receipt },
      { path: '/rentabilidad', label: 'Resultado Op.',  icon: TrendingUp },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { path: '/edicion',      label: 'Edición Datos',  icon: PenLine },
      { path: '/monitor',      label: 'Monitor', icon: Activity },
      { path: '/bitacora',     label: 'Bitácora',       icon: History },
      { path: '/usuarios',     label: 'Usuarios',       icon: ShieldCheck, adminOnly: true },
    ],
  },
]

export default function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const esAdmin = currentUser()?.rol === 'admin'
  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-k-void border-r border-k-border flex flex-col flex-shrink-0 transition-[width] duration-200`}>

      {/* Logo + botón de colapsar/expandir */}
      <div className={`h-16 flex items-center gap-2 border-b border-k-border flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-condensed font-extrabold text-xl text-k-amber tracking-[.2em] leading-none">
              KAMPFER
            </div>
            <div className="text-[9px] text-k-text3 tracking-widest uppercase mt-1">
              Panel de control
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir barra' : 'Colapsar barra'}
          className="text-k-text3 hover:text-k-text hover:bg-k-raised rounded-lg p-1.5 transition-colors flex-shrink-0"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {NAV.map((group, gi) => (
          <div key={group.label} className="mb-4">
            {collapsed
              ? gi > 0 && <div className="h-px bg-k-border mx-2 mb-3" />
              : (
                <p className="text-[9px] font-bold text-k-text3 uppercase tracking-[.15em] px-3 mb-1">
                  {group.label}
                </p>
              )}
            {group.items.filter((item) => !item.adminOnly || esAdmin).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 ${collapsed ? 'justify-center px-0' : 'px-3'} py-2 rounded-lg mb-0.5 text-[13px] font-medium transition-all duration-100 group ` +
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
                    {!collapsed && <span className="flex-1 leading-none">{item.label}</span>}
                    {!collapsed && isActive && <ChevronRight size={11} className="text-k-amber/60" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Usuario + cerrar sesión */}
      <div className={`border-t border-k-border flex-shrink-0 ${collapsed ? 'px-2 py-2.5 flex flex-col items-center gap-2' : 'px-3 py-2.5'}`}>
        {collapsed ? (
          <>
            <div
              className="w-7 h-7 rounded-full bg-amber-500/15 text-k-amber flex items-center justify-center text-[11px] font-bold"
              title={currentUser()?.nombre || currentUser()?.username || ''}
            >
              {(currentUser()?.nombre || currentUser()?.username || '?').charAt(0).toUpperCase()}
            </div>
            <button onClick={logout} title="Cerrar sesión"
              className="text-k-text3 hover:text-k-red transition-colors p-1.5 rounded-lg hover:bg-k-raised">
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-500/15 text-k-amber flex items-center justify-center text-[11px] font-bold flex-shrink-0">
              {(currentUser()?.nombre || currentUser()?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-k-text truncate">{currentUser()?.nombre || currentUser()?.username}</div>
              <div className="text-[9px] text-k-text3 uppercase tracking-wider">{currentUser()?.rol}</div>
            </div>
            <button onClick={logout} title="Cerrar sesión"
              className="text-k-text3 hover:text-k-red transition-colors p-1.5 rounded-lg hover:bg-k-raised">
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`h-11 border-t border-k-border flex items-center flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        {!collapsed && <span className="text-[9px] text-k-text3 tracking-wider">v1.0 · 2026</span>}
        <div className={`flex items-center gap-1.5 ${collapsed ? '' : 'ml-auto'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-k-green animate-pulse" />
          {!collapsed && <span className="text-[9px] text-k-text3">Live</span>}
        </div>
      </div>
    </aside>
  )
}
