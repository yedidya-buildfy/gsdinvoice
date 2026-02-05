/**
 * Hook for bulk auto-matching invoice line items to transactions
 *
 * Simple approach:
 * 1. Fetch all unmatched line items for selected invoices
 * 2. Fetch all available transactions (within date range)
 * 3. For each line item, find the best matching transaction
 * 4. If score >= threshold, link them
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTeam } from '@/contexts/TeamContext'
import { scoreMatch, ELIGIBLE_TRANSACTION_TYPES, type ScoringContext } from '@/lib/services/lineItemMatcher/scorer'
import { linkLineItemToTransaction } from '@/lib/services/lineItemMatcher'
import type { Transaction, InvoiceRow, Invoice, VendorAlias } from '@/types/database'

export interface AutoMatchRequest {
  invoiceId: string
}

export interface AutoMatchBatchResult {
  totalInvoices: number
  processedInvoices: number
  totalLineItems: number
  matched: number
  skipped: number
  failed: number
  results: Array<{
    invoiceId: string
    lineItemsMatched: number
    lineItemsSkipped: number
    error?: string
  }>
}

// Date range to search for transactions (days before/after line item date)
const DATE_RANGE_DAYS = 30

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
    console.error('[AutoMatch] Error fetching vendor aliases:', error)
    return []
  }

  return data || []
}

/**
 * Process all invoices and match their line items
 * Exported for use in other hooks (e.g., useDocumentExtraction for auto-matching on upload)
 */
export async function processAutoMatch(
  invoiceIds: string[],
  threshold: number,
  teamId: string | null
): Promise<AutoMatchBatchResult> {
  console.log('[AutoMatch] Starting with', invoiceIds.length, 'invoices, threshold:', threshold)

  const result: AutoMatchBatchResult = {
    totalInvoices: invoiceIds.length,
    processedInvoices: 0,
    totalLineItems: 0,
    matched: 0,
    skipped: 0,
    failed: 0,
    results: [],
  }

  // Step 1: Fetch all invoices with their line items
  console.log('[AutoMatch] Step 1: Fetching invoices and line items...')
  let invoicesQuery = supabase
    .from('invoices')
    .select('*')
    .in('id', invoiceIds)

  if (teamId) {
    invoicesQuery = invoicesQuery.eq('team_id', teamId)
  } else {
    invoicesQuery = invoicesQuery.is('team_id', null)
  }

  const { data: invoices, error: invoicesError } = await invoicesQuery

  if (invoicesError || !invoices) {
    console.error('[AutoMatch] Error fetching invoices:', invoicesError)
    return result
  }

  // Fetch all line items for these invoices
  const { data: allLineItems, error: lineItemsError } = await supabase
    .from('invoice_rows')
    .select('*')
    .in('invoice_id', invoiceIds)
    .is('transaction_id', null) // Only unmatched line items
    .eq('is_document_link', false) // Skip document links

  if (lineItemsError) {
    console.error('[AutoMatch] Error fetching line items:', lineItemsError)
    return result
  }

  if (!allLineItems || allLineItems.length === 0) {
    console.log('[AutoMatch] No unmatched line items found')
    result.processedInvoices = invoiceIds.length
    return result
  }

  console.log('[AutoMatch] Found', allLineItems.length, 'unmatched line items')
  result.totalLineItems = allLineItems.length

  // Step 2: Determine date range from line items
  const dates = allLineItems
    .map(li => li.transaction_date)
    .filter((d): d is string => !!d)
    .sort()

  if (dates.length === 0) {
    console.log('[AutoMatch] No dates on line items, cannot match')
    result.skipped = allLineItems.length
    result.processedInvoices = invoiceIds.length
    return result
  }

  const minDate = new Date(dates[0])
  minDate.setDate(minDate.getDate() - DATE_RANGE_DAYS)
  const maxDate = new Date(dates[dates.length - 1])
  maxDate.setDate(maxDate.getDate() + DATE_RANGE_DAYS)

  console.log('[AutoMatch] Date range:', minDate.toISOString().split('T')[0], 'to', maxDate.toISOString().split('T')[0])

  // Step 3: Fetch all transactions in date range
  console.log('[AutoMatch] Step 2: Fetching transactions...')
  let transactionsQuery = supabase
    .from('transactions')
    .select('*')
    .in('transaction_type', ELIGIBLE_TRANSACTION_TYPES)
    .eq('is_income', false)
    .gte('date', minDate.toISOString().split('T')[0])
    .lte('date', maxDate.toISOString().split('T')[0])

  if (teamId) {
    transactionsQuery = transactionsQuery.eq('team_id', teamId)
  } else {
    transactionsQuery = transactionsQuery.is('team_id', null)
  }

  const { data: transactions, error: txError } = await transactionsQuery

  if (txError || !transactions) {
    console.error('[AutoMatch] Error fetching transactions:', txError)
    return result
  }

  console.log('[AutoMatch] Found', transactions.length, 'transactions')

  if (transactions.length === 0) {
    console.log('[AutoMatch] No transactions in date range')
    result.skipped = allLineItems.length
    result.processedInvoices = invoiceIds.length
    return result
  }

  // Step 4: Fetch vendor aliases
  const vendorAliases = await fetchVendorAliases()
  console.log('[AutoMatch] Loaded', vendorAliases.length, 'vendor aliases')

  // Step 5: Build invoice map for quick lookup
  const invoiceMap = new Map<string, Invoice>()
  for (const inv of invoices) {
    invoiceMap.set(inv.id, inv as Invoice)
  }

  // Track which transactions have been matched (to avoid double-matching)
  const matchedTransactionIds = new Set<string>()

  // Step 6: Process each line item
  console.log('[AutoMatch] Step 3: Matching line items...')
  const invoiceResults = new Map<string, { matched: number; skipped: number }>()

  for (const lineItem of allLineItems) {
    const invoice = invoiceMap.get(lineItem.invoice_id)
    if (!invoice) {
      result.skipped++
      continue
    }

    // Initialize invoice result
    if (!invoiceResults.has(lineItem.invoice_id)) {
      invoiceResults.set(lineItem.invoice_id, { matched: 0, skipped: 0 })
    }
    const invResult = invoiceResults.get(lineItem.invoice_id)!

    // Build scoring context
    const scoringContext: ScoringContext = {
      lineItem: lineItem as InvoiceRow,
      invoice,
      extractedData: null,
      vendorAliases,
    }

    // Find best matching transaction
    let bestMatch: { transaction: Transaction; score: number; breakdown: string } | null = null
    let scoredCount = 0
    let disqualifiedCount = 0

    for (const tx of transactions) {
      // Skip already matched transactions
      if (matchedTransactionIds.has(tx.id)) continue

      // Score this transaction
      const score = scoreMatch(tx as Transaction, scoringContext)

      if (score.isDisqualified) {
        disqualifiedCount++
        continue
      }

      scoredCount++
      const breakdown = `ref:${score.breakdown.reference} amt:${score.breakdown.amount} date:${score.breakdown.date} vendor:${score.breakdown.vendor}`

      if (!bestMatch || score.total > bestMatch.score) {
        bestMatch = { transaction: tx as Transaction, score: score.total, breakdown }
      }
    }

    console.log('[AutoMatch] Line item', lineItem.id, '- scored:', scoredCount, 'disqualified:', disqualifiedCount,
      'best:', bestMatch ? `${bestMatch.score}% (${bestMatch.breakdown})` : 'none',
      'lineItem amount:', lineItem.total_agorot, 'currency:', lineItem.currency, 'date:', lineItem.transaction_date)

    // Check if best match meets threshold
    if (bestMatch && bestMatch.score >= threshold) {
      // Link the line item
      const linkResult = await linkLineItemToTransaction(
        lineItem.id,
        bestMatch.transaction.id,
        {
          matchMethod: 'rule_amount_date',
          matchConfidence: bestMatch.score,
        }
      )

      if (linkResult.success) {
        result.matched++
        invResult.matched++
        matchedTransactionIds.add(bestMatch.transaction.id)
        console.log('[AutoMatch] MATCHED:', lineItem.id, '→', bestMatch.transaction.id,
          'score:', bestMatch.score, '>=', threshold)
      } else {
        result.failed++
        console.error('[AutoMatch] LINK FAILED:', linkResult.error)
      }
    } else {
      result.skipped++
      invResult.skipped++
      console.log('[AutoMatch] SKIPPED:', lineItem.id,
        bestMatch ? `best score ${bestMatch.score} < threshold ${threshold}` : 'no eligible transactions')
    }
  }

  // Build results array
  result.processedInvoices = invoiceIds.length
  for (const invoiceId of invoiceIds) {
    const invResult = invoiceResults.get(invoiceId) || { matched: 0, skipped: 0 }
    result.results.push({
      invoiceId,
      lineItemsMatched: invResult.matched,
      lineItemsSkipped: invResult.skipped,
    })
  }

  console.log('[AutoMatch] Complete:', result)
  return result
}

/**
 * Hook for bulk auto-matching line items across selected invoices
 */
export function useAutoMatch() {
  const queryClient = useQueryClient()
  const { autoMatchThreshold } = useSettingsStore()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async (requests: AutoMatchRequest[]): Promise<AutoMatchBatchResult> => {
      const invoiceIds = requests.map(r => r.invoiceId)
      return processAutoMatch(invoiceIds, autoMatchThreshold, currentTeam?.id ?? null)
    },
    onSuccess: () => {
      console.log('[AutoMatch] Success, invalidating queries')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
    onError: (error) => {
      console.error('[AutoMatch] Mutation error:', error)
    },
  })
}
