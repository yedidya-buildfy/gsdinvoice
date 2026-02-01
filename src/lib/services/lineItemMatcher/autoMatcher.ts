/**
 * Auto-Matching Service for Line Items to Transactions
 *
 * Provides automatic matching of invoice line items to transactions using:
 * - The scoring algorithm from ./scorer.ts
 * - Configurable thresholds for auto-approval and candidates
 * - Support for partial allocations
 */

import { supabase } from '@/lib/supabase'
import type { Transaction, InvoiceRow, Invoice, VendorAlias } from '@/types/database'
import {
  scoreMatch,
  ELIGIBLE_TRANSACTION_TYPES,
  type MatchScore,
  type ScoringContext,
  type ExtractedInvoiceData,
} from './scorer'
import { linkLineItemToTransaction, getTransactionLinkSummary } from './index'
import type { MatchMethod, LinkResult } from './types'

// =============================================================================
// Types
// =============================================================================

export type AutoMatchStatus = 'auto_matched' | 'candidate' | 'no_match'
export type AutoMatchMethod = 'manual' | 'auto_approved' | 'auto_matched' | 'candidate'

/**
 * Result of matching a single line item
 */
export interface LineItemMatchResult {
  lineItemId: string
  lineItem: InvoiceRow
  bestMatch: {
    transaction: Transaction
    score: MatchScore
    confidence: number
  } | null
  candidates: Array<{
    transaction: Transaction
    score: MatchScore
    confidence: number
  }>
  status: AutoMatchStatus
  matchMethod?: AutoMatchMethod
}

/**
 * Result of matching all line items in an invoice
 */
export interface AutoMatchInvoiceResult {
  invoiceId: string
  totalLineItems: number
  results: LineItemMatchResult[]
  summary: {
    autoMatched: number
    candidates: number
    noMatch: number
  }
}

/**
 * Options for auto-matching
 */
export interface AutoMatchOptions {
  /** Minimum score to auto-approve match (default: 85) */
  autoApproveThreshold?: number
  /** Minimum score to consider as candidate (default: 50) */
  candidateThreshold?: number
  /** Maximum candidates to return per line item (default: 10) */
  maxCandidates?: number
  /** Date range in days to search for transactions (default: 30) */
  dateRangeDays?: number
  /** Force re-matching even if already matched (default: false) */
  forceRematch?: boolean
  /** Amount tolerance percent for initial filtering (default: 50) */
  amountTolerancePercent?: number
}

/**
 * Default options for auto-matching
 */
const DEFAULT_OPTIONS: Required<AutoMatchOptions> = {
  autoApproveThreshold: 85,
  candidateThreshold: 50,
  maxCandidates: 10,
  dateRangeDays: 30,
  forceRematch: false,
  amountTolerancePercent: 50,
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Fetch vendor aliases for the current user
 */
async function fetchVendorAliases(): Promise<VendorAlias[]> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return []

  const { data, error } = await supabase
    .from('vendor_aliases')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('priority', { ascending: false })

  if (error) {
    console.error('Error fetching vendor aliases:', error)
    return []
  }

  return data || []
}

/**
 * Fetch extracted data for an invoice (from its associated file)
 */
async function fetchExtractedData(invoice: Invoice): Promise<ExtractedInvoiceData | null> {
  if (!invoice.file_id) return null

  const { data, error } = await supabase
    .from('files')
    .select('extracted_data')
    .eq('id', invoice.file_id)
    .single()

  if (error || !data?.extracted_data) {
    return null
  }

  return data.extracted_data as ExtractedInvoiceData
}

/**
 * Calculate remaining amount for a transaction (after existing allocations)
 */
async function getTransactionRemainingAmount(transactionId: string): Promise<number | null> {
  const summary = await getTransactionLinkSummary(transactionId)
  return summary?.remainingAgorot ?? null
}

/**
 * Check if transaction is fully allocated
 */
async function isTransactionFullyAllocated(transactionId: string): Promise<boolean> {
  const summary = await getTransactionLinkSummary(transactionId)
  return summary?.isFullyAllocated ?? false
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Get match candidates for a line item
 *
 * @param lineItem - The line item to match
 * @param invoice - The parent invoice
 * @param options - Matching options
 * @returns Array of candidate transactions sorted by score
 */
export async function getMatchCandidates(
  lineItem: InvoiceRow,
  invoice: Invoice,
  options: AutoMatchOptions = {}
): Promise<Array<{ transaction: Transaction; score: MatchScore; confidence: number; remainingAmount: number }>> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Get line item date (prefer transaction_date, fall back to invoice_date)
  const lineItemDate = lineItem.transaction_date || invoice.invoice_date
  if (!lineItemDate) {
    // No date available - return empty
    return []
  }

  // Build date range
  const dateFrom = new Date(lineItemDate)
  dateFrom.setDate(dateFrom.getDate() - opts.dateRangeDays)
  const dateTo = new Date(lineItemDate)
  dateTo.setDate(dateTo.getDate() + opts.dateRangeDays)

  // Fetch transactions within date range
  // We query for expenses (negative amounts)
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      *,
      credit_cards!credit_card_id(card_last_four, card_name, card_type)
    `)
    .in('transaction_type', ELIGIBLE_TRANSACTION_TYPES)
    .eq('is_income', false)
    .gte('date', dateFrom.toISOString().split('T')[0])
    .lte('date', dateTo.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error || !transactions) {
    console.error('Error fetching transactions for matching:', error)
    return []
  }

  // Fetch vendor aliases for scoring
  const vendorAliases = await fetchVendorAliases()

  // Fetch extracted data for additional context
  const extractedData = await fetchExtractedData(invoice)

  // Build scoring context
  const scoringContext: ScoringContext = {
    lineItem,
    invoice,
    extractedData,
    vendorAliases,
  }

  // Score each transaction and filter by allocation status
  const candidates: Array<{
    transaction: Transaction
    score: MatchScore
    confidence: number
    remainingAmount: number
  }> = []

  for (const tx of transactions) {
    // Skip fully allocated transactions
    const isFullyAllocated = await isTransactionFullyAllocated(tx.id)
    if (isFullyAllocated) {
      continue
    }

    // Score the match
    const score = scoreMatch(tx, scoringContext)

    // Skip disqualified transactions
    if (score.isDisqualified) {
      continue
    }

    // Skip transactions below candidate threshold
    if (score.total < opts.candidateThreshold) {
      continue
    }

    // Get remaining amount
    const remainingAmount = await getTransactionRemainingAmount(tx.id) ?? Math.abs(tx.amount_agorot)

    candidates.push({
      transaction: tx,
      score,
      confidence: score.total,
      remainingAmount,
    })
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score.total - a.score.total)

  // Limit to max candidates
  return candidates.slice(0, opts.maxCandidates)
}

/**
 * Auto-match a single line item to transactions
 *
 * @param lineItemId - The ID of the line item to match
 * @param options - Matching options
 * @returns LineItemMatchResult with best match and candidates
 */
export async function autoMatchLineItem(
  lineItemId: string,
  options: AutoMatchOptions = {}
): Promise<LineItemMatchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Fetch line item with invoice
  const { data: lineItem, error: lineItemError } = await supabase
    .from('invoice_rows')
    .select(`
      *,
      invoices!invoice_id(*)
    `)
    .eq('id', lineItemId)
    .single()

  if (lineItemError || !lineItem) {
    console.error('Error fetching line item:', lineItemError)
    return {
      lineItemId,
      lineItem: {} as InvoiceRow,
      bestMatch: null,
      candidates: [],
      status: 'no_match',
    }
  }

  const invoice = lineItem.invoices as Invoice

  // Check if already matched (unless force rematch)
  if (lineItem.transaction_id && !opts.forceRematch) {
    return {
      lineItemId,
      lineItem: lineItem as InvoiceRow,
      bestMatch: null,
      candidates: [],
      status: 'auto_matched',
      matchMethod: lineItem.match_method as AutoMatchMethod || 'manual',
    }
  }

  // Get match candidates
  const candidates = await getMatchCandidates(lineItem as InvoiceRow, invoice, opts)

  // Determine status and best match
  let status: AutoMatchStatus = 'no_match'
  let bestMatch: LineItemMatchResult['bestMatch'] = null
  let matchMethod: AutoMatchMethod | undefined

  if (candidates.length > 0) {
    const topCandidate = candidates[0]

    // Check if top candidate meets auto-approve threshold
    if (topCandidate.confidence >= opts.autoApproveThreshold) {
      status = 'auto_matched'
      matchMethod = 'auto_approved'
      bestMatch = {
        transaction: topCandidate.transaction,
        score: topCandidate.score,
        confidence: topCandidate.confidence,
      }
    } else if (topCandidate.confidence >= opts.candidateThreshold) {
      status = 'candidate'
      matchMethod = 'candidate'
      bestMatch = {
        transaction: topCandidate.transaction,
        score: topCandidate.score,
        confidence: topCandidate.confidence,
      }
    }
  }

  return {
    lineItemId,
    lineItem: lineItem as InvoiceRow,
    bestMatch,
    candidates: candidates.map(c => ({
      transaction: c.transaction,
      score: c.score,
      confidence: c.confidence,
    })),
    status,
    matchMethod,
  }
}

/**
 * Auto-match all line items in an invoice
 *
 * @param invoiceId - The ID of the invoice
 * @param options - Matching options
 * @returns AutoMatchInvoiceResult with all line item results and summary
 */
export async function autoMatchInvoice(
  invoiceId: string,
  options: AutoMatchOptions = {}
): Promise<AutoMatchInvoiceResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Fetch invoice with line items
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    console.error('Error fetching invoice:', invoiceError)
    return {
      invoiceId,
      totalLineItems: 0,
      results: [],
      summary: { autoMatched: 0, candidates: 0, noMatch: 0 },
    }
  }

  // Fetch line items for this invoice
  const { data: lineItems, error: lineItemsError } = await supabase
    .from('invoice_rows')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  if (lineItemsError || !lineItems) {
    console.error('Error fetching line items:', lineItemsError)
    return {
      invoiceId,
      totalLineItems: 0,
      results: [],
      summary: { autoMatched: 0, candidates: 0, noMatch: 0 },
    }
  }

  // Process each line item
  const results: LineItemMatchResult[] = []
  const summary = { autoMatched: 0, candidates: 0, noMatch: 0 }

  // Pre-fetch vendor aliases and extracted data (once for all line items)
  const vendorAliases = await fetchVendorAliases()
  const extractedData = await fetchExtractedData(invoice)

  for (const lineItem of lineItems) {
    // Skip already matched items unless force rematch
    if (lineItem.transaction_id && !opts.forceRematch) {
      results.push({
        lineItemId: lineItem.id,
        lineItem,
        bestMatch: null,
        candidates: [],
        status: 'auto_matched',
        matchMethod: lineItem.match_method as AutoMatchMethod || 'manual',
      })
      summary.autoMatched++
      continue
    }

    // Get candidates for this line item
    const candidates = await getMatchCandidatesWithContext(
      lineItem,
      invoice,
      vendorAliases,
      extractedData,
      opts
    )

    // Determine status and best match
    let status: AutoMatchStatus = 'no_match'
    let bestMatch: LineItemMatchResult['bestMatch'] = null
    let matchMethod: AutoMatchMethod | undefined

    if (candidates.length > 0) {
      const topCandidate = candidates[0]

      if (topCandidate.confidence >= opts.autoApproveThreshold) {
        status = 'auto_matched'
        matchMethod = 'auto_approved'
        bestMatch = {
          transaction: topCandidate.transaction,
          score: topCandidate.score,
          confidence: topCandidate.confidence,
        }
        summary.autoMatched++
      } else if (topCandidate.confidence >= opts.candidateThreshold) {
        status = 'candidate'
        matchMethod = 'candidate'
        bestMatch = {
          transaction: topCandidate.transaction,
          score: topCandidate.score,
          confidence: topCandidate.confidence,
        }
        summary.candidates++
      } else {
        summary.noMatch++
      }
    } else {
      summary.noMatch++
    }

    results.push({
      lineItemId: lineItem.id,
      lineItem,
      bestMatch,
      candidates: candidates.map(c => ({
        transaction: c.transaction,
        score: c.score,
        confidence: c.confidence,
      })),
      status,
      matchMethod,
    })
  }

  return {
    invoiceId,
    totalLineItems: lineItems.length,
    results,
    summary,
  }
}

/**
 * Get match candidates with pre-fetched context (optimization for batch processing)
 */
async function getMatchCandidatesWithContext(
  lineItem: InvoiceRow,
  invoice: Invoice,
  vendorAliases: VendorAlias[],
  extractedData: ExtractedInvoiceData | null,
  options: Required<AutoMatchOptions>
): Promise<Array<{ transaction: Transaction; score: MatchScore; confidence: number; remainingAmount: number }>> {
  // Get line item date
  const lineItemDate = lineItem.transaction_date || invoice.invoice_date
  if (!lineItemDate) {
    return []
  }

  // Build date range
  const dateFrom = new Date(lineItemDate)
  dateFrom.setDate(dateFrom.getDate() - options.dateRangeDays)
  const dateTo = new Date(lineItemDate)
  dateTo.setDate(dateTo.getDate() + options.dateRangeDays)

  // Fetch transactions within date range
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      *,
      credit_cards!credit_card_id(card_last_four, card_name, card_type)
    `)
    .in('transaction_type', ELIGIBLE_TRANSACTION_TYPES)
    .eq('is_income', false)
    .gte('date', dateFrom.toISOString().split('T')[0])
    .lte('date', dateTo.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error || !transactions) {
    console.error('Error fetching transactions for matching:', error)
    return []
  }

  // Build scoring context
  const scoringContext: ScoringContext = {
    lineItem,
    invoice,
    extractedData,
    vendorAliases,
  }

  // Score each transaction and filter
  const candidates: Array<{
    transaction: Transaction
    score: MatchScore
    confidence: number
    remainingAmount: number
  }> = []

  for (const tx of transactions) {
    // Skip fully allocated transactions
    const isFullyAllocated = await isTransactionFullyAllocated(tx.id)
    if (isFullyAllocated) {
      continue
    }

    // Score the match
    const score = scoreMatch(tx, scoringContext)

    // Skip disqualified transactions
    if (score.isDisqualified) {
      continue
    }

    // Skip transactions below candidate threshold
    if (score.total < options.candidateThreshold) {
      continue
    }

    // Get remaining amount
    const remainingAmount = await getTransactionRemainingAmount(tx.id) ?? Math.abs(tx.amount_agorot)

    candidates.push({
      transaction: tx,
      score,
      confidence: score.total,
      remainingAmount,
    })
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score.total - a.score.total)

  // Limit to max candidates
  return candidates.slice(0, options.maxCandidates)
}

/**
 * Apply an auto-match by linking a line item to a transaction
 *
 * @param lineItemId - The line item to link
 * @param transactionId - The transaction to link to
 * @param score - The match score (for recording confidence)
 * @param options - Additional options
 * @returns LinkResult indicating success or failure
 */
export async function applyAutoMatch(
  lineItemId: string,
  transactionId: string,
  score: MatchScore,
  options?: {
    allocationAgorot?: number
    matchMethod?: AutoMatchMethod
  }
): Promise<LinkResult> {
  // Determine match method - use the types.ts MatchMethod type
  // Map our AutoMatchMethod to the database MatchMethod
  let matchMethod: MatchMethod = 'rule_amount_date'
  if (options?.matchMethod === 'manual') {
    matchMethod = 'manual'
  } else if (options?.matchMethod === 'auto_approved' || options?.matchMethod === 'auto_matched') {
    matchMethod = 'rule_amount_date' // Best fit for auto-matching based on amount/date scoring
  }

  // Use the existing link function with enhanced metadata
  const result = await linkLineItemToTransaction(lineItemId, transactionId, {
    allocationAgorot: options?.allocationAgorot,
    matchMethod,
    matchConfidence: score.total,
  })

  return result
}

/**
 * Apply all auto-matches for an invoice (only high-confidence matches)
 *
 * @param invoiceId - The invoice ID
 * @param options - Matching options
 * @returns Object with applied count and results
 */
export async function applyAutoMatchesForInvoice(
  invoiceId: string,
  options: AutoMatchOptions = {}
): Promise<{
  applied: number
  failed: number
  results: Array<{ lineItemId: string; success: boolean; error?: string }>
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Get match results for the invoice
  const matchResult = await autoMatchInvoice(invoiceId, opts)

  const results: Array<{ lineItemId: string; success: boolean; error?: string }> = []
  let applied = 0
  let failed = 0

  // Only apply auto-matched items (those above autoApproveThreshold)
  for (const result of matchResult.results) {
    if (result.status !== 'auto_matched' || !result.bestMatch) {
      continue
    }

    // Skip if already matched (unless this is a re-match scenario)
    if (result.lineItem.transaction_id && !opts.forceRematch) {
      continue
    }

    // Apply the match
    const linkResult = await applyAutoMatch(
      result.lineItemId,
      result.bestMatch.transaction.id,
      result.bestMatch.score,
      { matchMethod: 'auto_approved' }
    )

    if (linkResult.success) {
      applied++
      results.push({ lineItemId: result.lineItemId, success: true })
    } else {
      failed++
      results.push({
        lineItemId: result.lineItemId,
        success: false,
        error: linkResult.error,
      })
    }
  }

  return { applied, failed, results }
}

/**
 * Get user's auto-match settings (thresholds, etc.)
 */
export async function getUserAutoMatchSettings(): Promise<AutoMatchOptions> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return DEFAULT_OPTIONS

  const { data: settings } = await supabase
    .from('user_settings')
    .select('auto_approval_threshold')
    .eq('user_id', userData.user.id)
    .single()

  if (!settings) return DEFAULT_OPTIONS

  return {
    ...DEFAULT_OPTIONS,
    autoApproveThreshold: settings.auto_approval_threshold ?? DEFAULT_OPTIONS.autoApproveThreshold,
  }
}
