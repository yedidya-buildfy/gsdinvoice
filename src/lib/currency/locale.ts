/**
 * Currency Locale Mapping
 *
 * Maps currencies to their "home" locales for proper formatting.
 * Used by Intl.NumberFormat for correct grouping/decimal separators.
 */

import type { CurrencyCode } from './types';

/**
 * Map currencies to their primary locales
 */
const CURRENCY_LOCALES: Partial<Record<CurrencyCode, string>> = {
  // Middle East
  ILS: 'he-IL',
  AED: 'ar-AE',
  SAR: 'ar-SA',
  EGP: 'ar-EG',
  JOD: 'ar-JO',

  // Americas
  USD: 'en-US',
  CAD: 'en-CA',
  MXN: 'es-MX',
  BRL: 'pt-BR',
  ARS: 'es-AR',
  CLP: 'es-CL',
  COP: 'es-CO',
  PEN: 'es-PE',

  // Europe
  EUR: 'de-DE',
  GBP: 'en-GB',
  CHF: 'de-CH',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  RON: 'ro-RO',
  BGN: 'bg-BG',
  RUB: 'ru-RU',
  UAH: 'uk-UA',
  TRY: 'tr-TR',

  // Asia Pacific
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  HKD: 'zh-HK',
  TWD: 'zh-TW',
  KRW: 'ko-KR',
  INR: 'en-IN',
  THB: 'th-TH',
  SGD: 'en-SG',
  MYR: 'ms-MY',
  IDR: 'id-ID',
  PHP: 'en-PH',
  VND: 'vi-VN',
  AUD: 'en-AU',
  NZD: 'en-NZ',

  // Africa
  ZAR: 'en-ZA',
  NGN: 'en-NG',
  KES: 'en-KE',
};

/**
 * Get the best locale for formatting a currency
 * Falls back to en-US if no specific locale is defined
 */
export function getLocaleForCurrency(code: CurrencyCode): string {
  return CURRENCY_LOCALES[code] ?? 'en-US';
}

/**
 * Get user's preferred locale from browser
 */
export function getUserLocale(): string {
  if (typeof navigator !== 'undefined') {
    return navigator.language || 'en-US';
  }
  return 'en-US';
}

/**
 * Get the best locale considering both currency and user preference
 * Useful for showing amounts in user's preferred format
 */
export function getDisplayLocale(code: CurrencyCode, preferUserLocale = false): string {
  if (preferUserLocale) {
    return getUserLocale();
  }
  return getLocaleForCurrency(code);
}
