import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'

type ConnectionStatus = 'checking' | 'connected' | 'error'

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking')
  const { theme, sidebarCollapsed, toggleSidebar } = useUIStore()

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('user_settings').select('id').limit(1)
        if (error) throw error
        setConnectionStatus('connected')
      } catch {
        setConnectionStatus('error')
      }
    }
    checkConnection()
  }, [])

  return (
    <div className={`min-h-screen bg-background text-text ${theme}`}>
      <header className="p-4 border-b border-surface">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">VAT Declaration Manager</h1>
          <div className="flex items-center gap-4">
            <span
              className={`text-sm ${
                connectionStatus === 'connected'
                  ? 'text-primary'
                  : connectionStatus === 'error'
                    ? 'text-red-500'
                    : 'text-text-muted'
              }`}
            >
              Supabase: {connectionStatus}
            </span>
            <button
              onClick={toggleSidebar}
              className="px-3 py-1 text-sm bg-surface rounded hover:bg-primary/10 transition-colors"
            >
              {sidebarCollapsed ? 'Expand' : 'Collapse'} Sidebar
            </button>
          </div>
        </div>
      </header>
      <main className="p-4">
        <p className="text-text-muted">
          Foundation complete. Ready for Phase 2: Authentication.
        </p>
      </main>
    </div>
  )
}

export default App
