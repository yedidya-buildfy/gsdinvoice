# Phase 2: Authentication - Research

**Researched:** 2026-01-27
**Domain:** Supabase Auth with React 19
**Confidence:** HIGH

## Summary

This phase implements user authentication using Supabase Auth with email/password credentials. The existing Supabase client (`src/lib/supabase.ts`) already connects to Supabase, so authentication builds on this foundation. The standard approach uses Supabase's built-in auth methods (`signUp`, `signInWithPassword`, `signOut`) combined with `onAuthStateChange` listener for reactive session management.

The architecture follows a provider pattern where an AuthProvider wraps the app, manages session state via `onAuthStateChange`, and provides auth context to all components. Protected routes use React Router v7 with a ProtectedRoute component that redirects unauthenticated users to login. Session persistence is handled automatically by Supabase (localStorage by default).

**Primary recommendation:** Build custom auth forms (no `@supabase/auth-ui-react` - it's unmaintained), use AuthContext for session state, React Router v7 for protected routes, and let Supabase handle session persistence automatically.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.93.1 | Auth API (already installed) | Official Supabase client with full auth support |
| react-router | ^7.x | Routing and protected routes | Modern React router, merged with Remix |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @heroicons/react | ^2.x | Icons for auth UI | Login/logout button icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom auth forms | @supabase/auth-ui-react | Auth UI is unmaintained (archived Feb 2024), custom forms give full control |
| AuthContext | Zustand auth store | Context is simpler for auth, Zustand adds complexity without benefit here |
| React Router | TanStack Router | React Router v7 is mature, well-documented, already works with React 19 |

**Installation:**
```bash
npm install react-router @heroicons/react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── auth/
│       ├── LoginForm.tsx        # Email/password login form
│       ├── SignupForm.tsx       # Registration form
│       └── ProtectedRoute.tsx   # Route guard component
├── contexts/
│   └── AuthContext.tsx          # Auth provider and hook
├── pages/
│   ├── LoginPage.tsx            # Login page
│   ├── SignupPage.tsx           # Registration page
│   └── DashboardPage.tsx        # Protected dashboard
├── lib/
│   └── supabase.ts              # Existing Supabase client
└── App.tsx                      # Router configuration
```

### Pattern 1: Auth Context with onAuthStateChange
**What:** Central auth state management using React Context and Supabase's session listener
**When to use:** Always - this is the standard pattern for Supabase + React
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/auth/quickstarts/react
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password })
      return { error }
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error }
    },
    signOut: async () => {
      await supabase.auth.signOut()
    }
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

### Pattern 2: Protected Route Component
**What:** Route wrapper that redirects unauthenticated users to login
**When to use:** For any route requiring authentication
**Example:**
```typescript
// Source: https://www.robinwieruch.de/react-router-private-routes/
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!user) {
    // Save attempted location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
```

### Pattern 3: Router Configuration with Protected Routes
**What:** React Router v7 setup with auth provider and route protection
**When to use:** App entry point configuration
**Example:**
```typescript
// Source: https://blog.logrocket.com/authentication-react-router-v7/
import { BrowserRouter, Routes, Route } from 'react-router'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import DashboardPage from '@/pages/DashboardPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            {/* All protected routes nested here */}
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

### Pattern 4: Login Form with Redirect Back
**What:** Login form that redirects user to originally requested page after auth
**When to use:** Login page implementation
**Example:**
```typescript
// Source: https://ui.dev/react-router-protected-routes-authentication
import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Get the page user was trying to access, default to dashboard
  const from = location.state?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="text-red-500">{error}</div>}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      <Link to="/signup">Need an account? Sign up</Link>
    </form>
  )
}
```

### Anti-Patterns to Avoid
- **Storing session in Zustand:** Supabase handles session persistence automatically via localStorage. Don't duplicate this in Zustand - it causes sync issues.
- **Calling getSession() in every component:** Use AuthContext to provide session state. Multiple getSession() calls are wasteful.
- **Async callbacks in onAuthStateChange:** The callback should be synchronous. Defer async work with setTimeout if needed.
- **Using getSession() for security checks:** On server/API routes, use getUser() instead - getSession() can return stale/untrusted data.
- **Trusting session.user for sensitive operations:** For critical actions, call getUser() which validates the JWT with Supabase servers.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session persistence | localStorage wrapper | Supabase auto-persistence | Handles token refresh, expiry, sync |
| Token refresh | Manual refresh logic | Supabase `persistSession: true` | Auto-refresh with backoff, tab sync |
| Auth state sync | Custom event system | `onAuthStateChange` | Handles all auth events (login, logout, token refresh) |
| Password validation | Regex patterns | Supabase weak_password error | Returns specific requirements |
| Email verification | Custom flow | Supabase email confirmation | Secure token-based verification |

**Key insight:** Supabase Auth handles the complex parts (token management, session refresh, persistence). Your job is to wire up the UI and react to state changes.

## Common Pitfalls

### Pitfall 1: Race Condition on Initial Load
**What goes wrong:** App renders before session is loaded, causing flash of login page
**Why it happens:** `getSession()` is async, initial state is null
**How to avoid:** Add loading state, don't render protected content until session check completes
**Warning signs:** Brief flash of login page on refresh when already logged in

### Pitfall 2: Infinite useEffect Loop
**What goes wrong:** 429 rate limit errors, app becomes unresponsive
**Why it happens:** Re-subscribing to `onAuthStateChange` on every render
**How to avoid:** Empty dependency array `[]` for the subscription effect, unsubscribe in cleanup
**Warning signs:** "Over request rate limit" error, rapid network requests

### Pitfall 3: Not Handling Email Confirmation
**What goes wrong:** User signs up, session is null, app breaks
**Why it happens:** By default, Supabase requires email confirmation before creating session
**How to avoid:** Check for null session after signup, show "check email" message
**Warning signs:** signUp returns user but session is null

### Pitfall 4: Memory Leak from Unsubscribed Listener
**What goes wrong:** Console warnings, degraded performance
**Why it happens:** `onAuthStateChange` subscription not cleaned up
**How to avoid:** Return unsubscribe function from useEffect cleanup
**Warning signs:** "Can't perform state update on unmounted component"

### Pitfall 5: Stale Closure in Auth Callback
**What goes wrong:** Auth callback uses outdated state values
**Why it happens:** Callback captures old values, not updated on re-render
**How to avoid:** Keep callback simple, just update session state. Derive other values from session.
**Warning signs:** UI shows wrong user after switching accounts

### Pitfall 6: signOut Scope Confusion
**What goes wrong:** User logs out on one device, still logged in on others (or vice versa)
**Why it happens:** Default scope is 'global', logs out all sessions
**How to avoid:** Use `{ scope: 'local' }` for single-device logout
**Warning signs:** Unexpected logouts on other devices

## Code Examples

Verified patterns from official sources:

### Sign Up with Email/Password
```typescript
// Source: https://supabase.com/docs/guides/auth/passwords
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})

if (error) {
  console.error('Signup error:', error.message)
} else if (!data.session) {
  // Email confirmation required
  console.log('Check your email for confirmation link')
} else {
  // Auto-confirmed (if email confirmation disabled)
  console.log('Signed up:', data.user)
}
```

### Sign In with Email/Password
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password',
})

if (error) {
  // Error message intentionally vague for security
  // Won't distinguish between "user not found" and "wrong password"
  console.error('Login failed:', error.message)
} else {
  console.log('Logged in:', data.user)
  console.log('Session:', data.session)
}
```

### Sign Out
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-signout
// Sign out current device only
const { error } = await supabase.auth.signOut({ scope: 'local' })

// Sign out all devices (default)
const { error: globalError } = await supabase.auth.signOut({ scope: 'global' })
```

### Auth State Change Events
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  // Events: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY

  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session?.user)
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out')
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed')
  }
})

// Cleanup
subscription.unsubscribe()
```

### TypeScript Types for Auth
```typescript
// Source: https://supabase.com/docs/reference/javascript/typescript-support
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}
```

### Error Handling with isAuthApiError
```typescript
// Source: https://supabase.com/docs/guides/auth/debugging/error-codes
import { isAuthApiError } from '@supabase/supabase-js'

try {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
} catch (error) {
  if (isAuthApiError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Invalid email or password'
      case 'email_not_confirmed':
        return 'Please confirm your email first'
      case 'over_request_rate_limit':
        return 'Too many attempts. Please try again later.'
      default:
        return error.message
    }
  }
  return 'An unexpected error occurred'
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @supabase/auth-ui-react | Custom forms | Feb 2024 | Build your own auth UI - library unmaintained |
| react-router-dom v6 | react-router v7 | 2024 | Single package, merged with Remix |
| getSession() for validation | getUser() for validation | Ongoing | getUser() validates JWT server-side, more secure |
| Manual token refresh | Auto-refresh (default) | supabase-js v2 | Automatic with `persistSession: true` |

**Deprecated/outdated:**
- `@supabase/auth-ui-react`: Archived repository, no longer maintained. Build custom forms.
- `supabase.auth.session()`: Removed in v2, use `getSession()` instead.
- `react-router-dom`: Package merged into `react-router` in v7.

## Open Questions

Things that couldn't be fully resolved:

1. **Email confirmation behavior in development**
   - What we know: Supabase requires email confirmation by default
   - What's unclear: Whether to disable for development or use Supabase's test mode
   - Recommendation: Check Supabase dashboard settings, disable confirmation for faster dev iteration

2. **Handling password reset flow**
   - What we know: Supabase has `resetPasswordForEmail` method
   - What's unclear: Full UI flow needed for this phase
   - Recommendation: Out of scope for Phase 2 per requirements, defer to later phase

## Sources

### Primary (HIGH confidence)
- [Supabase Auth Quickstart for React](https://supabase.com/docs/guides/auth/quickstarts/react) - Core patterns
- [Supabase signInWithPassword API](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) - Login method
- [Supabase onAuthStateChange API](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) - Session listener
- [Supabase signOut API](https://supabase.com/docs/reference/javascript/auth-signout) - Logout with scope options
- [Supabase Error Codes](https://supabase.com/docs/guides/auth/debugging/error-codes) - Error handling
- [React Router Documentation](https://reactrouter.com/) - Routing patterns

### Secondary (MEDIUM confidence)
- [Robin Wieruch - React Router Private Routes](https://www.robinwieruch.de/react-router-private-routes/) - ProtectedRoute pattern
- [LogRocket - Authentication React Router v7](https://blog.logrocket.com/authentication-react-router-v7/) - AuthProvider pattern
- [UI.dev - Protected Routes](https://ui.dev/react-router-protected-routes-authentication) - Redirect back pattern

### Tertiary (LOW confidence)
- [Supabase Auth UI GitHub](https://github.com/supabase-community/auth-ui) - Confirmed unmaintained status

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Supabase docs, established React Router patterns
- Architecture: HIGH - Documented patterns from Supabase and React Router
- Pitfalls: HIGH - Documented in official Supabase troubleshooting guides

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (Supabase Auth is stable, patterns well-established)
