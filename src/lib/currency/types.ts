/**
 * Currency Types - Single Source of Truth
 *
 * All currency types are derived from the currency-codes-ts library
 * which provides the complete ISO 4217 specification.
 */

import { codes, code as getCurrencyRecordFn } from 'currency-codes-ts';
import type { CurrencyCode as LibCurrencyCode, CurrencyCodeRecord as LibCurrencyCodeRecord } from 'currency-codes-ts/dist/types';

// Re-export the library types as our canonical types
export type CurrencyCode = LibCurrencyCode;
type CurrencyCodeRecord = LibCurrencyCodeRecord;

// Export the lookup function with proper typing
export function getCurrencyRecord(currencyCode: string): CurrencyCodeRecord | undefined {
  return getCurrencyRecordFn(currencyCode);
}

// All valid currency codes (derived from library at runtime)
// Using a function to ensure it's always fresh
export function getAllCurrencyCodes(): CurrencyCode[] {
  return codes() as CurrencyCode[];
}

/**
 * Frequently used currencies - shown first in dropdowns
 * Ordered by relevance to Israeli business context
 */
export const COMMON_CURRENCIES: CurrencyCode[] = [
  'ILS', // Israeli Shekel - primary
  'USD', // US Dollar - most common foreign
  'EUR', // Euro - EU trade
  'GBP', // British Pound
  'CHF', // Swiss Franc
  'JPY', // Japanese Yen
  'CAD', // Canadian Dollar
  'AUD', // Australian Dollar
];

/**
 * App default currency
 */
export const DEFAULT_CURRENCY: CurrencyCode = 'ILS';

// Set cache for O(1) lookups (initialized immediately)
const _codesSetCache = new Set(codes() as CurrencyCode[]);

/**
 * Type guard for runtime validation of currency codes
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  if (typeof value !== 'string') return false;
  return _codesSetCache.has(value as CurrencyCode);
}

/**
 * Safely coerce a value to CurrencyCode or return default
 */
export function toCurrencyCode(value: unknown, fallback: CurrencyCode = DEFAULT_CURRENCY): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback;
}

/**
 * Currency info for UI display
 */
export interface CurrencySelectOption {
  code: CurrencyCode;
  name: string;
  symbol: string;
  digits: number;
}
