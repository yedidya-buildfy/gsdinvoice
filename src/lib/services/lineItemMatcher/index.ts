/**
 * Line Item to Transaction Matching Service
 *
 * Provides bidirectional linking between invoice line items and transactions:
 * - From line item → find matching transactions (bank_regular, cc_purchase)
 * - From transaction → find matching line items
 *
 * Uses transactions.date (purchase date) for matching, NOT value_date (billing date)
 */

import { supabase } from '@/lib/supabase'
import { TRANSACTION_TYPE, LINE_ITEM_MATCH_STATUS, MATCH_METHOD } from '@/constants'
import type { Transaction, InvoiceRow } from '@/types/database'
import type {
  LineItemWithInvoice,
  TransactionWithCard,
  GetMatchableTransactionsOptions,
  GetMatchableLineItemsOptions,
  LinkResult,
  TransactionLinkSummary,
  LineItemLinkSummary,
  MatchMethod,
} from './types'

// Re-export types
export * from './types'

// Re-export scorer
export {
  scoreMatch,
  scoreReference,
  scoreAmount,
  scoreDate,
  scoreCurrency,
  scoreContext,
  scoreVendor,
  SCORING_WEIGHTS,
  MAX_RAW_SCORE,
  ELIGIBLE_TRANSACTION_TYPES,
  VAT_RATES,
} from './scorer'
export type {
  MatchScore,
  ScoreBreakdown,
  ScorePenalties,
  ScoringContext,
  ExtractedInvoiceData,
  VendorMatchResult,
} from './scorer'

// Re-export auto-matcher
export {
  getMatchCandidates,
  autoMatchLineItem,
  autoMatchInvoice,
  applyAutoMatch,
  applyAutoMatchesForInvoice,
  getUserAutoMatchSettings,
} from './autoMatcher'
export type {
  AutoMatchStatus,
  AutoMatchMethod,
  LineItemMatchResult,
  AutoMatchInvoiceResult,
  AutoMatchOptions,
} from './autoMatcher'

// =============================================================================
// Core Linking Functions
// =============================================================================

/**
 * Link a line item to a transaction
 * Works from either direction - same underlying operation
 */
export async function linkLineItemToTransaction(
  lineItemId: string,
  transactionId: string,
  options?: {
    allocationAgorot?: number  // For partial matching
    matchMethod?: MatchMethod
    matchConfidence?: number
  }
): Promise<LinkResult> {
  try {
    const { error } = await supabase
      .from('invoice_rows')
      .update({
        transaction_id: transactionId,
        allocation_amount_agorot: options?.allocationAgorot || null,
        match_status: options?.allocationAgorot ? LINE_ITEM_MATCH_STATUS.PARTIAL : LINE_ITEM_MATCH_STATUS.MATCHED,
        match_method: options?.matchMethod || MATCH_METHOD.MANUAL,
        match_confidence: options?.matchConfidence || null,
        matched_at: new Date().toISOString(),
      })
      .eq('id', lineItemId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Unlink a line item from its transaction
 */
export async function unlinkLineItemFromTransaction(
  lineItemId: string
): Promise<LinkResult> {
  try {
    const { error } = await supabase
      .from('invoice_rows')
      .update({
        transaction_id: null,
        allocation_amount_agorot: null,
        match_status: LINE_ITEM_MATCH_STATUS.UNMATCHED,
        match_method: null,
        match_confidence: null,
        matched_at: null,
      })
      .eq('id', lineItemId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// =============================================================================
// From Line Item → Find Matching Transactions
// =============================================================================

/**
 * Get matchable transactions for a line item
 * Returns transactions within date/amount tolerance, sorted by relevance
 */
export async function getMatchableTransactions(
  lineItem: InvoiceRow,
  options: GetMatchableTransactionsOptions = {}
): Promise<TransactionWithCard[]> {
  const {
    dateRangeDays = 7,
    amountTolerancePercent = 10,
    transactionTypes = [TRANSACTION_TYPE.BANK_REGULAR, TRANSACTION_TYPE.CC_PURCHASE],
    creditCardId,
    searchQuery,
  } = options

  // Build date range filter
  const lineItemDate = lineItem.transaction_date
  if (!lineItemDate) {
    // No date on line item - return empty (can't match without date)
    return []
  }

  const dateFrom = new Date(lineItemDate)
  dateFrom.setDate(dateFrom.getDate() - dateRangeDays)
  const dateTo = new Date(lineItemDate)
  dateTo.setDate(dateTo.getDate() + dateRangeDays)

  // Build amount range filter
  const lineItemAmount = Math.abs(lineItem.total_agorot || 0)
  const amountTolerance = lineItemAmount * (amountTolerancePercent / 100)
  const amountFrom = lineItemAmount - amountTolerance
  const amountTo = lineItemAmount + amountTolerance

  // Build query
  let query = supabase
    .from('transactions')
    .select(`
      *,
      credit_cards!credit_card_id(card_last_four, card_name, card_type)
    `)
    .in('transaction_type', transactionTypes)
    .gte('date', dateFrom.toISOString().split('T')[0])
    .lte('date', dateTo.toISOString().split('T')[0])
    .gte('amount_agorot', -amountTo)  // Handle negative amounts (expenses)
    .lte('amount_agorot', -amountFrom) // Most transactions are negative
    .order('date', { ascending: false })

  // Add credit card filter if specified
  if (creditCardId) {
    query = query.eq('credit_card_id', creditCardId)
  }

  // Add search filter if specified
  if (searchQuery) {
    query = query.ilike('description', `%${searchQuery}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching matchable transactions:', error)
    return []
  }

  // Also fetch positive amounts (income)
  let incomeQuery = supabase
    .from('transactions')
    .select(`
      *,
      credit_cards!credit_card_id(card_last_four, card_name, card_type)
    `)
    .in('transaction_type', transactionTypes)
    .gte('date', dateFrom.toISOString().split('T')[0])
    .lte('date', dateTo.toISOString().split('T')[0])
    .gte('amount_agorot', amountFrom)
    .lte('amount_agorot', amountTo)
    .order('date', { ascending: false })

  if (creditCardId) {
    incomeQuery = incomeQuery.eq('credit_card_id', creditCardId)
  }

  if (searchQuery) {
    incomeQuery = incomeQuery.ilike('description', `%${searchQuery}%`)
  }

  const { data: incomeData } = await incomeQuery

  // Combine and deduplicate
  const allTransactions = [...(data || []), ...(incomeData || [])]
  const uniqueMap = new Map<string, TransactionWithCard>()
  for (const tx of allTransactions) {
    if (!uniqueMap.has(tx.id)) {
      uniqueMap.set(tx.id, {
        ...tx,
        credit_card: tx.credit_cards as TransactionWithCard['credit_card'],
      })
    }
  }

  // Sort by date proximity to line item date
  const result = Array.from(uniqueMap.values()).sort((a, b) => {
    const diffA = Math.abs(new Date(a.date).getTime() - new Date(lineItemDate).getTime())
    const diffB = Math.abs(new Date(b.date).getTime() - new Date(lineItemDate).getTime())
    return diffA - diffB
  })

  return result
}

// =============================================================================
// From Transaction → Find Matching Line Items
// =============================================================================

/**
 * Get matchable line items for a transaction
 * Returns line items within date/amount tolerance, sorted by relevance
 */
export async function getMatchableLineItems(
  transaction: Transaction,
  options: GetMatchableLineItemsOptions = {}
): Promise<LineItemWithInvoice[]> {
  const {
    dateRangeDays = 7,
    amountTolerancePercent = 10,
    invoiceId,
    vendorName,
    searchQuery,
  } = options

  // Build date range filter using transaction.date (purchase date)
  const txDate = transaction.date
  const dateFrom = new Date(txDate)
  dateFrom.setDate(dateFrom.getDate() - dateRangeDays)
  const dateTo = new Date(txDate)
  dateTo.setDate(dateTo.getDate() + dateRangeDays)

  // Build amount range filter
  const txAmount = Math.abs(transaction.amount_agorot)
  const amountTolerance = txAmount * (amountTolerancePercent / 100)
  const amountFrom = txAmount - amountTolerance
  const amountTo = txAmount + amountTolerance

  // Build query for unmatched line items
  // Don't filter by transaction_date in query - many line items have null dates
  // We'll filter post-query and use invoice_date as fallback
  let query = supabase
    .from('invoice_rows')
    .select(`
      *,
      invoices!invoice_id(id, vendor_name, invoice_number, invoice_date)
    `)
    .is('transaction_id', null)  // Only unmatched items

  // Add invoice filter if specified
  if (invoiceId) {
    query = query.eq('invoice_id', invoiceId)
  }

  // Add search filter if specified
  if (searchQuery) {
    query = query.ilike('description', `%${searchQuery}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching matchable line items:', error)
    return []
  }

  // Filter by date, amount range, and vendor (post-query for flexibility)
  // Skip amount filtering if tolerance is 100% or higher (means "not relevant")
  const skipAmountFilter = amountTolerancePercent >= 100
  const dateFromStr = dateFrom.toISOString().split('T')[0]
  const dateToStr = dateTo.toISOString().split('T')[0]

  let filtered = (data || [])
    .map(row => ({
      ...row,
      invoice: row.invoices as LineItemWithInvoice['invoice'],
    }))
    .filter(row => {
      // Date filter: use transaction_date, or invoice_date as fallback
      const itemDate = row.transaction_date || row.invoice?.invoice_date
      if (itemDate) {
        if (itemDate < dateFromStr || itemDate > dateToStr) {
          return false
        }
      }
      // If no date at all, include the item (let user decide)

      // Amount filter
      if (!skipAmountFilter) {
        const rowAmount = Math.abs(row.total_agorot || 0)
        if (rowAmount < amountFrom || rowAmount > amountTo) {
          return false
        }
      }

      return true
    })

  // Filter by vendor name if specified
  if (vendorName) {
    const lowerVendor = vendorName.toLowerCase()
    filtered = filtered.filter(row =>
      row.invoice?.vendor_name?.toLowerCase().includes(lowerVendor)
    )
  }

  // Sort by date proximity to transaction date
  filtered.sort((a, b) => {
    const diffA = a.transaction_date
      ? Math.abs(new Date(a.transaction_date).getTime() - new Date(txDate).getTime())
      : Infinity
    const diffB = b.transaction_date
      ? Math.abs(new Date(b.transaction_date).getTime() - new Date(txDate).getTime())
      : Infinity
    return diffA - diffB
  })

  return filtered
}

// =============================================================================
// Get Linked Items (Both Directions)
// =============================================================================

/**
 * Get all line items linked to a transaction
 */
export async function getLineItemsForTransaction(
  transactionId: string
): Promise<LineItemWithInvoice[]> {
  const { data, error } = await supabase
    .from('invoice_rows')
    .select(`
      *,
      invoices!invoice_id(id, vendor_name, invoice_number, invoice_date)
    `)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching line items for transaction:', error)
    return []
  }

  return (data || []).map(row => ({
    ...row,
    invoice: row.invoices as LineItemWithInvoice['invoice'],
  }))
}

/**
 * Get the transaction linked to a line item
 */
export async function getTransactionForLineItem(
  lineItemId: string
): Promise<TransactionWithCard | null> {
  // First get the line item to find transaction_id
  const { data: lineItem, error: lineItemError } = await supabase
    .from('invoice_rows')
    .select('transaction_id')
    .eq('id', lineItemId)
    .single()

  if (lineItemError || !lineItem?.transaction_id) {
    return null
  }

  // Then fetch the transaction with card info
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select(`
      *,
      credit_cards!credit_card_id(card_last_four, card_name, card_type)
    `)
    .eq('id', lineItem.transaction_id)
    .single()

  if (txError || !transaction) {
    return null
  }

  return {
    ...transaction,
    credit_card: transaction.credit_cards as TransactionWithCard['credit_card'],
  }
}

// =============================================================================
// Summary Functions
// =============================================================================

/**
 * Get link summary for a transaction (count, allocation, etc.)
 */
export async function getTransactionLinkSummary(
  transactionId: string
): Promise<TransactionLinkSummary | null> {
  // Get transaction amount
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('amount_agorot')
    .eq('id', transactionId)
    .single()

  if (txError || !transaction) {
    return null
  }

  // Get linked line items
  const { data: lineItems, error: liError } = await supabase
    .from('invoice_rows')
    .select('total_agorot, allocation_amount_agorot')
    .eq('transaction_id', transactionId)

  if (liError) {
    return null
  }

  const linkedCount = lineItems?.length || 0
  const totalAllocatedAgorot = (lineItems || []).reduce((sum, item) => {
    return sum + Math.abs(item.allocation_amount_agorot || item.total_agorot || 0)
  }, 0)
  const transactionAmountAgorot = Math.abs(transaction.amount_agorot)
  const remainingAgorot = Math.max(0, transactionAmountAgorot - totalAllocatedAgorot)

  return {
    transactionId,
    linkedCount,
    totalAllocatedAgorot,
    transactionAmountAgorot,
    remainingAgorot,
    isFullyAllocated: remainingAgorot === 0 && linkedCount > 0,
  }
}

/**
 * Get link summary for a line item
 */
export async function getLineItemLinkSummary(
  lineItemId: string
): Promise<LineItemLinkSummary> {
  const { data: lineItem, error } = await supabase
    .from('invoice_rows')
    .select(`
      id,
      transaction_id,
      match_confidence,
      match_method,
      transactions!transaction_id(id, date, description, amount_agorot, transaction_type)
    `)
    .eq('id', lineItemId)
    .single()

  if (error || !lineItem) {
    return { lineItemId, isLinked: false }
  }

  const tx = lineItem.transactions as LineItemLinkSummary['transaction']

  return {
    lineItemId,
    isLinked: !!lineItem.transaction_id,
    transaction: tx || undefined,
    matchConfidence: lineItem.match_confidence || undefined,
    matchMethod: lineItem.match_method as MatchMethod || undefined,
  }
}

/**
 * Get link counts for multiple transactions (batch query for table display)
 * Uses RPC function to avoid URL length limits
 */
export async function getTransactionLinkCounts(
  transactionIds: string[]
): Promise<Map<string, number>> {
  if (transactionIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.rpc('bulk_get_invoice_row_transaction_ids', {
    transaction_ids: transactionIds
  })

  if (error) {
    console.error('Error fetching link counts:', error)
    return new Map()
  }

  // Count occurrences
  const counts = new Map<string, number>()
  for (const row of data || []) {
    if (row.transaction_id) {
      counts.set(row.transaction_id, (counts.get(row.transaction_id) || 0) + 1)
    }
  }

  return counts
}

// =============================================================================
// DEPRECATED: Old Candidate Scoring Functions - Removed
// =============================================================================
// The old scoreTransactionCandidate and scoreLineItemCandidate functions
// have been removed in favor of the new scoreMatch function from ./scorer.ts
// which provides a more comprehensive scoring algorithm with:
// - Reference matching (0-45 points)
// - Amount matching (0-25 points)
// - Date matching (0-15 points)
// - Vendor matching (0-15 points) with user alias support
// - Currency matching (0-5 points)
// - Context signals (0-5 points)
