/**
 * Currency conversion utilities
 * Handles conversion between major currency units and minor units (cents/agorot)
 * Supports multiple currencies via ISO 4217 codes
 */

import currencyCodes from 'currency-codes'

/**
 * Currency metadata for display
 */
export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  digits: number
}

/**
 * Common currencies shown at the top of selection lists
 */
export const COMMON_CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']

/**
 * Currency symbols by code
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CNY: '¥',
  INR: '₹',
  BRL: 'R$',
  RUB: '₽',
  KRW: '₩',
  MXN: '$',
  SGD: 'S$',
  HKD: 'HK$',
  NOK: 'kr',
  SEK: 'kr',
  DKK: 'kr',
  NZD: 'NZ$',
  ZAR: 'R',
  TRY: '₺',
  PLN: 'zł',
  THB: '฿',
  TWD: 'NT$',
  PHP: '₱',
}

/**
 * Get currency info by ISO 4217 code
 */
export function getCurrencyInfo(code: string): CurrencyInfo | null {
  const currency = currencyCodes.code(code)
  if (!currency) return null

  return {
    code: currency.code,
    name: currency.currency,
    symbol: CURRENCY_SYMBOLS[currency.code] || currency.code,
    digits: currency.digits ?? 2,
  }
}

/**
 * Get all available currencies
 */
export function getAllCurrencies(): CurrencyInfo[] {
  const allCurrencies = currencyCodes.codes()
  return allCurrencies
    .map((code) => getCurrencyInfo(code))
    .filter((c): c is CurrencyInfo => c !== null)
}

/**
 * Get currencies for selection, with common currencies first
 */
export function getCurrenciesForSelect(): CurrencyInfo[] {
  const common = COMMON_CURRENCIES
    .map((code) => getCurrencyInfo(code))
    .filter((c): c is CurrencyInfo => c !== null)

  const others = getAllCurrencies()
    .filter((c) => !COMMON_CURRENCIES.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...common, ...others]
}

/**
 * Get currency symbol by code
 */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code
}

/**
 * Convert major units to minor units (cents/agorot)
 * @param amount - Amount in major currency unit
 * @param currencyCode - ISO 4217 currency code (default: ILS)
 * @returns Integer value in minor units
 * @example toMinorUnits(123.45, 'ILS') => 12345
 * @example toMinorUnits(100, 'JPY') => 100 (JPY has 0 decimal places)
 */
export function toMinorUnits(amount: number | string, currencyCode = 'ILS'): number {
  if (typeof amount === 'string') {
    // Remove commas, spaces, and common currency symbols
    const cleaned = amount.replace(/[,\s₪$€£¥]/g, '')
    amount = parseFloat(cleaned)
  }

  if (isNaN(amount)) {
    return 0
  }

  const currencyInfo = getCurrencyInfo(currencyCode)
  const digits = currencyInfo?.digits ?? 2
  const multiplier = Math.pow(10, digits)

  return Math.round(amount * multiplier)
}

/**
 * Convert minor units (cents/agorot) to major units
 * @param minorUnits - Integer value in minor units
 * @param currencyCode - ISO 4217 currency code (default: ILS)
 * @returns Amount in major currency unit
 * @example toMajorUnits(12345, 'ILS') => 123.45
 * @example toMajorUnits(100, 'JPY') => 100
 */
export function toMajorUnits(minorUnits: number, currencyCode = 'ILS'): number {
  const currencyInfo = getCurrencyInfo(currencyCode)
  const digits = currencyInfo?.digits ?? 2
  const divisor = Math.pow(10, digits)

  return minorUnits / divisor
}

/**
 * Format minor units as localized currency string
 * @param minorUnits - Integer value in minor units (cents/agorot)
 * @param currencyCode - ISO 4217 currency code
 * @returns Formatted currency string
 * @example formatCurrency(12345, 'ILS') => "₪123.45"
 * @example formatCurrency(10000, 'USD') => "$100.00"
 */
export function formatCurrency(minorUnits: number, currencyCode = 'ILS'): string {
  const majorUnits = toMajorUnits(minorUnits, currencyCode)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(majorUnits)
}

// Legacy aliases for backwards compatibility
export const shekelToAgorot = (amount: number | string) => toMinorUnits(amount, 'ILS')
export const agorotToShekel = (agorot: number) => toMajorUnits(agorot, 'ILS')
export const formatShekel = (agorot: number) => formatCurrency(agorot, 'ILS')
