/**
 * Entity-Specific Currency Formatters
 *
 * High-level formatters for common business entities.
 * These handle the specific currency logic for each entity type.
 */

import { DEFAULT_CURRENCY, isCurrencyCode } from './types';
import { formatCurrency, type FormatCurrencyOptions } from './format';

// =============================================================================
// Entity Interfaces (minimal for loose coupling)
// =============================================================================

/**
 * Transaction amount data (matches database schema)
 */
interface TransactionAmountData {
  amount_agorot: number;
  foreign_amount_cents?: number | null;
  foreign_currency?: string | null;
}

/**
 * Line item amount data (matches database schema)
 */
interface LineItemAmountData {
  total_agorot?: number | null;
  currency?: string | null;
}

// =============================================================================
// Entity Formatters
// =============================================================================

/**
 * Format a transaction amount for display
 *
 * Automatically handles foreign currency:
 * - Shows foreign amount if available (original transaction currency)
 * - Falls back to ILS amount otherwise
 *
 * @param tx - Transaction or object with amount fields
 * @param options - Additional formatting options
 * @returns Formatted currency string
 *
 * @example
 * // Transaction with foreign currency
 * formatTransactionAmount({
 *   amount_agorot: -35000,
 *   foreign_amount_cents: -10000,
 *   foreign_currency: 'USD'
 * })
 * // Returns: "$100.00"
 *
 * @example
 * // Transaction in ILS only
 * formatTransactionAmount({ amount_agorot: -35000 })
 * // Returns: "₪350.00"
 */
export function formatTransactionAmount(
  tx: TransactionAmountData,
  options: FormatCurrencyOptions = {}
): string {
  // Check for foreign currency - prefer showing the original transaction currency
  if (
    tx.foreign_amount_cents != null &&
    tx.foreign_currency &&
    isCurrencyCode(tx.foreign_currency)
  ) {
    const amount = Math.abs(tx.foreign_amount_cents);
    return formatCurrency(amount, tx.foreign_currency, options);
  }

  // Fall back to ILS
  return formatCurrency(Math.abs(tx.amount_agorot), DEFAULT_CURRENCY, options);
}

/**
 * Format a line item amount for display
 *
 * Uses the line item's currency field, defaulting to ILS
 *
 * @param item - Line item or object with amount/currency fields
 * @param options - Additional formatting options
 * @returns Formatted currency string
 *
 * @example
 * formatLineItemAmount({ total_agorot: 5000, currency: 'USD' })
 * // Returns: "$50.00"
 *
 * @example
 * formatLineItemAmount({ total_agorot: 18000 })
 * // Returns: "₪180.00"
 */
export function formatLineItemAmount(
  item: LineItemAmountData,
  options: FormatCurrencyOptions = {}
): string {
  const amount = Math.abs(item.total_agorot ?? 0);
  const currency = isCurrencyCode(item.currency) ? item.currency : DEFAULT_CURRENCY;
  return formatCurrency(amount, currency, options);
}

// =============================================================================
// Legacy Aliases (deprecated - for backwards compatibility)
// =============================================================================

import { toMinorUnits, toMajorUnits } from './format';

/**
 * @deprecated Use toMinorUnits(amount, 'ILS') instead
 */
export function shekelToAgorot(amount: number | string): number {
  return toMinorUnits(amount, 'ILS');
}

/**
 * @deprecated Use toMajorUnits(agorot, 'ILS') instead
 */
export function agorotToShekel(agorot: number): number {
  return toMajorUnits(agorot, 'ILS');
}

/**
 * @deprecated Use formatCurrency(amount, 'ILS') instead
 */
export function formatShekel(agorot: number): string {
  return formatCurrency(agorot, 'ILS');
}
