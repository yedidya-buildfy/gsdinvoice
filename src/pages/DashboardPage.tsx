import { useEffect, useState } from 'react'
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

type ConnectionStatus = 'checking' | 'connected' | 'error'

export function DashboardPage() {
  const { user, signOut } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking')
  const [loggingOut, setLoggingOut] = useState(false)

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

  const handleSignOut = async () => {
    setLoggingOut(true)
    await signOut()
    // Navigation happens automatically via AuthContext state change
  }

  return (
    <div className="min-h-screen bg-background">
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
            <span className="text-sm text-text-secondary">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              disabled={loggingOut}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface rounded-lg hover:bg-surface/80 transition-colors disabled:opacity-50"
            >
              <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="p-4">
        <div className="bg-surface rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text mb-4">Dashboard</h2>
          <p className="text-text-secondary">
            Welcome to VAT Declaration Manager. Your authentication is complete.
          </p>
        </div>
      </main>
    </div>
  )
}
