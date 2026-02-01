/**
 * Line Item to Transaction Scoring Algorithm
 *
 * Scores potential matches between invoice line items and transactions using:
 * - Reference matching (0-45 points)
 * - Amount matching (0-25 points)
 * - Date matching (0-15 points)
 * - Vendor matching (0-15 points, handled separately in vendorMatcher)
 * - Currency matching (0-5 points)
 * - Context signals (0-5 points)
 *
 * Maximum raw score: 110 points, normalized to 0-100
 */

import { TRANSACTION_TYPE } from '@/constants'
import type { Transaction, InvoiceRow, Invoice, VendorAlias } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

/**
 * Breakdown of match score by signal type
 */
export interface ScoreBreakdown {
  reference: number  // 0-45
  amount: number     // 0-25
  date: number       // 0-15
  vendor: number     // 0-15 (can be negative with penalty)
  currency: number   // 0-5
  context: number    // 0-5
}

/**
 * Penalties applied to the score
 */
export interface ScorePenalties {
  vendorMismatch: number  // 0 to -10
}

/**
 * Complete match score with breakdown and metadata
 */
export interface MatchScore {
  /** Normalized score 0-100 */
  total: number
  /** Raw points before normalization (0-110) */
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
export interface VendorMatchResult {
  points: number        // 0-15
  penalty: number       // 0 to -10
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
  REFERENCE: 45,
  AMOUNT: 25,
  DATE: 15,
  VENDOR: 15,
  CURRENCY: 5,
  CONTEXT: 5,
} as const

/** Maximum possible raw score (sum of all weights) */
export const MAX_RAW_SCORE =
  SCORING_WEIGHTS.REFERENCE +
  SCORING_WEIGHTS.AMOUNT +
  SCORING_WEIGHTS.DATE +
  SCORING_WEIGHTS.VENDOR +
  SCORING_WEIGHTS.CURRENCY +
  SCORING_WEIGHTS.CONTEXT  // = 110

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
  const { lineItem, invoice, extractedData, vendorAliases } = context

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
      context: 0,
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
  // REFERENCE MATCHING (0-45 points)
  // ========================================
  score.breakdown.reference = scoreReference(lineItem, transaction, extractedData)
  if (score.breakdown.reference > 0) {
    if (score.breakdown.reference === SCORING_WEIGHTS.REFERENCE) {
      score.matchReasons.push('Exact reference match')
    } else if (score.breakdown.reference >= 40) {
      score.matchReasons.push('Reference found in description')
    } else {
      score.matchReasons.push('Partial reference match')
    }
  }

  // ========================================
  // AMOUNT MATCHING (0-25 points)
  // ========================================
  const amountResult = scoreAmount(lineItem, transaction)
  score.breakdown.amount = amountResult.points
  if (amountResult.points > 0) {
    score.matchReasons.push(amountResult.reason)
  }
  if (amountResult.warning) {
    score.warnings.push(amountResult.warning)
  }

  // ========================================
  // DATE MATCHING (0-15 points)
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
  // VENDOR MATCHING (0-15 points, -5 to -10 penalty)
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
  // CONTEXT SIGNALS (0-5 points)
  // ========================================
  const contextResult = scoreContext(lineItem, invoice, extractedData, transaction)
  score.breakdown.context = contextResult.points
  if (contextResult.reasons.length > 0) {
    score.matchReasons.push(...contextResult.reasons)
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
    score.breakdown.context +
    score.penalties.vendorMismatch

  // Normalize to 0-100
  score.total = Math.max(0, Math.min(100, Math.round((score.rawTotal / MAX_RAW_SCORE) * 100)))

  return score
}

// =============================================================================
// Individual Scoring Functions
// =============================================================================

/**
 * Score reference matching (0-45 points)
 *
 * Points breakdown:
 * - 45: Exact match in transaction.reference field
 * - 40: Reference found in transaction.description
 * - 25: Partial reference match (last 6 digits)
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
    return SCORING_WEIGHTS.REFERENCE // 45 points
  }

  // Check if reference is found in transaction.description
  const desc = (transaction.description || '').toUpperCase()
  const ref = refId.toUpperCase()

  if (desc.includes(ref)) {
    return 40 // Reference found in description
  }

  // Check partial reference match (last 6 digits for longer references)
  if (refId.length > 6) {
    const lastSix = ref.slice(-6)
    if (desc.includes(lastSix)) {
      return 25 // Partial reference match
    }
  }

  return 0
}

/**
 * Score amount matching (0-25 points)
 *
 * Points breakdown:
 * - 25: Exact match
 * - 22: Within 1%
 * - 18: Within 2%
 * - 15: VAT-adjusted match (17%)
 * - 12: VAT-adjusted match (18%) or within 5%
 * - 5: Within 10%
 * - 0: No match
 *
 * NOTE: All amounts are stored as integers in smallest currency unit:
 * - ILS: agorot (1 ILS = 100 agorot)
 * - USD/EUR: cents
 */
export function scoreAmount(
  lineItem: InvoiceRow,
  transaction: Transaction
): { points: number; reason: string; warning?: string } {
  const lineCurrency = lineItem.currency || 'ILS'
  const lineAmount = Math.abs(lineItem.total_agorot || 0)

  // Transaction amount is always in ILS (agorot)
  const txAmountILS = Math.abs(transaction.amount_agorot)

  if (lineAmount === 0 || txAmountILS === 0) {
    return { points: 0, reason: '', warning: 'Amount is zero' }
  }

  // Determine which amount to compare based on currency
  let txAmountToCompare: number

  if (lineCurrency === 'ILS') {
    // Line item is ILS - compare directly with transaction ILS amount
    txAmountToCompare = txAmountILS
  } else if (
    transaction.foreign_currency === lineCurrency &&
    transaction.foreign_amount_cents
  ) {
    // Line item is foreign currency and transaction has matching foreign currency
    txAmountToCompare = Math.abs(transaction.foreign_amount_cents)
  } else {
    // Currency mismatch - can't directly compare
    return {
      points: 0,
      reason: '',
      warning: `Currency mismatch: line item is ${lineCurrency}, transaction is ILS`,
    }
  }

  const diff = Math.abs(lineAmount - txAmountToCompare)
  const percentDiff = (diff / lineAmount) * 100

  // Exact match
  if (diff === 0) {
    return { points: SCORING_WEIGHTS.AMOUNT, reason: 'Exact amount match' } // 25 points
  }

  // Within 1%
  if (percentDiff <= 1) {
    return { points: 22, reason: 'Amount within 1%' }
  }

  // Within 2%
  if (percentDiff <= 2) {
    return { points: 18, reason: 'Amount within 2%' }
  }

  // Within 5%
  if (percentDiff <= 5) {
    return { points: 12, reason: 'Amount within 5%' }
  }

  // VAT-adjusted matching (only for ILS comparisons)
  if (lineCurrency === 'ILS') {
    const vatResult = tryVatAdjustedMatch(lineAmount, txAmountToCompare)
    if (vatResult) {
      return {
        points: vatResult.points,
        reason: vatResult.reason,
      }
    }
  }

  // Within 10%
  if (percentDiff <= 10) {
    return {
      points: 5,
      reason: 'Amount within 10%',
      warning: `Amount differs by ${percentDiff.toFixed(1)}%`,
    }
  }

  return {
    points: 0,
    reason: '',
    warning: `Amount differs significantly (${percentDiff.toFixed(1)}%)`,
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
        points: rate === 0.17 ? 15 : 12,
        reason: `Amount matches with ${vatPercent}% VAT added`,
      }
    }

    // Try removing VAT
    const withoutVat = lineAmount / (1 + rate)
    if (Math.abs(txAmount - withoutVat) <= lineAmount * 0.02) {
      const vatPercent = (rate * 100).toFixed(0)
      return {
        points: rate === 0.17 ? 15 : 12,
        reason: `Amount matches with ${vatPercent}% VAT removed`,
      }
    }
  }

  return null
}

/**
 * Score date matching (0-15 points)
 *
 * Points breakdown:
 * - 15: Same day
 * - 13: Within 1 day
 * - 10: Within 3 days
 * - 7: Within 5 days
 * - 5: Within 7 days (or no date available on line item)
 * - 2: Within 14 days
 * - 0: More than 14 days apart
 */
export function scoreDate(
  lineItem: InvoiceRow,
  invoice: Partial<Invoice> | null,
  transaction: Transaction
): { points: number; reason?: string; warning?: string } {
  // Get line item date (prefer transaction_date, fall back to invoice_date)
  const lineDate = lineItem.transaction_date || invoice?.invoice_date

  if (!lineDate) {
    // No date available - give partial credit
    return { points: 5, reason: 'No date available on line item' }
  }

  const lineDateObj = new Date(lineDate)
  const txDateObj = new Date(transaction.date)
  const valueDateObj = transaction.value_date ? new Date(transaction.value_date) : null

  // Calculate days difference for both dates (rounded to handle same-day comparisons)
  const dateDiff = Math.abs(
    Math.round((txDateObj.getTime() - lineDateObj.getTime()) / (1000 * 60 * 60 * 24))
  )
  const valueDateDiff = valueDateObj
    ? Math.abs(
        Math.round((valueDateObj.getTime() - lineDateObj.getTime()) / (1000 * 60 * 60 * 24))
      )
    : Infinity

  // Use the closer date
  const daysDiff = Math.min(dateDiff, valueDateDiff)

  // Same day (0 days difference)
  if (daysDiff === 0) {
    return { points: SCORING_WEIGHTS.DATE, reason: 'Same day' } // 15 points
  }

  // Within 1 day
  if (daysDiff === 1) {
    return { points: 13, reason: 'Within 1 day' }
  }

  // Within 3 days
  if (daysDiff <= 3) {
    return { points: 10, reason: `Within ${daysDiff} days` }
  }

  // Within 5 days
  if (daysDiff <= 5) {
    return { points: 7, reason: `Within ${daysDiff} days` }
  }

  // Within 7 days
  if (daysDiff <= 7) {
    return { points: 5, reason: `Within ${daysDiff} days` }
  }

  // Within 14 days
  if (daysDiff <= 14) {
    return {
      points: 2,
      reason: `Within ${daysDiff} days`,
      warning: `Date differs by ${daysDiff} days`,
    }
  }

  return {
    points: 0,
    warning: `Date differs by ${daysDiff} days (>14 days)`,
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

/**
 * Score context signals (0-5 points)
 *
 * Points breakdown:
 * - 3: Transaction date within billing period
 * - 2: Channel/merchant category hint matches
 */
export function scoreContext(
  lineItem: InvoiceRow,
  _invoice: Partial<Invoice> | null, // Reserved for future use
  extractedData: ExtractedInvoiceData | null,
  transaction: Transaction
): { points: number; reasons: string[] } {
  let points = 0
  const reasons: string[] = []

  // Billing period check
  const billingPeriod = extractedData?.document?.billing_period
  if (billingPeriod?.start && billingPeriod?.end) {
    const txDate = new Date(transaction.date)
    const periodStart = new Date(billingPeriod.start)
    const periodEnd = new Date(billingPeriod.end)

    if (txDate >= periodStart && txDate <= periodEnd) {
      points += 3
      reasons.push('Transaction within billing period')
    }
  }

  // Credit card channel hint
  if (transaction.transaction_type === TRANSACTION_TYPE.CC_PURCHASE && transaction.channel) {
    // If line item description mentions the channel/merchant category
    const desc = (lineItem.description || '').toLowerCase()
    const channel = transaction.channel.toLowerCase()

    // Check for overlap
    const descWords = desc.split(/\s+/).filter(w => w.length > 2)
    const channelWords = channel.split(/\s+/).filter(w => w.length > 2)

    const hasOverlap = descWords.some(dw =>
      channelWords.some(cw => dw.includes(cw) || cw.includes(dw))
    )

    if (hasOverlap) {
      points += 2
      reasons.push('Channel matches description')
    }
  }

  return {
    points: Math.min(SCORING_WEIGHTS.CONTEXT, points), // Cap at 5
    reasons,
  }
}

// =============================================================================
// Vendor Matching (2-Tier: User Aliases + Fuzzy)
// =============================================================================

/**
 * Score vendor matching (0-15 points, with -5 to -10 penalty)
 *
 * Points breakdown:
 * - 15: User alias match (from Settings)
 * - 15: Fuzzy match >= 80%
 * - 10: Fuzzy match 60-79%
 * - 5: Fuzzy match 40-59%
 * - 0 with -5 penalty: Fuzzy match 20-39%
 * - 0 with -10 penalty: Fuzzy match < 20%
 */
export function scoreVendor(
  lineItem: InvoiceRow,
  invoice: Partial<Invoice> | null,
  transaction: Transaction,
  userAliases: VendorAlias[]
): VendorMatchResult {
  const vendorName = invoice?.vendor_name || lineItem.description || ''
  const txDescription = transaction.description || ''

  if (!vendorName || !txDescription) {
    return {
      points: 0,
      penalty: 0,
      method: 'none',
      confidence: 0,
    }
  }

  // TIER 1: Check user aliases (from Settings - all editable)
  const userAliasMatch = checkUserAliases(vendorName, txDescription, userAliases)
  if (userAliasMatch) {
    return {
      points: SCORING_WEIGHTS.VENDOR, // 15 points
      penalty: 0,
      method: 'user_alias',
      confidence: 95,
      matchedAlias: userAliasMatch.alias,
    }
  }

  // TIER 2: Fuzzy matching (fallback)
  const fuzzyScore = fuzzyMatch(vendorName, txDescription)

  if (fuzzyScore >= 0.8) {
    return {
      points: SCORING_WEIGHTS.VENDOR, // 15 points
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: false, // Already similar enough
    }
  }

  if (fuzzyScore >= 0.6) {
    return {
      points: 10,
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: true, // Good match - suggest adding alias
    }
  }

  if (fuzzyScore >= 0.4) {
    return {
      points: 5,
      penalty: 0,
      method: 'fuzzy',
      confidence: Math.round(fuzzyScore * 100),
      suggestAlias: true,
    }
  }

  // No match - apply penalty (reduced because we're not confident)
  const penalty = fuzzyScore < 0.2 ? -10 : -5

  return {
    points: 0,
    penalty,
    method: 'none',
    confidence: Math.round(fuzzyScore * 100),
    suggestAlias: true, // Suggest adding alias after manual match
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

// =============================================================================
// Fuzzy Matching Algorithms
// =============================================================================

/**
 * Trigram similarity (good for Hebrew and unicode)
 */
function trigramSimilarity(str1: string, str2: string): number {
  const getTrigrams = (s: string): Set<string> => {
    const normalized = s.toLowerCase().replace(/\s+/g, ' ').trim()
    const padded = ` ${normalized} `
    const trigrams = new Set<string>()

    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.slice(i, i + 3))
    }

    return trigrams
  }

  const t1 = getTrigrams(str1)
  const t2 = getTrigrams(str2)

  if (t1.size === 0 || t2.size === 0) return 0

  let intersection = 0
  for (const tri of t1) {
    if (t2.has(tri)) intersection++
  }

  const union = t1.size + t2.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Levenshtein similarity (for short strings)
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  const len1 = s1.length
  const len2 = s2.length

  if (len1 === 0) return len2 === 0 ? 1 : 0
  if (len2 === 0) return 0

  // For very long strings, use trigram instead
  if (len1 > 30 || len2 > 30) return trigramSimilarity(str1, str2)

  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
    for (let j = 1; j <= len2; j++) {
      matrix[i][j] = i === 0 ? j : 0
    }
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)
  return 1 - distance / maxLen
}

/**
 * Token overlap similarity (for compound names)
 */
function tokenOverlapSimilarity(str1: string, str2: string): number {
  const tokenize = (s: string): Set<string> => {
    return new Set(
      s.toLowerCase()
        .replace(/[^\w\s\u0590-\u05FF]/g, ' ') // Keep Hebrew chars
        .split(/\s+/)
        .filter(t => t.length > 1)
    )
  }

  const t1 = tokenize(str1)
  const t2 = tokenize(str2)

  if (t1.size === 0 || t2.size === 0) return 0

  let intersection = 0
  for (const token of t1) {
    if (t2.has(token)) intersection++
  }

  const minSize = Math.min(t1.size, t2.size)
  return intersection / minSize
}

/**
 * Combined fuzzy match using multiple algorithms
 */
function fuzzyMatch(vendorName: string, txDescription: string): number {
  // Use multiple algorithms and take the weighted average
  const trigram = trigramSimilarity(vendorName, txDescription)
  const levenshtein = levenshteinSimilarity(vendorName, txDescription)
  const tokenOverlap = tokenOverlapSimilarity(vendorName, txDescription)

  // Weight: token overlap is most reliable for vendor names
  const combined = (trigram * 0.3) + (levenshtein * 0.3) + (tokenOverlap * 0.4)

  return combined
}
