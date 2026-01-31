/**
 * Currency Module - Public API
 *
 * This is the single source of truth for all currency-related functionality.
 * Import everything from '@/lib/currency' rather than individual files.
 *
 * @example
 * import {
 *   type CurrencyCode,
 *   formatCurrency,
 *   formatTransactionAmount,
 *   isCurrencyCode,
 *   COMMON_CURRENCIES,
 *   DEFAULT_CURRENCY,
 * } from '@/lib/currency';
 */

// =============================================================================
// Types
// =============================================================================

export type { CurrencyCode, CurrencyCodeRecord } from './types';

export type { CurrencySelectOption } from './types';

export {
  // Constants
  COMMON_CURRENCIES,
  DEFAULT_CURRENCY,
  // Type guards
  isCurrencyCode,
  toCurrencyCode,
  // Currency info
  getCurrencyInfo,
  getCurrencyRecord,
  getAllCurrencyCodes,
} from './types';

// Select options (separate file to avoid circular dependency)
export { getCurrenciesForSelect } from './select';

// =============================================================================
// Symbols
// =============================================================================

export { getCurrencySymbol, hasExplicitSymbol, CURRENCY_SYMBOLS } from './symbols';

// =============================================================================
// Locale
// =============================================================================

export { getLocaleForCurrency, getUserLocale, getDisplayLocale } from './locale';

// =============================================================================
// Formatting
// =============================================================================

export type { FormatCurrencyOptions } from './format';

export {
  getCurrencyDigits,
  toMinorUnits,
  toMajorUnits,
  formatCurrency,
  parseCurrency,
  formatCurrencyValue,
} from './format';

// =============================================================================
// Entity Formatters
// =============================================================================

export type {
  TransactionAmountData,
  LineItemAmountData,
  InvoiceAmountData,
} from './formatters';

export {
  formatTransactionAmount,
  formatLineItemAmount,
  formatInvoiceAmount,
  formatInvoiceVat,
  getTransactionCurrency,
  getTransactionMinorUnits,
  // Legacy aliases (deprecated)
  shekelToAgorot,
  agorotToShekel,
  formatShekel,
} from './formatters';

// =============================================================================
// Validation
// =============================================================================

export {
  isValidCurrencyCode,
  validateCurrency,
  validateCurrencyWithDefault,
  assertCurrencyCode,
  getAllValidCurrencyCodes,
  isValidCurrencyFormat,
  isValidMinorUnits,
  validateCurrencyAmount,
} from './validation';

// =============================================================================
// Re-export for convenience
// =============================================================================

// Allow direct import of the library for advanced use cases
import { codes, code } from 'currency-codes-ts';
export const getAllCodes = codes;
export const getCode = code;
