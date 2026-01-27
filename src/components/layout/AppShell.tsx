import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { useUIStore } from '@/stores/uiStore'

export function AppShell() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={`min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'ps-16' : 'ps-64'
        }`}
      >
        <Outlet />
      </main>
    </div>
  )
}
