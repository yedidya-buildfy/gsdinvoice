import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

export function initPostHog() {
  if (!POSTHOG_KEY) {
    console.warn('PostHog API key not found. Analytics disabled.')
    return
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
      },
    },
  })
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  posthog.identify(userId, properties)
}

export function resetUser() {
  if (!POSTHOG_KEY) return
  posthog.reset()
}

export function captureEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  posthog.capture(eventName, properties)
}

export { posthog }
