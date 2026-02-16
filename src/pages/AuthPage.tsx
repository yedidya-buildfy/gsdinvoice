import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, UserIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, signInWithOAuth, user, loading: authLoading } = useAuth()
  const [oauthLoading, setOauthLoading] = useState(false)

  const from = location.state?.from?.pathname || '/'

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate(from, { replace: true })
    }
  }, [user, authLoading, navigate, from])

  // Set initial mode based on route
  useEffect(() => {
    if (location.pathname === '/signup') {
      setIsLogin(false)
    } else {
      setIsLogin(true)
    }
  }, [location.pathname])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    setLoading(false)
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { error: signUpError } = await signUp(email, password, name)

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setEmailSent(true)
    setLoading(false)
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setError(null)
    setEmailSent(false)
  }

  const handleGoogleSignIn = async () => {
    setOauthLoading(true)
    setError(null)
    const { error: oauthError } = await signInWithOAuth('google')
    if (oauthError) {
      setError(oauthError.message)
      setOauthLoading(false)
    }
    // Don't set loading to false on success - user will be redirected
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8
        bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface via-background to-background">
        <div className="w-full max-w-md">
          <div className="bg-surface/80 backdrop-blur-xl border border-primary/20 rounded-3xl p-8 shadow-2xl shadow-primary/10 text-center">
            <div className="mb-6">
              <div className="bg-primary/20 p-3 rounded-xl border border-primary/30 inline-block">
                <EnvelopeIcon className="h-10 w-10 text-primary stroke-[1.5]" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">
              Check your email
            </h3>
            <p className="text-text-secondary mb-6">
              We sent a confirmation link to <span className="font-medium text-text">{email}</span>.
              Please check your inbox and click the link to verify your account.
            </p>
            <button
              type="button"
              onClick={() => {
                setEmailSent(false)
                setIsLogin(true)
              }}
              className="text-primary hover:text-primary-dark font-medium transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8
      bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface via-background to-background">
      <div className="w-full max-w-5xl">
        <div className="relative flex flex-col md:flex-row bg-surface/80 backdrop-blur-xl border border-primary/20
          rounded-3xl shadow-2xl shadow-primary/10 overflow-hidden">

          {/* Form Panel */}
          <div className={`w-full md:w-1/2 p-8 md:p-12 transition-transform duration-300 ease-in-out ${
            isLogin ? 'md:translate-x-0' : 'md:translate-x-full'
          }`}>
            {/* Logo */}
            <div className="mb-8 flex flex-col items-center justify-center">
              <img src="/logo120.png" alt="VATManager" className="h-16 w-16" />
              <h1 className="mt-4 text-2xl font-bold text-text tracking-tight">
                VAT<span className="text-primary">Manager</span>
              </h1>
            </div>

            {/* Toggle */}
            <div className="mb-8">
              <div className="bg-background/70 p-1 rounded-xl border border-text-secondary/20 flex">
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setError(null) }}
                  className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-300 ${
                    isLogin
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError(null) }}
                  className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-300 ${
                    !isLogin
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-xl bg-error/10 border border-error/20 p-4">
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            {/* Forms with crossfade */}
            <div className="relative">
              {/* Login Form */}
              <form
                className={`space-y-5 transition-opacity duration-200 ${
                  isLogin ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
                }`}
                onSubmit={handleLogin}
              >
                <div>
                  <label htmlFor="email" className="sr-only">Email address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Email address"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="sr-only">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LockClosedIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10 pr-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Password"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="focus:outline-none text-text-secondary hover:text-primary transition-colors"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || oauthLoading}
                  className="w-full py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold
                    text-white bg-primary hover:bg-primary-dark
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                    shadow-lg shadow-primary/30"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-text-secondary/30" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-surface/80 text-text-secondary">or continue with</span>
                  </div>
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading || oauthLoading}
                  className="w-full py-3.5 px-4 border border-text-secondary/30 rounded-xl text-sm font-semibold
                    text-text bg-background/70 hover:bg-background
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                    flex items-center justify-center gap-3"
                >
                  {oauthLoading ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  Continue with Google
                </button>
              </form>

              {/* Sign Up Form */}
              <form
                className={`space-y-5 transition-opacity duration-200 ${
                  !isLogin ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
                }`}
                onSubmit={handleSignUp}
              >
                <div>
                  <label htmlFor="signup-name" className="sr-only">Full name</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="signup-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Full name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="sr-only">Email address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Email address"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-password" className="sr-only">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LockClosedIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="signup-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10 pr-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Password (min 6 characters)"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="focus:outline-none text-text-secondary hover:text-primary transition-colors"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="sr-only">Confirm password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LockClosedIcon className="h-5 w-5 text-text-secondary group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="confirm-password"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-3.5 pl-10 pr-10
                        bg-background/70 border border-text-secondary/30
                        placeholder-text-secondary text-text rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                        transition-all duration-200 sm:text-sm"
                      placeholder="Confirm password"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="focus:outline-none text-text-secondary hover:text-primary transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || oauthLoading}
                  className="w-full py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold
                    text-white bg-primary hover:bg-primary-dark
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                    shadow-lg shadow-primary/30"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating account...
                    </span>
                  ) : (
                    'Create account'
                  )}
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-text-secondary/30" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-surface/80 text-text-secondary">or continue with</span>
                  </div>
                </div>

                {/* Google Sign Up */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading || oauthLoading}
                  className="w-full py-3.5 px-4 border border-text-secondary/30 rounded-xl text-sm font-semibold
                    text-text bg-background/70 hover:bg-background
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                    flex items-center justify-center gap-3"
                >
                  {oauthLoading ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  Continue with Google
                </button>
              </form>
            </div>
          </div>

          {/* Welcome Panel */}
          <div className={`w-full md:w-1/2 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8
            md:p-12 flex flex-col items-center justify-center transition-transform duration-300 ease-in-out ${
              isLogin ? 'md:translate-x-0 border-l' : 'md:-translate-x-full border-r'
            } border-primary/20`}>
            <div className="text-center">
              <div className="transition-opacity duration-200">
                <h2 className="text-3xl font-bold text-text mb-4">
                  {isLogin ? 'Hello, Friend!' : 'Welcome Back!'}
                </h2>
                <p className="text-text-muted mb-8 max-w-sm">
                  {isLogin
                    ? 'Register with your personal details to use all features of the site'
                    : 'Enter your personal details to continue your journey with us'}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleMode}
                className="px-8 py-3 rounded-xl border-2 border-primary text-primary font-semibold
                  hover:bg-primary hover:text-white transition-all duration-300"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
