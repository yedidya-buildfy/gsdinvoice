/**
 * Currency Validation
 *
 * Runtime validation utilities for currency codes.
 * Used at system boundaries (API, forms, user input).
 */

import { codes } from 'currency-codes-ts';
import type { CurrencyCode } from './types';
import { DEFAULT_CURRENCY } from './types';

// Cache the codes set for O(1) lookups
const ALL_CURRENCY_CODES_SET = new Set(codes() as CurrencyCode[]);

/**
 * Validate that a value is a valid ISO 4217 currency code
 */
export function isValidCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && ALL_CURRENCY_CODES_SET.has(value as CurrencyCode);
}

/**
 * Validate and return a currency code, or null if invalid
 */
export function validateCurrency(value: unknown): CurrencyCode | null {
  return isValidCurrencyCode(value) ? value : null;
}

/**
 * Validate and return a currency code, or default if invalid
 */
export function validateCurrencyWithDefault(
  value: unknown,
  defaultValue: CurrencyCode = DEFAULT_CURRENCY
): CurrencyCode {
  return isValidCurrencyCode(value) ? value : defaultValue;
}

/**
 * Assert that a value is a valid currency code
 * Throws if invalid
 */
export function assertCurrencyCode(value: unknown): asserts value is CurrencyCode {
  if (!isValidCurrencyCode(value)) {
    throw new Error(`Invalid currency code: ${String(value)}`);
  }
}

/**
 * Get all valid currency codes as an array
 * Useful for form validation schemas
 */
export function getAllValidCurrencyCodes(): CurrencyCode[] {
  return codes() as CurrencyCode[];
}

/**
 * Check if a currency code format is valid (3 uppercase letters)
 * This is a quick syntactic check, not a semantic ISO 4217 validation
 */
export function isValidCurrencyFormat(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

// =============================================================================
// Amount Validation
// =============================================================================

/**
 * Validate that an amount is a valid minor units value
 */
export function isValidMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

/**
 * Validate a currency amount object
 */
interface CurrencyAmountInput {
  amount: number;
  currency: string;
}

export function validateCurrencyAmount(
  input: unknown
): { amount: number; currency: CurrencyCode } | null {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('amount' in input) ||
    !('currency' in input)
  ) {
    return null;
  }

  const { amount, currency } = input as CurrencyAmountInput;

  if (!isValidMinorUnits(amount)) {
    return null;
  }

  if (!isValidCurrencyCode(currency)) {
    return null;
  }

  return { amount, currency };
}
