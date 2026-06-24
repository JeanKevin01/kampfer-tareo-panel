import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  // Colapso de la barra lateral (persistente entre sesiones)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('kp_sidebar_collapsed') === '1'
  )
  useEffect(() => {
    localStorage.setItem('kp_sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex h-screen bg-k-void overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
