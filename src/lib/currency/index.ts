/**
 * Currency Module - Public API
 *
 * This is the single source of truth for all currency-related functionality.
 * Import everything from '@/lib/currency' rather than individual files.
 */

// =============================================================================
// Types
// =============================================================================

export type { CurrencyCode } from './types';

// Select options (separate file to avoid circular dependency)
export { getCurrenciesForSelect } from './select';

// =============================================================================
// Symbols
// =============================================================================

export { getCurrencySymbol } from './symbols';

// =============================================================================
// Formatting
// =============================================================================

export { formatCurrency } from './format';

// =============================================================================
// Entity Formatters
// =============================================================================

export {
  formatTransactionAmount,
  formatLineItemAmount,
  // Legacy aliases (deprecated)
  shekelToAgorot,
  agorotToShekel,
  formatShekel,
} from './formatters';
