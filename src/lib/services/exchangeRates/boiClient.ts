/**
 * Bank of Israel API Client
 * Fetches exchange rates via Supabase Edge Function (to avoid CORS issues)
 */

import type { ExchangeRate } from './types'

interface EdgeFunctionResponse {
  success: boolean
  rates: Record<string, { rate: number; unit: number; date: string }>
  count: number
  error?: string
}

/**
 * Fetch exchange rates for a specific date via Edge Function
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Array of exchange rates for all currencies
 */
export async function fetchRatesForDate(date: string): Promise<ExchangeRate[]> {
  const response = await fetchWithRetry(`exchange-rates?date=${encodeURIComponent(date)}`)

  if (!response.success) {
    if (response.count === 0) {
      // No rates for this date (weekend/holiday)
      return []
    }
    throw new Error(response.error || 'Failed to fetch exchange rates')
  }

  return Object.entries(response.rates).map(([currencyCode, data]) => ({
    currencyCode,
    rate: data.rate,
    date: data.date,
    unit: data.unit,
  }))
}

/**
 * Fetch the latest exchange rates via Edge Function
 *
 * @returns Array of exchange rates for all currencies
 */
export async function fetchLatestRates(): Promise<ExchangeRate[]> {
  const response = await fetchWithRetry('exchange-rates?latest=true')

  if (!response.success) {
    throw new Error(response.error || 'Failed to fetch exchange rates')
  }

  if (response.count === 0) {
    throw new Error('No exchange rates returned')
  }

  return Object.entries(response.rates).map(([currencyCode, data]) => ({
    currencyCode,
    rate: data.rate,
    date: data.date,
    unit: data.unit,
  }))
}

/**
 * Fetch with retry logic via Supabase Edge Function
 */
async function fetchWithRetry(
  path: string,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<EdgeFunctionResponse> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get the Supabase URL and anon key
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[boiClient] Supabase configuration missing!')
        throw new Error('Supabase configuration missing')
      }

      const url = `${supabaseUrl}/functions/v1/${path}`
      console.log(`[boiClient] Fetching: ${url}`)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      })

      console.log(`[boiClient] Response status: ${response.status}`)

      if (!response.ok) {
        // Retry on server errors (5xx)
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`)
        }
        const errorData = await response.json().catch(() => ({}))
        console.error('[boiClient] Error response:', errorData)
        throw new Error(errorData.error || `HTTP error: ${response.status}`)
      }

      const data: EdgeFunctionResponse = await response.json()
      console.log(`[boiClient] Success! Got ${data.count} rates`)
      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[boiClient] Attempt ${attempt}/${maxRetries} failed:`, lastError.message)

      if (attempt < maxRetries) {
        await sleep(delayMs * attempt)  // Exponential backoff
      }
    }
  }

  // Return error response instead of throwing
  console.error('[boiClient] All retries failed:', lastError?.message)
  return {
    success: false,
    rates: {},
    count: 0,
    error: lastError?.message || 'Failed to fetch exchange rates',
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
