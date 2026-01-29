/**
 * CC-Bank Transaction Matching Service
 *
 * Matches credit card transactions (from CC CSV uploads) to bank transactions
 * (CC charge rows) using:
 * - Card last 4 digits matching
 * - Charge date (מועד חיוב) with configurable ±N days tolerance
 * - Amount validation with discrepancy calculation
 */

import { supabase } from '@/lib/supabase'
import { detectCreditCardCharge } from './creditCardLinker'
import { normalizeMerchantName } from '@/lib/utils/merchantParser'
import type {
  CreditCardTransaction,
  Transaction,
  CCBankMatchResultInsert,
} from '@/types/database'

export interface MatchingSettings {
  dateToleranceDays: number
  amountTolerancePercent: number
}

export interface MatchingResult {
  matchedGroups: number
  matchedCCTransactions: number
  totalDiscrepancyAgorot: number
  errors: string[]
}

interface CCGroup {
  cardLastFour: string
  chargeDate: string
  transactions: CreditCardTransaction[]
  totalAmountAgorot: number
}

const BATCH_SIZE = 3
const BATCH_DELAY_MS = 200

/**
 * Delay helper for batch processing
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if two dates are within tolerance window
 */
function isWithinDateWindow(
  date1: string,
  date2: string,
  toleranceDays: number
): { within: boolean; daysDiff: number } {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffMs = Math.abs(d1.getTime() - d2.getTime())
  const daysDiff = diffMs / (1000 * 60 * 60 * 24)
  return {
    within: daysDiff <= toleranceDays,
    daysDiff,
  }
}

/**
 * Calculate match confidence based on date proximity and amount similarity
 */
function calculateConfidence(
  daysDiff: number,
  dateToleranceDays: number,
  discrepancyPercent: number,
  amountTolerancePercent: number
): number {
  // Date proximity: 100% if same day, decreases linearly
  const dateScore = Math.max(0, 100 - (daysDiff / dateToleranceDays) * 50)

  // Amount match: 100% if exact, decreases linearly
  const amountScore = Math.max(0, 100 - (discrepancyPercent / amountTolerancePercent) * 50)

  // Weight: 60% date, 40% amount
  return Math.round(dateScore * 0.6 + amountScore * 0.4)
}

/**
 * Group CC transactions by card_last_four and charge_date
 */
function groupCCTransactions(transactions: CreditCardTransaction[]): Map<string, CCGroup> {
  const groups = new Map<string, CCGroup>()

  for (const tx of transactions) {
    const key = `${tx.card_last_four}|${tx.charge_date}`

    if (!groups.has(key)) {
      groups.set(key, {
        cardLastFour: tx.card_last_four,
        chargeDate: tx.charge_date,
        transactions: [],
        totalAmountAgorot: 0,
      })
    }

    const group = groups.get(key)!
    group.transactions.push(tx)
    group.totalAmountAgorot += Math.abs(tx.amount_agorot)
  }

  return groups
}

/**
 * Find best matching bank transaction for a CC group
 */
function findBestBankMatch(
  group: CCGroup,
  bankCharges: Transaction[],
  settings: MatchingSettings
): { bankTx: Transaction; confidence: number; daysDiff: number } | null {
  let bestMatch: { bankTx: Transaction; confidence: number; daysDiff: number } | null = null

  for (const bankTx of bankCharges) {
    // Check if card last four matches
    const detectedCard = detectCreditCardCharge(bankTx.description)
    if (detectedCard !== group.cardLastFour) continue

    // Check date window
    const dateCheck = isWithinDateWindow(
      bankTx.date,
      group.chargeDate,
      settings.dateToleranceDays
    )
    if (!dateCheck.within) continue

    // Calculate discrepancy
    const bankAmount = Math.abs(bankTx.amount_agorot)
    const discrepancy = Math.abs(bankAmount - group.totalAmountAgorot)
    const discrepancyPercent = bankAmount > 0 ? (discrepancy / bankAmount) * 100 : 0

    // Calculate confidence
    const confidence = calculateConfidence(
      dateCheck.daysDiff,
      settings.dateToleranceDays,
      discrepancyPercent,
      settings.amountTolerancePercent
    )

    // Keep best match (highest confidence)
    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = {
        bankTx,
        confidence,
        daysDiff: dateCheck.daysDiff,
      }
    }
  }

  return bestMatch
}

/**
 * Run CC-Bank matching algorithm
 *
 * Algorithm:
 * 1. Fetch unmatched CC transactions
 * 2. Group by (card_last_four, charge_date) using Map
 * 3. Fetch bank CC charges (is_credit_card_charge = true)
 * 4. For each group, find bank tx where:
 *    - detectCreditCardCharge(description) === card_last_four
 *    - date within ±N days of charge_date
 * 5. Score by date proximity + amount similarity
 * 6. Calculate discrepancy: bank_amount - SUM(cc_amounts)
 * 7. Batch update CC transactions with bank_transaction_id
 * 8. Insert match result record
 */
export async function runCCBankMatching(
  userId: string,
  settings: MatchingSettings
): Promise<MatchingResult> {
  const result: MatchingResult = {
    matchedGroups: 0,
    matchedCCTransactions: 0,
    totalDiscrepancyAgorot: 0,
    errors: [],
  }

  try {
    // 1. Fetch unmatched CC transactions
    const { data: unmatchedCC, error: ccError } = await supabase
      .from('credit_card_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('match_status', 'unmatched')

    if (ccError) {
      result.errors.push(`Failed to fetch CC transactions: ${ccError.message}`)
      return result
    }

    if (!unmatchedCC || unmatchedCC.length === 0) {
      return result // Nothing to match
    }

    // 2. Group by (card_last_four, charge_date)
    const ccGroups = groupCCTransactions(unmatchedCC)

    // 3. Fetch bank CC charges
    const { data: bankCharges, error: bankError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_credit_card_charge', true)

    if (bankError) {
      result.errors.push(`Failed to fetch bank charges: ${bankError.message}`)
      return result
    }

    if (!bankCharges || bankCharges.length === 0) {
      return result // No bank charges to match against
    }

    // Process groups in batches
    const groupEntries = Array.from(ccGroups.entries())
    const matchResults: CCBankMatchResultInsert[] = []
    const updateBatches: { ccIds: string[]; bankTxId: string; confidence: number }[] = []

    // 4-6. Match each group
    for (const [, group] of groupEntries) {
      const match = findBestBankMatch(group, bankCharges, settings)
      if (!match) continue

      const bankAmount = Math.abs(match.bankTx.amount_agorot)
      const discrepancy = bankAmount - group.totalAmountAgorot
      const discrepancyPercent = bankAmount > 0 ? (Math.abs(discrepancy) / bankAmount) * 100 : 0

      // Prepare match result record
      matchResults.push({
        user_id: userId,
        bank_transaction_id: match.bankTx.id,
        card_last_four: group.cardLastFour,
        charge_date: group.chargeDate,
        total_cc_amount_agorot: group.totalAmountAgorot,
        bank_amount_agorot: bankAmount,
        discrepancy_agorot: discrepancy,
        discrepancy_percent: discrepancyPercent,
        cc_transaction_count: group.transactions.length,
        match_confidence: match.confidence,
        status: 'pending',
      })

      // Prepare CC transaction updates
      updateBatches.push({
        ccIds: group.transactions.map(tx => tx.id),
        bankTxId: match.bankTx.id,
        confidence: match.confidence,
      })

      result.matchedGroups++
      result.matchedCCTransactions += group.transactions.length
      result.totalDiscrepancyAgorot += discrepancy
    }

    // 7. Batch update CC transactions
    for (let i = 0; i < updateBatches.length; i += BATCH_SIZE) {
      const batch = updateBatches.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async ({ ccIds, bankTxId, confidence }) => {
          // Update CC transactions
          const { error: updateError } = await supabase
            .from('credit_card_transactions')
            .update({
              bank_transaction_id: bankTxId,
              match_status: 'matched',
              match_confidence: confidence,
            })
            .in('id', ccIds)

          if (updateError) {
            result.errors.push(`Failed to update CC transactions: ${updateError.message}`)
          }
        })
      )

      // Add delay between batches
      if (i + BATCH_SIZE < updateBatches.length) {
        await delay(BATCH_DELAY_MS)
      }
    }

    // 8. Insert match results (delete old ones first to avoid duplicates)
    if (matchResults.length > 0) {
      // Get bank transaction IDs we're inserting
      const bankTxIds = matchResults.map(r => r.bank_transaction_id)

      // Delete existing match results for these bank transactions
      await supabase
        .from('cc_bank_match_results')
        .delete()
        .eq('user_id', userId)
        .in('bank_transaction_id', bankTxIds)

      // Insert new match results
      const { error: insertError } = await supabase
        .from('cc_bank_match_results')
        .insert(matchResults)

      if (insertError) {
        result.errors.push(`Failed to insert match results: ${insertError.message}`)
      }
    }

    return result
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown error')
    return result
  }
}

/**
 * Normalize merchant name for a CC transaction and update the record
 */
export async function normalizeCCMerchant(
  transactionId: string,
  merchantName: string
): Promise<void> {
  const normalized = normalizeMerchantName(merchantName)
  await supabase
    .from('credit_card_transactions')
    .update({ normalized_merchant: normalized })
    .eq('id', transactionId)
}

/**
 * Batch normalize all CC transactions without normalized_merchant
 */
export async function batchNormalizeCCMerchants(userId: string): Promise<number> {
  const { data: transactions, error } = await supabase
    .from('credit_card_transactions')
    .select('id, merchant_name')
    .eq('user_id', userId)
    .is('normalized_merchant', null)

  if (error || !transactions) return 0

  let updated = 0
  for (const tx of transactions) {
    const normalized = normalizeMerchantName(tx.merchant_name)
    const { error: updateError } = await supabase
      .from('credit_card_transactions')
      .update({ normalized_merchant: normalized })
      .eq('id', tx.id)

    if (!updateError) updated++
  }

  return updated
}
