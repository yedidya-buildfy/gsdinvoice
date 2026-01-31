/**
 * Centralized date formatting utilities
 * Use these instead of creating local formatDate functions in components
 */

/**
 * Format a date string for display (DD/MM/YY format)
 * Handles null/undefined safely
 */
export function formatDisplayDate(dateStr: string | null | undefined, locale: 'he-IL' | 'en-GB' = 'en-GB'): string {
  if (!dateStr) return '-'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return '-'
  }
}

/**
 * Format a date string for display with full year (DD/MM/YYYY format)
 */
export function formatDisplayDateFull(dateStr: string | null | undefined, locale: 'he-IL' | 'en-GB' = 'en-GB'): string {
  if (!dateStr) return '-'
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return '-'
  }
}

/**
 * Get timestamp for sorting (returns 0 for null/undefined)
 */
export function getDateTimestamp(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const time = new Date(dateStr).getTime()
  return isNaN(time) ? 0 : time
}

/**
 * Calculate days between two dates
 */
export function getDateDiffInDays(date1: string | null | undefined, date2: string | null | undefined): number {
  if (!date1 || !date2) return 0
  const d1 = new Date(date1).getTime()
  const d2 = new Date(date2).getTime()
  if (isNaN(d1) || isNaN(d2)) return 0
  return Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
}
