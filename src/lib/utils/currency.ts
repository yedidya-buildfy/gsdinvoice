/**
 * Currency conversion utilities for Israeli Shekel (ILS)
 * Handles conversion between shekel amounts and agorot (1 ILS = 100 agorot)
 */

/**
 * Convert shekel amount to integer agorot
 * @param amount - Shekel amount as number or string (with optional commas/spaces)
 * @returns Integer agorot value
 * @example shekelToAgorot(123.45) => 12345
 * @example shekelToAgorot('1,234.56') => 123456
 */
export function shekelToAgorot(amount: number | string): number {
  if (typeof amount === 'string') {
    // Remove commas, spaces, and currency symbols
    const cleaned = amount.replace(/[,\s₪]/g, '');
    amount = parseFloat(cleaned);
  }

  if (isNaN(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

/**
 * Convert agorot to shekel amount
 * @param agorot - Integer agorot value
 * @returns Shekel amount as decimal number
 * @example agorotToShekel(12345) => 123.45
 */
export function agorotToShekel(agorot: number): number {
  return agorot / 100;
}

/**
 * Format agorot as localized currency string
 * @param agorot - Integer agorot value
 * @returns Formatted currency string in he-IL locale
 * @example formatShekel(12345) => "‏123.45 ₪"
 */
export function formatShekel(agorot: number): string {
  const shekel = agorotToShekel(agorot);
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(shekel);
}
