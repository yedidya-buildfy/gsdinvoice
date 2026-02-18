/**
 * Currency Formatting Utilities
 *
 * Core functions for converting between major/minor units
 * and formatting currency amounts for display.
 */

import type { CurrencyCode } from './types';
import { getCurrencyRecord, toCurrencyCode } from './types';
import { DEFAULT_CURRENCY } from './types';
import { getLocaleForCurrency } from './locale';

/**
 * Get decimal digits for a currency (e.g., 2 for USD, 0 for JPY)
 */
function getCurrencyDigits(currencyCode: CurrencyCode): number {
  const record = getCurrencyRecord(currencyCode);
  return record?.digits ?? 2;
}

/**
 * Convert major units to minor units (e.g., dollars to cents, shekels to agorot)
 *
 * @param amount - Amount in major currency unit (can be number or string)
 * @param currencyCode - ISO 4217 currency code (default: ILS)
 * @returns Integer value in minor units
 *
 * @example
 * toMinorUnits(123.45, 'ILS') // => 12345
 * toMinorUnits(100, 'JPY')    // => 100 (JPY has 0 decimal places)
 * toMinorUnits('1,234.56', 'USD') // => 123456
 */
export function toMinorUnits(
  amount: number | string,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY
): number {
  let numericAmount: number;

  if (typeof amount === 'string') {
    // Remove common currency symbols, commas, spaces
    const cleaned = amount.replace(/[,\s\u20AA$\u20AC\u00A3\u00A5\u20B9\u20BD\u20A9\u20BA\u0E3F\u20B1\u20B4\u20AB\u20A6]/g, '');
    numericAmount = parseFloat(cleaned);
  } else {
    numericAmount = amount;
  }

  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  const digits = getCurrencyDigits(currencyCode);
  return Math.round(numericAmount * Math.pow(10, digits));
}

/**
 * Convert minor units to major units (e.g., cents to dollars, agorot to shekels)
 *
 * @param minorUnits - Integer value in minor units
 * @param currencyCode - ISO 4217 currency code (default: ILS)
 * @returns Amount in major currency unit
 *
 * @example
 * toMajorUnits(12345, 'ILS') // => 123.45
 * toMajorUnits(100, 'JPY')   // => 100
 */
export function toMajorUnits(
  minorUnits: number,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY
): number {
  const digits = getCurrencyDigits(currencyCode);
  return minorUnits / Math.pow(10, digits);
}

/**
 * Formatting options for formatCurrency
 */
export interface FormatCurrencyOptions {
  /** Override the locale (default: currency's home locale) */
  locale?: string;
  /** Show +/- sign (default: auto) */
  signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
  /** Use compact notation for large numbers (default: false) */
  compact?: boolean;
  /** Show currency symbol (default: true) */
  showSymbol?: boolean;
}

/**
 * Format minor units as localized currency string
 *
 * @param minorUnits - Integer value in minor units (cents/agorot)
 * @param currencyCode - ISO 4217 currency code (string is auto-validated)
 * @param options - Additional formatting options
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(12345, 'ILS')           // => "₪123.45"
 * formatCurrency(10000, 'USD')           // => "$100.00"
 * formatCurrency(1000000, 'USD', { compact: true }) // => "$10K"
 */
export function formatCurrency(
  minorUnits: number,
  currencyCode: CurrencyCode | string | null | undefined = DEFAULT_CURRENCY,
  options: FormatCurrencyOptions = {}
): string {
  // Safely convert string to CurrencyCode, falling back to default
  const validCurrency = toCurrencyCode(currencyCode, DEFAULT_CURRENCY);
  const majorUnits = toMajorUnits(minorUnits, validCurrency);
  const locale = options.locale ?? getLocaleForCurrency(validCurrency);

  const formatOptions: Intl.NumberFormatOptions = {
    style: options.showSymbol === false ? 'decimal' : 'currency',
    currency: validCurrency,
    signDisplay: options.signDisplay ?? 'auto',
  };

  if (options.compact) {
    formatOptions.notation = 'compact';
    formatOptions.compactDisplay = 'short';
  }

  return new Intl.NumberFormat(locale, formatOptions).format(majorUnits);
}

