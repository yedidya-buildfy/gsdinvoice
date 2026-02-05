/**
 * Exchange Rate Service
 *
 * Provides exchange rates from Bank of Israel (BOI) for currency conversion
 * in the line item matching algorithm.
 *
 * Features:
 * - In-memory cache for fast lookups during batch scoring
 * - localStorage persistence across sessions
 * - Automatic fallback to previous business day for weekends/holidays
 * - Support for up to 3 years of historical rates
 */

import { fetchRatesForDate, fetchLatestRates } from './boiClient'
import type { CachedExchangeRate, StoredExchangeRateCache, ConversionDetails } from './types'

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'vat-manager-exchange-rates'
const CACHE_TTL_HISTORICAL = 24 * 60 * 60 * 1000  // 24 hours for historical rates
const CACHE_TTL_TODAY = 60 * 60 * 1000            // 1 hour for today's rate
const MAX_HISTORICAL_YEARS = 3                     // Limit on how far back we'll fetch

// =============================================================================
// Cache Management
// =============================================================================

/** In-memory cache for fast lookups during batch scoring */
const memoryCache = new Map<string, CachedExchangeRate>()

/**
 * Generate cache key for a currency and date
 */
function cacheKey(currencyCode: string, date: string): string {
  return `${currencyCode.toUpperCase()}:${date}`
}

/**
 * Load cache from localStorage
 */
function loadStorageCache(): Map<string, CachedExchangeRate> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return new Map()

    const parsed: StoredExchangeRateCache = JSON.parse(stored)
    if (parsed.version !== 1) return new Map()

    return new Map(Object.entries(parsed.rates))
  } catch (error) {
    console.warn('[exchangeRates] Failed to load cache from localStorage:', error)
    return new Map()
  }
}

/**
 * Save cache to localStorage
 */
function saveStorageCache(): void {
  try {
    const cache: StoredExchangeRateCache = {
      version: 1,
      rates: Object.fromEntries(memoryCache),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.warn('[exchangeRates] Failed to save cache to localStorage:', error)
  }
}

/**
 * Initialize memory cache from localStorage on module load
 */
function initializeCache(): void {
  const storageCache = loadStorageCache()
  for (const [key, value] of storageCache) {
    memoryCache.set(key, value)
  }
}

// Initialize cache on module load
initializeCache()

/**
 * Check if cached rate is still valid
 */
function isCacheValid(cached: CachedExchangeRate, requestedDate: string): boolean {
  const now = Date.now()
  const today = new Date().toISOString().split('T')[0]

  // Use shorter TTL for today's rate
  const ttl = requestedDate === today ? CACHE_TTL_TODAY : CACHE_TTL_HISTORICAL

  return now - cached.fetchedAt < ttl
}

/**
 * Clear the exchange rate cache (for testing/debugging)
 */
export function clearExchangeRateCache(): void {
  memoryCache.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    // Ignore localStorage errors
  }
}

// =============================================================================
// Date Utilities
// =============================================================================

/**
 * Check if a date is within the allowed historical range (3 years)
 */
function isDateWithinRange(date: string): boolean {
  const requestedDate = new Date(date)
  const minDate = new Date()
  minDate.setFullYear(minDate.getFullYear() - MAX_HISTORICAL_YEARS)

  return requestedDate >= minDate
}

/**
 * Get the previous business day (skipping weekends)
 * Note: This doesn't account for Israeli holidays, but BOI API will return empty
 * for holidays, and we'll recursively try previous days
 */
function getPreviousBusinessDay(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)

  // Skip weekends (Saturday=6, Sunday=0 in Israel working week context)
  // BOI doesn't publish on Friday evening for Saturday, so we need to handle this
  const dayOfWeek = d.getDay()
  if (dayOfWeek === 6) {
    // Saturday -> go back to Friday
    d.setDate(d.getDate() - 1)
  } else if (dayOfWeek === 0) {
    // Sunday - BOI might not have published yet, but it's a working day in Israel
    // Keep as is, let API decide
  }

  return d.toISOString().split('T')[0]
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Get exchange rate for a specific currency and date
 *
 * @param currencyCode - ISO 4217 currency code (e.g., "USD", "EUR")
 * @param date - Date in YYYY-MM-DD format
 * @returns Rate (ILS per 1 unit of currency), or null if unavailable
 */
export async function getExchangeRate(
  currencyCode: string,
  date: string
): Promise<{ rate: number; rateDate: string } | null> {
  const currency = currencyCode.toUpperCase()

  console.log(`[exchangeRates] getExchangeRate called for ${currency} on ${date}`)

  // ILS to ILS is always 1:1
  if (currency === 'ILS') {
    return { rate: 1, rateDate: date }
  }

  // Check date is within allowed range
  if (!isDateWithinRange(date)) {
    console.warn(`[exchangeRates] Date ${date} is beyond ${MAX_HISTORICAL_YEARS} year limit`)
    return null
  }

  // Check memory cache first
  const key = cacheKey(currency, date)
  const cached = memoryCache.get(key)
  if (cached && isCacheValid(cached, date)) {
    console.log(`[exchangeRates] Cache hit for ${currency}:${date}`)
    // Adjust rate for unit (e.g., if unit=100, rate is per 100 units)
    const adjustedRate = cached.rate / (cached.unit || 1)
    return { rate: adjustedRate, rateDate: cached.rateDate }
  }

  // Fetch from API
  try {
    console.log(`[exchangeRates] Fetching from API for date ${date}`)
    const rates = await fetchRatesForDate(date)
    console.log(`[exchangeRates] API returned ${rates.length} rates`)

    if (rates.length === 0) {
      // No rates for this date (weekend/holiday) - try previous business day
      const prevDate = getPreviousBusinessDay(date)
      console.log(`[exchangeRates] No rates for ${date}, trying ${prevDate}`)
      return getExchangeRate(currency, prevDate)
    }

    // Cache all rates from this response
    const now = Date.now()
    for (const rate of rates) {
      const rateKey = cacheKey(rate.currencyCode, date)
      memoryCache.set(rateKey, {
        rate: rate.rate,
        unit: rate.unit,
        fetchedAt: now,
        rateDate: rate.date,
      })
    }
    saveStorageCache()

    // Find the requested currency
    const targetRate = rates.find(r => r.currencyCode.toUpperCase() === currency)
    if (!targetRate) {
      console.warn(`[exchangeRates] Currency ${currency} not found in BOI rates. Available: ${rates.map(r => r.currencyCode).join(', ')}`)
      return null
    }

    // Adjust rate for unit
    const adjustedRate = targetRate.rate / (targetRate.unit || 1)
    console.log(`[exchangeRates] Got rate for ${currency}: ${adjustedRate}`)
    return { rate: adjustedRate, rateDate: targetRate.date }
  } catch (error) {
    console.error('[exchangeRates] Failed to fetch rate:', error)

    // Return cached value even if expired (better than nothing)
    if (cached) {
      console.warn('[exchangeRates] Using expired cached rate as fallback')
      const adjustedRate = cached.rate / (cached.unit || 1)
      return { rate: adjustedRate, rateDate: cached.rateDate }
    }

    return null
  }
}

/**
 * Batch fetch exchange rates for multiple currencies on a specific date
 * More efficient than individual calls for batch scoring
 *
 * @param date - Date in YYYY-MM-DD format
 * @param currencies - Optional list of currencies to fetch (fetches all if not specified)
 * @returns Map of currency code to rate info
 */
export async function getExchangeRatesForDate(
  date: string,
  currencies?: string[]
): Promise<Map<string, { rate: number; rateDate: string }>> {
  const result = new Map<string, { rate: number; rateDate: string }>()

  // Always include ILS
  result.set('ILS', { rate: 1, rateDate: date })

  // Check date is within allowed range
  if (!isDateWithinRange(date)) {
    console.warn(`[exchangeRates] Date ${date} is beyond ${MAX_HISTORICAL_YEARS} year limit`)
    return result
  }

  // Check which currencies we need to fetch
  const currenciesToFetch = currencies?.map(c => c.toUpperCase()).filter(c => c !== 'ILS') || []
  const uncachedCurrencies: string[] = []

  for (const currency of currenciesToFetch) {
    const key = cacheKey(currency, date)
    const cached = memoryCache.get(key)
    if (cached && isCacheValid(cached, date)) {
      const adjustedRate = cached.rate / (cached.unit || 1)
      result.set(currency, { rate: adjustedRate, rateDate: cached.rateDate })
    } else {
      uncachedCurrencies.push(currency)
    }
  }

  // If all currencies are cached, return early
  if (uncachedCurrencies.length === 0 && currenciesToFetch.length > 0) {
    return result
  }

  // Fetch from API
  try {
    const rates = await fetchRatesForDate(date)

    if (rates.length === 0) {
      // No rates for this date - try previous business day
      const prevDate = getPreviousBusinessDay(date)
      console.log(`[exchangeRates] No rates for ${date}, trying ${prevDate}`)
      return getExchangeRatesForDate(prevDate, currencies)
    }

    // Cache all rates
    const now = Date.now()
    for (const rate of rates) {
      const rateKey = cacheKey(rate.currencyCode, date)
      memoryCache.set(rateKey, {
        rate: rate.rate,
        unit: rate.unit,
        fetchedAt: now,
        rateDate: rate.date,
      })

      // Add to result if it's a currency we care about (or if no filter specified)
      const currency = rate.currencyCode.toUpperCase()
      if (!currencies || currenciesToFetch.includes(currency)) {
        const adjustedRate = rate.rate / (rate.unit || 1)
        result.set(currency, { rate: adjustedRate, rateDate: rate.date })
      }
    }
    saveStorageCache()
  } catch (error) {
    console.error('[exchangeRates] Failed to batch fetch rates:', error)
    // Return what we have from cache
  }

  return result
}

/**
 * Get latest exchange rates (for displaying current rates)
 *
 * @returns Map of currency code to rate info
 */
export async function getLatestExchangeRates(): Promise<Map<string, { rate: number; rateDate: string }>> {
  const result = new Map<string, { rate: number; rateDate: string }>()
  result.set('ILS', { rate: 1, rateDate: new Date().toISOString().split('T')[0] })

  try {
    const rates = await fetchLatestRates()

    for (const rate of rates) {
      const adjustedRate = rate.rate / (rate.unit || 1)
      result.set(rate.currencyCode.toUpperCase(), {
        rate: adjustedRate,
        rateDate: rate.date,
      })
    }
  } catch (error) {
    console.error('[exchangeRates] Failed to fetch latest rates:', error)
  }

  return result
}

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert foreign currency amount to ILS agorot
 *
 * @param amountInSmallestUnit - Amount in smallest unit (cents, pennies, etc.)
 * @param fromCurrency - Source currency code
 * @param rate - Exchange rate (ILS per 1 unit of foreign currency)
 * @returns Amount in ILS agorot
 */
export function convertToILS(
  amountInSmallestUnit: number,
  fromCurrency: string,
  rate: number
): number {
  if (fromCurrency.toUpperCase() === 'ILS') {
    return amountInSmallestUnit
  }

  // Convert: amount in cents * rate = amount in ILS cents (agorot)
  // e.g., 10000 cents (100 USD) * 3.70 = 37000 agorot (370 ILS)
  return Math.round(amountInSmallestUnit * rate)
}

/**
 * Create conversion details for display
 */
export function createConversionDetails(
  originalAmount: number,
  fromCurrency: string,
  convertedAmount: number,
  rate: number,
  rateDate: string,
  requestedDate: string
): ConversionDetails {
  return {
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: 'ILS',
    originalAmount,
    convertedAmount,
    rate,
    rateDate,
    rateDateDiffers: rateDate !== requestedDate,
  }
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  ExchangeRate,
  CachedExchangeRate,
  ConversionDetails,
} from './types'
