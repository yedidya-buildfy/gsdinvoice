import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

type ConnectionStatus = 'checking' | 'connected' | 'error'

export function DashboardPage() {
  const { user } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking')

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
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text mb-4">Dashboard</h1>
      <div className="bg-surface rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Welcome</h2>
          <span
            className={`text-sm px-2 py-1 rounded ${
              connectionStatus === 'connected'
                ? 'bg-primary/10 text-primary'
                : connectionStatus === 'error'
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-text-muted/10 text-text-muted'
            }`}
          >
            Supabase: {connectionStatus}
          </span>
        </div>
        <p className="text-text-secondary mb-2">
          Welcome to VAT Declaration Manager. Your authentication is complete.
        </p>
        {user?.email && (
          <p className="text-text-muted text-sm">
            Signed in as: {user.email}
          </p>
        )}
      </div>
    </div>
  )
}
