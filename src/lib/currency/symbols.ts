/**
 * Currency Symbols
 *
 * Maps ISO 4217 currency codes to their display symbols.
 * Intl.NumberFormat handles most cases, but we override some for better display.
 */

import type { CurrencyCode } from './types';
import { toCurrencyCode, DEFAULT_CURRENCY } from './types';

/**
 * Currency symbols for display
 * Only includes currencies that need explicit symbols
 * (Intl.NumberFormat handles the rest)
 */
export const CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
  // Major currencies with distinct symbols
  ILS: '\u20AA', // ₪
  USD: '$',
  EUR: '\u20AC', // €
  GBP: '\u00A3', // £
  JPY: '\u00A5', // ¥
  CNY: '\u00A5', // ¥
  INR: '\u20B9', // ₹
  RUB: '\u20BD', // ₽
  KRW: '\u20A9', // ₩
  TRY: '\u20BA', // ₺
  THB: '\u0E3F', // ฿
  PHP: '\u20B1', // ₱
  PLN: 'z\u0142', // zł
  UAH: '\u20B4', // ₴
  VND: '\u20AB', // ₫
  NGN: '\u20A6', // ₦

  // Currencies with $ variants (for disambiguation)
  CAD: 'C$',
  AUD: 'A$',
  NZD: 'NZ$',
  HKD: 'HK$',
  SGD: 'S$',
  TWD: 'NT$',
  MXN: 'MX$',
  ARS: 'AR$',
  CLP: 'CL$',
  COP: 'CO$',

  // Currencies with kr/R variants
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  ISK: 'kr',
  ZAR: 'R',
  BRL: 'R$',

  // Swiss Franc (no symbol, use code)
  CHF: 'CHF',
};

/**
 * Get symbol for currency, falling back to the code itself
 * Accepts string and validates to CurrencyCode
 */
export function getCurrencySymbol(code: CurrencyCode | string | null | undefined): string {
  const validCode = toCurrencyCode(code, DEFAULT_CURRENCY);
  return CURRENCY_SYMBOLS[validCode] ?? validCode;
}

/**
 * Check if a currency has an explicit symbol defined
 */
export function hasExplicitSymbol(code: CurrencyCode): boolean {
  return code in CURRENCY_SYMBOLS;
}
