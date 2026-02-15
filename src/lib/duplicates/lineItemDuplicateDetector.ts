/**
 * Line Item Duplicate Detector
 *
 * Fast exact-match duplicate detection for line items.
 * Matches on: reference_id + transaction_date + amount + currency
 */

import { supabase } from '@/lib/supabase'
import type {
  LineItemForCheck,
  ExistingLineItem,
  LineItemDuplicateMatch,
  LineItemDuplicateCheckResult,
} from './types'

/**
 * Check for duplicate line items using exact matching
 *
 * A line item is a duplicate if ALL of these match exactly:
 * - reference_id
 * - transaction_date
 * - amount (total_agorot)
 * - currency
 *
 * @param userId User ID to scope the search
 * @param lineItems Line items to check
 * @returns Check result with duplicates and new items
 */
export async function checkLineItemDuplicates(
  userId: string,
  _vendorName: string | null, // kept for API compatibility, not used
  lineItems: LineItemForCheck[],
  teamId?: string | null
): Promise<LineItemDuplicateCheckResult> {
  if (lineItems.length === 0) {
    return {
      totalItems: 0,
      duplicateCount: 0,
      matches: [],
      newItems: [],
    }
  }

  // Build a Set of composite keys for fast lookup
  // Key format: "refId|date|amount|currency"
  const itemKeys = new Map<string, LineItemForCheck>()

  for (const item of lineItems) {
    // Skip items without reference_id - can't match without it
    if (!item.reference_id) continue

    const key = `${item.reference_id}|${item.transaction_date || ''}|${item.amount_agorot || ''}|${item.currency || 'ILS'}`
    itemKeys.set(key, item)
  }

  if (itemKeys.size === 0) {
    // No items with reference_id - all are new
    return {
      totalItems: lineItems.length,
      duplicateCount: 0,
      matches: [],
      newItems: lineItems,
    }
  }

  // Query existing line items for this user that have reference_ids
  const referenceIds = lineItems
    .filter((item) => item.reference_id)
    .map((item) => item.reference_id!)

  let dupQuery = supabase
    .from('invoice_rows')
    .select(`
      id,
      invoice_id,
      reference_id,
      transaction_date,
      total_agorot,
      currency,
      description,
      invoices!inner (user_id, team_id)
    `)
    .eq('invoices.user_id', userId)
    .in('reference_id', referenceIds)

  if (teamId) {
    dupQuery = dupQuery.eq('invoices.team_id', teamId)
  }

  const { data: existingItems, error } = await dupQuery

  if (error) {
    console.error('[DuplicateDetector] Query error:', error)
    return {
      totalItems: lineItems.length,
      duplicateCount: 0,
      matches: [],
      newItems: lineItems,
    }
  }

  // Build a Set of existing keys for O(1) lookup
  const existingByKey = new Map<string, ExistingLineItem>()

  for (const row of existingItems || []) {
    const key = `${row.reference_id}|${row.transaction_date || ''}|${row.total_agorot || ''}|${row.currency || 'ILS'}`
    existingByKey.set(key, {
      id: row.id,
      invoice_id: row.invoice_id,
      reference_id: row.reference_id,
      transaction_date: row.transaction_date,
      total_agorot: row.total_agorot,
      description: row.description,
    })
  }

  // Match line items against existing
  const matches: LineItemDuplicateMatch[] = []
  const newItems: LineItemForCheck[] = []

  for (const item of lineItems) {
    if (!item.reference_id) {
      // No reference_id - treat as new
      newItems.push(item)
      continue
    }

    const key = `${item.reference_id}|${item.transaction_date || ''}|${item.amount_agorot || ''}|${item.currency || 'ILS'}`
    const existing = existingByKey.get(key)

    if (existing) {
      matches.push({
        newItem: item,
        existingItems: [existing],
        matchType: 'exact_reference',
      })
    } else {
      newItems.push(item)
    }
  }

  return {
    totalItems: lineItems.length,
    duplicateCount: matches.length,
    matches,
    newItems,
  }
}
