import { useState, type FormEvent } from 'react'
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

interface SignupFormProps {
  onLoginClick?: () => void
}

export function SignupForm({ onLoginClick }: SignupFormProps) {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signUpError } = await signUp(email, password)

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Email confirmation may be required - show success message
    setEmailSent(true)
    setLoading(false)
  }

  if (emailSent) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="bg-surface border border-surface rounded-lg p-6">
          <h3 className="text-lg font-medium text-text mb-2">
            Check your email
          </h3>
          <p className="text-text-secondary mb-4">
            We sent a confirmation link to <span className="font-medium text-text">{email}</span>.
            Please check your inbox and click the link to verify your account.
          </p>
          <button
            type="button"
            onClick={onLoginClick}
            className="text-primary hover:text-primary/80 font-medium"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-text mb-2">
            Email address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <EnvelopeIcon className="h-5 w-5 text-text-secondary" />
            </div>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-surface rounded-lg bg-surface text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-text mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LockClosedIcon className="h-5 w-5 text-text-secondary" />
            </div>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-surface rounded-lg bg-surface text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="At least 6 characters"
            />
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onLoginClick}
          className="text-primary hover:text-primary/80 font-medium"
        >
          Sign in
        </button>
      </p>
    </div>
  )
}
