/**
 * Line Item to Transaction Scoring Algorithm
 *
 * Scores potential matches between invoice line items and transactions using:
 * - Reference matching (0-10 points) - OPTIONAL, only if both sides have reference data
 * - Amount matching (0-30 points)
 * - Date matching (0-30 points)
 * - Vendor matching (0-25 points)
 * - Currency matching (0-5 points)
 *
 * Maximum raw score: 100 points (90 without reference), normalized to 0-100
 * When reference data is missing, the score is normalized using only the other signals.
 */

import { TRANSACTION_TYPE } from '@/constants'
import type { Transaction, InvoiceRow, Invoice, VendorAlias } from '@/types/database'
import { convertToILS, createConversionDetails, type ConversionDetails } from '../exchangeRates'

// =============================================================================
// Types
// =============================================================================

/**
 * Breakdown of match score by signal type
 */
export interface ScoreBreakdown {
  reference: number  // 0-10
  amount: number     // 0-30
  date: number       // 0-30
  vendor: number     // 0-25 (no penalties)
  currency: number   // 0-5
}

/**
 * Penalties applied to the score
 */
interface ScorePenalties {
  vendorMismatch: number  // Always 0 (penalties removed)
}

/**
 * Complete match score with breakdown and metadata
 */
export interface MatchScore {
  /** Normalized score 0-100 */
  total: number
  /** Raw points before normalization (0-100) */
  rawTotal: number
  /** Score breakdown by signal type */
  breakdown: ScoreBreakdown
  /** Penalties applied */
  penalties: ScorePenalties
  /** Human-readable reasons for match */
  matchReasons: string[]
  /** Warnings about potential issues */
  warnings: string[]
  /** Whether this transaction is disqualified from matching */
  isDisqualified: boolean
  /** Reason for disqualification if applicable */
  disqualifyReason?: string
  /** Currency conversion details if cross-currency matching was used */
  conversionDetails?: ConversionDetails
}

/**
 * Context needed for scoring a match
 */
export interface ScoringContext {
  /** The line item to match */
  lineItem: InvoiceRow
  /** The parent invoice (for vendor name, invoice date, etc.) - partial invoice data is accepted */
  invoice: Partial<Invoice> | null
  /** Extracted data from the invoice file (for billing period, line item references, etc.) */
  extractedData: ExtractedInvoiceData | null
  /** User's vendor aliases for vendor matching */
  vendorAliases: VendorAlias[]
  /** Exchange rates for cross-currency conversion (key: currency code, value: { rate, rateDate }) */
  exchangeRates?: Map<string, { rate: number; rateDate: string }>
}

/**
 * Structure of extracted invoice data (from files.extracted_data)
 */
export interface ExtractedInvoiceData {
  document?: {
    billing_period?: {
      start?: string | null
      end?: string | null
    }
  }
  line_items?: Array<{
    description?: string
    reference_id?: string
  }>
  vendor?: {
    name?: string
    vat_id?: string
  }
}

/**
 * Result of vendor matching
 */
interface VendorMatchResult {
  points: number        // 0-25
  penalty: number       // Always 0 (penalties removed)
  method: 'user_alias' | 'fuzzy' | 'none'
  confidence: number    // 0-100
  matchedAlias?: VendorAlias
  suggestAlias?: boolean
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum points for each scoring category */
export const SCORING_WEIGHTS = {
  REFERENCE: 10,  // Reduced - reference rarely matches for file-transaction linking
  AMOUNT: 30,     // Amount is key signal
  DATE: 30,       // Date proximity is important: ±1 day = full, then decay
  VENDOR: 25,     // Vendor matching is important
  CURRENCY: 5,
} as const

/** Maximum possible raw score (sum of all weights) = 100 */
export const MAX_RAW_SCORE =
  SCORING_WEIGHTS.REFERENCE +
  SCORING_WEIGHTS.AMOUNT +
  SCORING_WEIGHTS.DATE +
  SCORING_WEIGHTS.VENDOR +
  SCORING_WEIGHTS.CURRENCY

/** Max score when reference is skipped (no reference data) = 90 */
export const MAX_RAW_SCORE_NO_REF = MAX_RAW_SCORE - SCORING_WEIGHTS.REFERENCE

/** Common words to filter out from vendor name matching */
const EXCLUDED_VENDOR_WORDS = new Set([
  // Company suffixes (English)
  'inc', 'ltd', 'llc', 'corp', 'corporation', 'company', 'co',
  'gmbh', 'ag', 'sa', 'pty', 'usa', 'us', 'inc.', 'ltd.',
  'limited', 'plc', 'lp', 'llp',
  // Company suffixes (Hebrew)
  'בעמ', 'בע"מ',
  // Common noise words (Hebrew)
  'מעמ', 'עוסק', 'מורשה', 'חשבונית', 'קבלה', 'תשלום',
  // Common noise words (English)
  'payment', 'invoice', 'receipt', 'transaction', 'purchase',
  'service', 'services', 'product', 'products', 'order',
  'the', 'and', 'for', 'from',
])

/** Eligible transaction types for matching */
export const ELIGIBLE_TRANSACTION_TYPES = [
  TRANSACTION_TYPE.BANK_REGULAR,
  TRANSACTION_TYPE.CC_PURCHASE,
] as const

/** VAT rates to try when matching amounts (Israel historical rates) */
export const VAT_RATES = [0.17, 0.18, 0.16, 0.15] as const

// =============================================================================
// Main Scoring Function
// =============================================================================

/**
 * Score a transaction as a potential match for a line item
 *
 * @param transaction - The transaction to score
 * @param context - Scoring context with line item, invoice, and aliases
 * @returns Complete match score with breakdown
 */
export function scoreMatch(
  transaction: Transaction,
  context: ScoringContext
): MatchScore {
  const { lineItem, invoice, extractedData, vendorAliases, exchangeRates } = context

  // Initialize score object
  const score: MatchScore = {
    total: 0,
    rawTotal: 0,
    breakdown: {
      reference: 0,
      amount: 0,
      date: 0,
      vendor: 0,
      currency: 0,
    },
    penalties: {
      vendorMismatch: 0,
    },
    matchReasons: [],
    warnings: [],
    isDisqualified: false,
  }

  // ========================================
  // HARD DISQUALIFIERS
  // ========================================

  // Income/Expense mismatch - only match expenses
  if (transaction.is_income === true) {
    score.isDisqualified = true
    score.disqualifyReason = 'Transaction is income, but matching expenses only'
    return score
  }

  // Wrong transaction type - only bank_regular and cc_purchase
  if (!ELIGIBLE_TRANSACTION_TYPES.includes(transaction.transaction_type as typeof ELIGIBLE_TRANSACTION_TYPES[number])) {
    score.isDisqualified = true
    score.disqualifyReason = `Transaction type '${transaction.transaction_type}' not eligible for matching`
    return score
  }

  // Income invoice - don't match expense transactions to income invoice line items
  if (invoice?.is_income === true) {
    score.isDisqualified = true
    score.disqualifyReason = 'Line item is from an income invoice, cannot match to expense transaction'
    return score
  }

  // ========================================
  // REFERENCE MATCHING (0-10 points) - OPTIONAL
  // Skip if no reference data available on either side
  // ========================================
  const hasReferenceData = hasReference(lineItem, transaction, extractedData)
  if (hasReferenceData) {
    score.breakdown.reference = scoreReference(lineItem, transaction, extractedData)
    if (score.breakdown.reference > 0) {
      if (score.breakdown.reference === SCORING_WEIGHTS.REFERENCE) {
        score.matchReasons.push('Exact reference match')
      } else if (score.breakdown.reference >= 8) {
        score.matchReasons.push('Reference found in description')
      } else {
        score.matchReasons.push('Partial reference match')
      }
    }
  }

  // ========================================
  // AMOUNT MATCHING (0-30 points)
  // ========================================
  const lineItemDate = lineItem.transaction_date || invoice?.invoice_date
  const amountResult = scoreAmount(lineItem, transaction, exchangeRates, lineItemDate)
  score.breakdown.amount = amountResult.points
  if (amountResult.points > 0) {
    score.matchReasons.push(amountResult.reason)
  }
  if (amountResult.warning) {
    score.warnings.push(amountResult.warning)
  }
  if (amountResult.conversionDetails) {
    score.conversionDetails = amountResult.conversionDetails
  }

  // ========================================
  // DATE MATCHING (0-30 points)
  // ========================================
  const dateResult = scoreDate(lineItem, invoice, transaction)
  score.breakdown.date = dateResult.points
  if (dateResult.points > 0 && dateResult.reason) {
    score.matchReasons.push(dateResult.reason)
  }
  if (dateResult.warning) {
    score.warnings.push(dateResult.warning)
  }

  // ========================================
  // VENDOR MATCHING (0-25 points, no penalties)
  // ========================================
  const vendorResult = scoreVendor(lineItem, invoice, transaction, vendorAliases)
  score.breakdown.vendor = vendorResult.points
  score.penalties.vendorMismatch = vendorResult.penalty

  if (vendorResult.points > 0) {
    score.matchReasons.push(`Vendor match (${vendorResult.method})`)
  }
  if (vendorResult.penalty < 0) {
    score.warnings.push(`Vendor mismatch penalty: ${vendorResult.penalty}`)
  }

  // ========================================
  // CURRENCY MATCHING (0-5 points)
  // ========================================
  score.breakdown.currency = scoreCurrency(lineItem, transaction)
  if (score.breakdown.currency === SCORING_WEIGHTS.CURRENCY) {
    score.matchReasons.push('Currency match')
  }

  // ========================================
  // CALCULATE TOTAL
  // ========================================
  score.rawTotal =
    score.breakdown.reference +
    score.breakdown.amount +
    score.breakdown.date +
    score.breakdown.vendor +
    score.breakdown.currency +
    score.penalties.vendorMismatch

  // Dynamic max score: exclude REFERENCE weight if reference score is 0
  // (either no reference data available, or no match found)
  const effectiveMaxScore = score.breakdown.reference > 0 ? MAX_RAW_SCORE : MAX_RAW_SCORE_NO_REF

  // Normalize to 0-100
  score.total = Math.max(0, Math.min(100, Math.round((score.rawTotal / effectiveMaxScore) * 100)))

  return score
}

// =============================================================================
// Individual Scoring Functions
// =============================================================================

/**
 * Check if reference data is available on the line item
 * Returns true only if line item has a reference_id to match against
 */
function hasReference(
  lineItem: InvoiceRow,
  _transaction: Transaction,
  extractedData: ExtractedInvoiceData | null
): boolean {
  // Check line item reference
  let lineItemRef = lineItem.reference_id

  // If no reference on line item, try to find it in extracted data
  if (!lineItemRef && extractedData?.line_items) {
    const matchingExtractedItem = extractedData.line_items.find(
      li => li.description === lineItem.description
    )
    lineItemRef = matchingExtractedItem?.reference_id || null
  }

  // Only consider reference scoring if line item has a reference ID
  return !!lineItemRef
}

/**
 * Score reference matching (0-10 points)
 * Only called when hasReference() returns true
 *
 * Points breakdown:
 * - 10: Exact match in transaction.reference field
 * - 8: Reference found in transaction.description
 * - 5: Partial reference match (last 6 digits)
 * - 0: No reference match
 */
export function scoreReference(
  lineItem: InvoiceRow,
  transaction: Transaction,
  extractedData: ExtractedInvoiceData | null
): number {
  // Try to get reference from line item or extracted data
  let refId = lineItem.reference_id

  // If no reference on line item, try to find it in extracted data
  if (!refId && extractedData?.line_items) {
    const matchingExtractedItem = extractedData.line_items.find(
      li => li.description === lineItem.description
    )
    refId = matchingExtractedItem?.reference_id || null
  }

  if (!refId) return 0

  // Check exact match in transaction.reference field
  if (transaction.reference && transaction.reference === refId) {
    return SCORING_WEIGHTS.REFERENCE // 10 points
  }

  // Check if reference is found in transaction.description
  const desc = (transaction.description || '').toUpperCase()
  const ref = refId.toUpperCase()

  if (desc.includes(ref)) {
    return 8 // Reference found in description
  }

  // Check partial reference match (last 6 digits for longer references)
  if (refId.length > 6) {
    const lastSix = ref.slice(-6)
    if (desc.includes(lastSix)) {
      return 5 // Partial reference match
    }
  }

  return 0
}

/**
 * Score amount matching (0-30 points)
 *
 * Strategy: Convert everything to ILS for comparison using BOI exchange rates.
 * This handles all currency combinations: ILS↔USD, ILS↔EUR, USD↔EUR, etc.
 *
 * Cross-currency thresholds (with conversion - more forgiving for bank markup):
 * - 30: Within 3%
 * - 25: Within 6%
 * - 20: Within 9%
 * - 10: Within 15%
 * - 5: Within 20%
 * - 0: >20%
 *
 * Same-currency thresholds (stricter):
 * - 30: Exact match
 * - 27: Within 1%
 * - 24: Within 2%
 * - 20: Within 3% or VAT-adjusted match (17%)
 * - 16: Within 5% or VAT-adjusted match (18%)
 * - 8: Within 10%
 * - 0: >10%
 *
 * NOTE: All amounts are stored as integers in smallest currency unit:
 * - ILS: agorot (1 ILS = 100 agorot)
 * - USD/EUR: cents (stored in total_agorot field for line items, foreign_amount_cents for transactions)
 */
export function scoreAmount(
  lineItem: InvoiceRow,
  transaction: Transaction,
  exchangeRates?: Map<string, { rate: number; rateDate: string }>,
  lineItemDate?: string | null
): { points: number; reason: string; warning?: string; conversionDetails?: ConversionDetails } {
  const lineCurrency = (lineItem.currency || 'ILS').toUpperCase()
  const lineAmount = Math.abs(lineItem.total_agorot || 0)

  // Determine transaction currency and amount
  // If transaction has foreign_amount_cents, it's a foreign currency transaction
  // Otherwise treat it as ILS
  const hasForeignAmount = transaction.foreign_amount_cents != null && transaction.foreign_amount_cents !== 0
  const txCurrency = hasForeignAmount && transaction.foreign_currency
    ? transaction.foreign_currency.toUpperCase()
    : 'ILS'
  const txAmountNative = hasForeignAmount
    ? Math.abs(transaction.foreign_amount_cents!)
    : Math.abs(transaction.amount_agorot)

  if (lineAmount === 0) {
    return { points: 0, reason: '', warning: 'Line item amount is zero' }
  }

  if (txAmountNative === 0) {
    return { points: 0, reason: '', warning: 'Transaction amount is zero' }
  }

  // STRATEGY: Convert both amounts to ILS for comparison
  let lineAmountILS: number
  let txAmountILS: number
  let conversionDetails: ConversionDetails | undefined
  let conversionUsed = false
  const requestedDate = lineItemDate || new Date().toISOString().split('T')[0]

  // Convert line item amount to ILS
  if (lineCurrency === 'ILS') {
    lineAmountILS = lineAmount
  } else {
    const lineRateInfo = exchangeRates?.get(lineCurrency)
    if (lineRateInfo) {
      lineAmountILS = convertToILS(lineAmount, lineCurrency, lineRateInfo.rate)
      conversionUsed = true
      // We'll set conversionDetails later if this is the primary conversion
    } else {
      // No rate for line item currency - can't convert
      return {
        points: 8,
        reason: 'Cross-currency (no rate for line item)',
        warning: `Exchange rate unavailable for ${lineCurrency}`,
      }
    }
  }

  // Convert transaction amount to ILS
  if (txCurrency === 'ILS') {
    txAmountILS = txAmountNative
  } else {
    const txRateInfo = exchangeRates?.get(txCurrency)
    if (txRateInfo) {
      txAmountILS = convertToILS(txAmountNative, txCurrency, txRateInfo.rate)
      conversionUsed = true

      // Create conversion details for display (show the transaction conversion)
      conversionDetails = createConversionDetails(
        txAmountNative,
        txCurrency,
        txAmountILS,
        txRateInfo.rate,
        txRateInfo.rateDate,
        requestedDate
      )
    } else {
      // No rate for transaction currency - can't convert
      return {
        points: 8,
        reason: 'Cross-currency (no rate for transaction)',
        warning: `Exchange rate unavailable for ${txCurrency}`,
      }
    }
  }

  // If line item was converted (and not transaction), show that conversion instead
  if (lineCurrency !== 'ILS' && txCurrency === 'ILS') {
    const lineRateInfo = exchangeRates?.get(lineCurrency)
    if (lineRateInfo) {
      conversionDetails = createConversionDetails(
        lineAmount,
        lineCurrency,
        lineAmountILS,
        lineRateInfo.rate,
        lineRateInfo.rateDate,
        requestedDate
      )
    }
  }

  // Now compare ILS amounts
  const diff = Math.abs(lineAmountILS - txAmountILS)
  const percentDiff = lineAmountILS > 0 ? (diff / lineAmountILS) * 100 : 100

  const conversionNote = conversionUsed
    ? ` (via ${lineCurrency !== 'ILS' ? lineCurrency : txCurrency}→ILS conversion)`
    : ''

  // Use different thresholds for conversion vs same-currency
  if (conversionUsed) {
    // Cross-currency thresholds (more forgiving due to bank markup variance)
    // 0-3%: 30 points, 3-6%: 25, 6-9%: 20, 9-15%: 10, 15-20%: 5, >20%: 0
    if (percentDiff <= 3) {
      return {
        points: 30,
        reason: `Amount within 3%${conversionNote}`,
        conversionDetails,
      }
    }
    if (percentDiff <= 6) {
      return {
        points: 25,
        reason: `Amount within 6%${conversionNote}`,
        conversionDetails,
      }
    }
    if (percentDiff <= 9) {
      return {
        points: 20,
        reason: `Amount within 9%${conversionNote}`,
        conversionDetails,
      }
    }
    if (percentDiff <= 15) {
      return {
        points: 10,
        reason: `Amount within 15%${conversionNote}`,
        warning: `Amount differs by ${percentDiff.toFixed(1)}%`,
        conversionDetails,
      }
    }
    if (percentDiff <= 20) {
      return {
        points: 5,
        reason: `Amount within 20%${conversionNote}`,
        warning: `Amount differs by ${percentDiff.toFixed(1)}%`,
        conversionDetails,
      }
    }
    return {
      points: 0,
      reason: '',
      warning: `Amount differs by ${percentDiff.toFixed(1)}%${conversionNote}`,
      conversionDetails,
    }
  }

  // Same-currency thresholds (stricter)
  // Exact match
  if (diff === 0) {
    return {
      points: SCORING_WEIGHTS.AMOUNT, // 30 points
      reason: 'Exact amount match',
      conversionDetails,
    }
  }

  // Within 1%
  if (percentDiff <= 1) {
    return {
      points: 27,
      reason: 'Amount within 1%',
      conversionDetails,
    }
  }

  // Within 2%
  if (percentDiff <= 2) {
    return {
      points: 24,
      reason: 'Amount within 2%',
      conversionDetails,
    }
  }

  // Within 3%
  if (percentDiff <= 3) {
    return {
      points: 20,
      reason: 'Amount within 3%',
      conversionDetails,
    }
  }

  // VAT-adjusted matching (only for same-currency)
  const vatResult = tryVatAdjustedMatch(lineAmountILS, txAmountILS)
  if (vatResult) {
    return {
      points: vatResult.points,
      reason: vatResult.reason,
      conversionDetails,
    }
  }

  // Within 5%
  if (percentDiff <= 5) {
    return {
      points: 16,
      reason: 'Amount within 5%',
      conversionDetails,
    }
  }

  // Within 10%
  if (percentDiff <= 10) {
    return {
      points: 8,
      reason: 'Amount within 10%',
      warning: `Amount differs by ${percentDiff.toFixed(1)}%`,
      conversionDetails,
    }
  }

  return {
    points: 0,
    reason: '',
    warning: `Amount differs by ${percentDiff.toFixed(1)}%`,
    conversionDetails,
  }
}

/**
 * Try VAT-adjusted amount matching
 */
function tryVatAdjustedMatch(
  lineAmount: number,
  txAmount: number
): { points: number; reason: string } | null {
  for (const rate of VAT_RATES) {
    // Try adding VAT
    const withVat = lineAmount * (1 + rate)
    if (Math.abs(txAmount - withVat) <= lineAmount * 0.02) {
      const vatPercent = (rate * 100).toFixed(0)
      return {
        points: rate === 0.17 ? 20 : 16,
        reason: `Amount matches with ${vatPercent}% VAT added`,
      }
    }

    // Try removing VAT
    const withoutVat = lineAmount / (1 + rate)
    if (Math.abs(txAmount - withoutVat) <= lineAmount * 0.02) {
      const vatPercent = (rate * 100).toFixed(0)
      return {
        points: rate === 0.17 ? 20 : 16,
        reason: `Amount matches with ${vatPercent}% VAT removed`,
      }
    }
  }

  return null
}

/**
 * Parse a date string (YYYY-MM-DD) into a day number for comparison.
 * This avoids timezone issues by working directly with the date components.
 * Returns the number of days since epoch (1970-01-01) in local calendar terms.
 */
function parseDateToDayNumber(dateStr: string): number {
  // Parse YYYY-MM-DD format directly to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number)
  // Use UTC to avoid any timezone shifts
  return Math.floor(Date.UTC(year, month - 1, day) / (1000 * 60 * 60 * 24))
}

/**
 * Score date matching (0-30 points)
 * Aggressive decay for date proximity
 *
 * Points breakdown:
 * - 30: Exact match OR ±1 day (full points)
 * - 25: ±2 days
 * - 22: 3 days apart
 * - 19: 4 days apart
 * - 16: 5 days apart
 * - 13: 6 days apart
 * - 10: 7 days apart
 * - 7: 8 days apart
 * - 4: 9 days apart
 * - 1: 10 days apart
 * - 0: 11+ days apart
 */
export function scoreDate(
  lineItem: InvoiceRow,
  invoice: Partial<Invoice> | null,
  transaction: Transaction
): { points: number; reason?: string; warning?: string } {
  // Get line item date (prefer transaction_date, fall back to invoice_date)
  const lineDate = lineItem.transaction_date || invoice?.invoice_date

  if (!lineDate) {
    // No date available - give partial credit (half the max)
    return { points: 15, reason: 'No date available on line item' }
  }

  // Use day numbers to avoid timezone issues when comparing dates
  const lineDayNum = parseDateToDayNumber(lineDate)
  const txDayNum = parseDateToDayNumber(transaction.date)
  const valueDayNum = transaction.value_date ? parseDateToDayNumber(transaction.value_date) : null

  // Calculate days difference for both dates
  const dateDiff = Math.abs(txDayNum - lineDayNum)
  const valueDateDiff = valueDayNum !== null ? Math.abs(valueDayNum - lineDayNum) : Infinity

  // Use the closer date
  const daysDiff = Math.min(dateDiff, valueDateDiff)


  // Exact match or ±1 day: full 30 points
  if (daysDiff <= 1) {
    return {
      points: SCORING_WEIGHTS.DATE, // 30 points
      reason: daysDiff === 0 ? 'Same day' : '1 day apart'
    }
  }

  // ±2 days: 25 points
  if (daysDiff === 2) {
    return { points: 25, reason: '2 days apart' }
  }

  // 3-10 days: -3 points per day after 2 days
  // Formula: 25 - 3 * (daysDiff - 2)
  // 3 days: 25 - 3 = 22
  // 4 days: 25 - 6 = 19
  // ...
  // 10 days: 25 - 24 = 1
  if (daysDiff <= 10) {
    const points = 25 - 3 * (daysDiff - 2)
    return {
      points,
      reason: `${daysDiff} days apart`
    }
  }

  // More than 10 days apart - no points
  return {
    points: 0,
    warning: `Date differs by ${daysDiff} days (>10 days)`,
  }
}

/**
 * Score currency matching (0-5 points)
 *
 * Points breakdown:
 * - 5: Currency matches (either ILS-ILS or foreign currency matches)
 * - 0: Currency mismatch
 */
export function scoreCurrency(
  lineItem: InvoiceRow,
  transaction: Transaction
): number {
  const lineCurrency = lineItem.currency || 'ILS'

  // Check if transaction has foreign currency that matches
  if (transaction.foreign_currency === lineCurrency) {
    return SCORING_WEIGHTS.CURRENCY // 5 points
  }

  // If line item is ILS and transaction is ILS (no foreign currency)
  if (lineCurrency === 'ILS' && !transaction.foreign_currency) {
    return SCORING_WEIGHTS.CURRENCY // 5 points
  }

  // Currency mismatch but not disqualifying
  return 0
}

// =============================================================================
// Vendor Matching (2-Tier: User Aliases + Word-Based)
// =============================================================================

/**
 * Score word-based matches between vendor name + line item description and transaction description
 * Uses alias expansion to add canonical name tokens to transaction tokens
 *
 * @param vendorName - The vendor name from the invoice
 * @param lineItemDescription - The line item description (adds more matchable words)
 * @param txDescription - The raw transaction description
 * @param userAliases - User's vendor aliases for token expansion
 * @returns Count of exact word matches and fuzzy word matches
 */
function scoreWordMatches(
  vendorName: string,
  lineItemDescription: string,
  txDescription: string,
  userAliases: VendorAlias[]
): {
  exactWordMatches: number
  fuzzyWordMatches: number
} {
  // Tokenize function - extracts meaningful words
  const tokenize = (s: string): string[] => {
    return s
      .toLowerCase()
      .replace(/[^\w\s\u0590-\u05FF]/g, ' ') // Keep Hebrew, remove punctuation
      .split(/\s+/)
      .filter(t => t.length > 2 && !EXCLUDED_VENDOR_WORDS.has(t))
  }

  // Get tokens from vendor name AND line item description (combined)
  const vendorTokens = new Set([
    ...tokenize(vendorName),
    ...tokenize(lineItemDescription)
  ])

  // Get tokens from transaction description
  const txTokens = new Set(tokenize(txDescription))

  // EXPAND tx tokens using aliases
  // For each alias, check if transaction description matches the pattern
  // If so, add the canonical name's tokens to the tx token set
  const txDescLower = txDescription.toLowerCase()
  for (const alias of userAliases) {
    const pattern = alias.alias_pattern.toLowerCase()

    let matches = false
    switch (alias.match_type) {
      case 'exact':
        matches = txDescLower === pattern
        break
      case 'starts_with':
        matches = txDescLower.startsWith(pattern)
        break
      case 'ends_with':
        matches = txDescLower.endsWith(pattern)
        break
      case 'contains':
      default:
        matches = txDescLower.includes(pattern)
        break
    }

    if (matches) {
      // Add canonical name tokens to tx tokens
      const canonicalTokens = tokenize(alias.canonical_name)
      for (const t of canonicalTokens) {
        txTokens.add(t)
      }
    }
  }

  // Now compare vendor tokens against expanded tx tokens
  let exactWordMatches = 0
  let fuzzyWordMatches = 0

  for (const vToken of vendorTokens) {
    // Check exact match
    if (txTokens.has(vToken)) {
      exactWordMatches++
      continue
    }

    // Check fuzzy match (one contains the other, min 3 chars)
    for (const tToken of txTokens) {
      if (vToken.length >= 3 && tToken.length >= 3) {
        if (vToken.includes(tToken) || tToken.includes(vToken)) {
          fuzzyWordMatches++
          break
        }
      }
    }
  }

  return { exactWordMatches, fuzzyWordMatches }
}

/**
 * Score vendor matching (0-25 points, NO penalties)
 *
 * Combines vendor name + line item description for more matching opportunities.
 * Expands transaction tokens using aliases (e.g., "FACEBK" → "Meta", "Facebook").
 * Excludes common noise words (see EXCLUDED_VENDOR_WORDS) from matching.
 *
 * Points breakdown:
 * - 25: User alias match OR 2+ significant words match
 * - 20: Exactly 1 significant word matches (~80%)
 * - 18: Fuzzy match on 1+ words (~70%)
 * - 0: No match (NO PENALTY)
 */
export function scoreVendor(
  lineItem: InvoiceRow,
  invoice: Partial<Invoice> | null,
  transaction: Transaction,
  userAliases: VendorAlias[]
): VendorMatchResult {
  const vendorName = invoice?.vendor_name || ''
  const lineItemDesc = lineItem.description || ''
  const txDescription = transaction.description || ''

  // Need at least one of vendor name or line item description
  if ((!vendorName && !lineItemDesc) || !txDescription) {
    return { points: 0, penalty: 0, method: 'none', confidence: 0 }
  }

  // TIER 1: User aliases (highest priority - full points)
  // Check if raw description matches an alias that maps to the vendor or line item
  const matchTarget = vendorName || lineItemDesc
  const userAliasMatch = checkUserAliases(matchTarget, txDescription, userAliases)
  if (userAliasMatch) {
    return {
      points: SCORING_WEIGHTS.VENDOR, // 25 points
      penalty: 0,
      method: 'user_alias',
      confidence: 95,
      matchedAlias: userAliasMatch.alias,
    }
  }

  // TIER 2: Word-based matching with alias expansion
  // This combines vendor name + line item description tokens,
  // and expands tx description using aliases (e.g., "FACEBK" adds "meta", "facebook")
  const wordMatchResult = scoreWordMatches(vendorName, lineItemDesc, txDescription, userAliases)

  if (wordMatchResult.exactWordMatches >= 2) {
    // 2+ words match = full score
    return {
      points: SCORING_WEIGHTS.VENDOR, // 25 points
      penalty: 0,
      method: 'fuzzy',
      confidence: 90,
      suggestAlias: false,
    }
  }

  if (wordMatchResult.exactWordMatches === 1) {
    // 1 word matches = 20 points (~80%)
    return {
      points: 20,
      penalty: 0,
      method: 'fuzzy',
      confidence: 80,
      suggestAlias: true,
    }
  }

  if (wordMatchResult.fuzzyWordMatches >= 1) {
    // Fuzzy match on 1+ words = 18 points (~70%)
    return {
      points: 18,
      penalty: 0,
      method: 'fuzzy',
      confidence: 70,
      suggestAlias: true,
    }
  }

  // No match - 0 points, NO PENALTY
  return {
    points: 0,
    penalty: 0,  // REMOVED the -5/-10 penalty
    method: 'none',
    confidence: 0,
    suggestAlias: true,
  }
}

/**
 * Check user aliases for a match
 */
function checkUserAliases(
  vendorName: string,
  txDescription: string,
  aliases: VendorAlias[]
): { canonical: string; alias: VendorAlias } | null {
  const normalizedVendor = vendorName.toLowerCase().trim()
  const normalizedTx = txDescription.toUpperCase().trim()

  // Sort by priority (higher first)
  const sortedAliases = [...aliases].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const alias of sortedAliases) {
    const pattern = alias.alias_pattern.toUpperCase()
    let patternMatches = false

    switch (alias.match_type) {
      case 'exact':
        patternMatches = normalizedTx === pattern
        break
      case 'starts_with':
        patternMatches = normalizedTx.startsWith(pattern)
        break
      case 'ends_with':
        patternMatches = normalizedTx.endsWith(pattern)
        break
      case 'contains':
      default:
        patternMatches = normalizedTx.includes(pattern)
    }

    if (patternMatches) {
      // Check if canonical matches the vendor name
      const canonical = alias.canonical_name.toLowerCase()
      if (normalizedVendor.includes(canonical) || canonical.includes(normalizedVendor)) {
        return { canonical: alias.canonical_name, alias }
      }
    }
  }

  return null
}