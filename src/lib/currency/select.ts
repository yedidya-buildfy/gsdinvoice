/**
 * Currency Select Options
 *
 * Separated to avoid circular dependency between types.ts and symbols.ts
 */

import { codes } from 'currency-codes-ts';
import type { CurrencyCode, CurrencySelectOption } from './types';
import { getCurrencyRecord, COMMON_CURRENCIES } from './types';
import { CURRENCY_SYMBOLS } from './symbols';

/**
 * Get symbol for a currency code
 */
function getSymbol(code: CurrencyCode): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Get currencies formatted for select dropdowns
 * Common currencies appear first, then alphabetically
 */
export function getCurrenciesForSelect(): CurrencySelectOption[] {
  const allCodes = codes() as CurrencyCode[];

  const toOption = (code: CurrencyCode): CurrencySelectOption | null => {
    const info = getCurrencyRecord(code);
    if (!info) return null;
    return {
      code: info.code as CurrencyCode,
      name: info.currency,
      symbol: getSymbol(code),
      digits: info.digits ?? 2,
    };
  };

  // Common currencies first
  const common = COMMON_CURRENCIES
    .map(toOption)
    .filter((c): c is CurrencySelectOption => c !== null);

  // Rest alphabetically by name
  const others = allCodes
    .filter((code) => !COMMON_CURRENCIES.includes(code))
    .map(toOption)
    .filter((c): c is CurrencySelectOption => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...common, ...others];
}
