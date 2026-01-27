import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'
import { SignupForm } from '@/components/auth/SignupForm'

export function SignupPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Get the redirect path from location state, default to dashboard
  const from = location.state?.from?.pathname || '/'

  // Redirect to destination when user becomes authenticated
  // This handles auto-confirm enabled in Supabase
  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true })
    }
  }, [user, loading, navigate, from])

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  const handleLoginClick = () => {
    navigate('/login', { state: { from: location.state?.from } })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">VAT Declaration Manager</h1>
          <p className="text-text-secondary mt-2">Create your account</p>
        </div>
        <SignupForm onLoginClick={handleLoginClick} />
      </div>
    </div>
  )
}
