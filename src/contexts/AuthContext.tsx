import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User, AuthError, Provider } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { identifyUser, resetUser, captureEvent } from '@/lib/posthog'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, name?: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithOAuth: (provider: Provider) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      setSession(session)
      setLoading(false)

      // Identify user with PostHog on sign in
      if (session?.user) {
        identifyUser(session.user.id, {
          email: session.user.email,
          name: session.user.user_metadata?.full_name,
          created_at: session.user.created_at,
        })
      }

      // Track auth events
      if (event === 'SIGNED_IN') {
        captureEvent('user_signed_in')
      } else if (event === 'SIGNED_OUT') {
        captureEvent('user_signed_out')
        resetUser()
      }
    })

    // Get initial session on mount (restores persisted session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return

      setSession(session)
      setLoading(false)

      // Identify user with PostHog if already logged in
      if (session?.user) {
        identifyUser(session.user.id, {
          email: session.user.email,
          name: session.user.user_metadata?.full_name,
          created_at: session.user.created_at,
        })
      }
    })

    // Cleanup subscription on unmount
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signInWithOAuth = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    return { error }
  }

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
