import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="min-h-screen pl-16 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  )
}
