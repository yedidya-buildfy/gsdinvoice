/**
 * Types for Exchange Rate Service
 * Bank of Israel (BOI) exchange rate integration
 */

/**
 * Exchange rate data from BOI API
 */
export interface ExchangeRate {
  /** ISO 4217 currency code: "USD", "EUR", etc. */
  currencyCode: string
  /** Rate in ILS per 1 unit (e.g., 3.70 = 1 USD = 3.70 ILS) */
  rate: number
  /** Date of the rate (YYYY-MM-DD) */
  date: string
  /** Unit for the rate (usually 1, some currencies use 100) */
  unit: number
}

/**
 * Cached exchange rate with metadata
 */
export interface CachedExchangeRate {
  rate: number
  unit: number
  fetchedAt: number  // timestamp
  rateDate: string   // actual date of the rate (may differ from requested date)
}

/**
 * Structure for localStorage persistence
 */
export interface StoredExchangeRateCache {
  version: 1
  /** Key format: "USD:2026-02-04" -> CachedExchangeRate */
  rates: Record<string, CachedExchangeRate>
}

/**
 * Conversion details for display in UI
 */
export interface ConversionDetails {
  fromCurrency: string
  toCurrency: string
  originalAmount: number      // In smallest unit (cents/agorot)
  convertedAmount: number     // In smallest unit (agorot)
  rate: number
  rateDate: string
  /** True if rate is from a different date than requested (weekend/holiday) */
  rateDateDiffers: boolean
}
