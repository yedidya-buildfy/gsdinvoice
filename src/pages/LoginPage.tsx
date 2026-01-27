import { useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'

export function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Get the redirect path from location state, default to dashboard
  const from = location.state?.from?.pathname || '/'

  // Redirect to destination when user becomes authenticated
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

  const handleSignupClick = () => {
    navigate('/signup', { state: { from: location.state?.from } })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">VAT Declaration Manager</h1>
          <p className="text-text-secondary mt-2">Sign in to your account</p>
        </div>
        <LoginForm onSignupClick={handleSignupClick} />
      </div>
    </div>
  )
}
