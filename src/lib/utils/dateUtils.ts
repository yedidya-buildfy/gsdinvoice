/**
 * Date parsing utilities for Israeli date formats
 * Handles DD/MM/YYYY formats and Excel serial dates
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

// Extend dayjs with custom parse format plugin
dayjs.extend(customParseFormat);

// Supported date formats
// Israeli standard is DD/MM/YYYY but some bank exports use American M/D/YYYY
// We try both and validate the result
const DATE_FORMATS_DMY = [
  'D/M/YYYY',   // Single digit day/month (2/2/2025)
  'DD/MM/YYYY', // Double digit day/month (02/02/2025)
  'D/M/YY',     // Single digit with 2-digit year
  'DD/MM/YY',   // Double digit with 2-digit year
  'DD.MM.YYYY',
  'DD-MM-YYYY',
  'D.M.YYYY',
  'D-M-YYYY',
];

const DATE_FORMATS_MDY = [
  'M/D/YYYY',   // American format (2/13/2025 = Feb 13)
  'MM/DD/YYYY',
  'M/D/YY',
  'MM/DD/YY',
];

const DATE_FORMATS_ISO = [
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

    // Try ISO format first (unambiguous)
    for (const format of DATE_FORMATS_ISO) {
      const parsed = dayjs(trimmed, format, true);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }

    // For slash-separated dates, detect if it's DMY or MDY
    // by checking if first or second number > 12
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      const first = parseInt(slashMatch[1], 10);
      const second = parseInt(slashMatch[2], 10);

      // If first > 12, it must be day (DMY format)
      // If second > 12, it must be day (MDY format)
      // If both <= 12, try DMY first (Israeli standard)
      const formatsToTry =
        second > 12
          ? DATE_FORMATS_MDY // Second number > 12, must be MDY (M/D/YYYY)
          : first > 12
            ? DATE_FORMATS_DMY // First number > 12, must be DMY (D/M/YYYY)
            : [...DATE_FORMATS_DMY, ...DATE_FORMATS_MDY]; // Ambiguous, try DMY first

      for (const format of formatsToTry) {
        const parsed = dayjs(trimmed, format, true);
        if (parsed.isValid()) {
          return parsed.format('YYYY-MM-DD');
        }
      }
    }

    // Try other DMY formats (dot, dash separated)
    for (const format of DATE_FORMATS_DMY) {
      const parsed = dayjs(trimmed, format, true);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }
  }

  return null;
}
