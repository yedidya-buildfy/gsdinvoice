/**
 * Date parsing utilities for Israeli date formats
 * Handles DD/MM/YYYY formats and Excel serial dates
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

// Extend dayjs with custom parse format plugin
dayjs.extend(customParseFormat);

// Supported date formats (Israeli standard is DD/MM/YYYY)
const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD/MM/YY',
  'DD.MM.YYYY',
  'DD-MM-YYYY',
  'YYYY-MM-DD',
];

/**
 * Parse Israeli date format to ISO YYYY-MM-DD
 * Handles Excel serial dates, Date objects, and various string formats
 *
 * @param dateStr - Date as string, number (Excel serial), or Date object
 * @returns ISO format YYYY-MM-DD or null if invalid
 *
 * @example parseIsraeliDate('25/01/2026') => '2026-01-25'
 * @example parseIsraeliDate(45963) => '2025-11-08' (Excel serial date)
 * @example parseIsraeliDate(new Date()) => '2026-01-27'
 */
export function parseIsraeliDate(dateStr: string | Date | number): string | null {
  // Handle null/undefined
  if (dateStr == null) {
    return null;
  }

  // Handle Excel serial dates (numbers > 25000 are likely Excel dates)
  // Excel serial date: days since 1899-12-30
  if (typeof dateStr === 'number' && dateStr > 25000) {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + dateStr * 86400000);
    return dayjs(jsDate).format('YYYY-MM-DD');
  }

  // Handle Date objects
  if (dateStr instanceof Date) {
    return dayjs(dateStr).format('YYYY-MM-DD');
  }

  // Handle string formats
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();

    // Try each format
    for (const format of DATE_FORMATS) {
      const parsed = dayjs(trimmed, format, true); // strict parsing
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }
  }

  return null;
}
