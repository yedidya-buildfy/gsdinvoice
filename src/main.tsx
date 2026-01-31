import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from 'react-aria'
import { PostHogProvider } from 'posthog-js/react'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './contexts/AuthContext'
import { TeamProvider } from './contexts/TeamContext'
import { initPostHog, posthog } from './lib/posthog'
import App from './App'
import './styles/globals.css'

// Initialize PostHog
initPostHog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale="en-US">
          <AuthProvider>
            <TeamProvider>
              <App />
            </TeamProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </PostHogProvider>
  </StrictMode>,
)
