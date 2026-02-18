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

