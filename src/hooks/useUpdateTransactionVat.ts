import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { normalizeMerchantName, isSameMerchant } from '@/lib/utils/merchantParser'

interface VatUpdateData {
  hasVat: boolean
  vatPercentage: number
}

/**
 * Helper to bulk update transactions using RPC to avoid URL length limits
 */
async function bulkUpdateTransactions(
  ids: string[],
  updateData: { has_vat?: boolean; vat_percentage?: number; vat_amount_agorot?: number | null }
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('bulk_update_transactions', {
    ids,
    update_data: updateData
  })
  if (error) return { error }
  return { error: null }
}

export function useUpdateTransactionVat() {
  const [isUpdating, setIsUpdating] = useState(false)

  /**
   * Update VAT for a single transaction
   */
  const updateSingle = async (
    transactionId: string,
    amountAgorot: number,
    { hasVat, vatPercentage }: VatUpdateData
  ) => {
    setIsUpdating(true)
    try {
      const vatAmountAgorot = hasVat
        ? calculateVatFromTotal(amountAgorot, vatPercentage)
        : null

      const { error } = await supabase
        .from('transactions')
        .update({
          has_vat: hasVat,
          vat_percentage: vatPercentage,
          vat_amount_agorot: vatAmountAgorot,
        })
        .eq('id', transactionId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('[useUpdateTransactionVat] updateSingle error:', error)
      return { success: false, error }
    } finally {
      setIsUpdating(false)
    }
  }

  /**
   * Update VAT for multiple transactions at once (batch)
   * Optimized to avoid N+1 queries
   */
  const updateBatch = async (
    transactions: Array<{ id: string; amount_agorot: number }>,
    { hasVat, vatPercentage }: VatUpdateData
  ) => {
    if (transactions.length === 0) return { success: true, count: 0 }

    setIsUpdating(true)
    try {
      const ids = transactions.map((tx) => tx.id)

      // If no VAT, bulk update in batches
      if (!hasVat) {
        const { error } = await bulkUpdateTransactions(ids, {
          has_vat: false,
          vat_percentage: vatPercentage,
          vat_amount_agorot: null,
        })

        if (error) throw error
        return { success: true, count: transactions.length }
      }

      // With VAT, each row needs calculated vat_amount_agorot
      // Group by computed VAT amount to batch where possible
      const byVatAmount = new Map<number, string[]>()

      for (const tx of transactions) {
        const vatAmountAgorot = calculateVatFromTotal(tx.amount_agorot, vatPercentage)
        const existing = byVatAmount.get(vatAmountAgorot) || []
        existing.push(tx.id)
        byVatAmount.set(vatAmountAgorot, existing)
      }

      // Batch update all transactions with the same VAT amount together
      for (const [vatAmountAgorot, groupIds] of byVatAmount.entries()) {
        const { error } = await bulkUpdateTransactions(groupIds, {
          has_vat: true,
          vat_percentage: vatPercentage,
          vat_amount_agorot: vatAmountAgorot,
        })
        if (error) throw error
      }

      return { success: true, count: transactions.length }
    } catch (error) {
      console.error('[useUpdateTransactionVat] updateBatch error:', error)
      return { success: false, error }
    } finally {
      setIsUpdating(false)
    }
  }

  /**
   * Update VAT for all transactions matching a merchant name pattern
   * Uses smart merchant matching with fuzzy matching and first-word matching
   * (e.g., FACEBK *ABC123 and FACEBK *XYZ789, Upwork -REF123 and Upwork -REF456)
   */
  const updateAllByMerchant = async (
    userId: string,
    merchantName: string,
    { hasVat, vatPercentage }: VatUpdateData,
    teamId?: string | null
  ) => {
    setIsUpdating(true)
    try {
      // Fetch all transactions for this user (we'll filter in JS for smart matching)
      // Paginate to handle >1000 transactions (Supabase default limit)
      const allTransactions: Array<{
        id: string
        amount_agorot: number
        description: string
        is_income: boolean
        credit_card_id: string | null
        transaction_type: string | null
      }> = []
      const PAGE_SIZE = 1000
      let offset = 0
      let hasMore = true

      while (hasMore) {
        let txQuery = supabase
          .from('transactions')
          .select('id, amount_agorot, description, is_income, credit_card_id, transaction_type')
          .eq('user_id', userId)

        if (teamId) {
          txQuery = txQuery.eq('team_id', teamId)
        }

        const { data, error: fetchError } = await txQuery.range(offset, offset + PAGE_SIZE - 1)

        if (fetchError) throw fetchError

        if (data && data.length > 0) {
          allTransactions.push(...data)
          offset += PAGE_SIZE
          hasMore = data.length === PAGE_SIZE
        } else {
          hasMore = false
        }
      }

      if (allTransactions.length === 0) {
        return { success: true, count: 0 }
      }

      // Filter transactions that match the merchant using fuzzy matching
      // For bank transactions: exclude income (income doesn't need VAT)
      // For credit card transactions: include all (CC expenses may have is_income wrongly set)
      const matchingTransactions = allTransactions.filter((tx) => {
        const isCreditCard = tx.transaction_type === 'cc_purchase' || tx.credit_card_id !== null
        // Skip bank income transactions (not CC transactions)
        if (!isCreditCard && tx.is_income) return false
        return isSameMerchant(tx.description, merchantName)
      })

      if (matchingTransactions.length === 0) {
        return { success: true, count: 0 }
      }

      const matchingIds = matchingTransactions.map((tx) => tx.id)

      // If no VAT, bulk update in batches
      if (!hasVat) {
        const { error } = await bulkUpdateTransactions(matchingIds, {
          has_vat: false,
          vat_percentage: vatPercentage,
          vat_amount_agorot: null,
        })

        if (error) throw error
        return { success: true, count: matchingTransactions.length }
      }

      // With VAT, each row needs calculated vat_amount_agorot
      // Group by computed VAT amount to batch where possible
      const byVatAmount = new Map<number, string[]>()

      for (const tx of matchingTransactions) {
        const vatAmountAgorot = calculateVatFromTotal(tx.amount_agorot, vatPercentage)
        const existing = byVatAmount.get(vatAmountAgorot) || []
        existing.push(tx.id)
        byVatAmount.set(vatAmountAgorot, existing)
      }

      // Batch update all transactions with the same VAT amount together
      for (const [vatAmountAgorot, groupIds] of byVatAmount.entries()) {
        const { error } = await bulkUpdateTransactions(groupIds, {
          has_vat: true,
          vat_percentage: vatPercentage,
          vat_amount_agorot: vatAmountAgorot,
        })
        if (error) throw error
      }

      return { success: true, count: matchingTransactions.length }
    } catch (error) {
      console.error('[useUpdateTransactionVat] updateAllByMerchant error:', error)
      return { success: false, error }
    } finally {
      setIsUpdating(false)
    }
  }

  /**
   * Save merchant VAT preference for future imports
   */
  const saveMerchantPreference = async (
    userId: string,
    merchantName: string,
    { hasVat, vatPercentage }: VatUpdateData,
    teamId?: string | null
  ) => {
    setIsUpdating(true)
    try {
      const normalizedName = normalizeMerchantName(merchantName)

      const { error } = await supabase
        .from('merchant_vat_preferences')
        .upsert(
          {
            user_id: userId,
            team_id: teamId || null,
            merchant_name: normalizedName,
            has_vat: hasVat,
            vat_percentage: vatPercentage,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,team_id,merchant_name',
          }
        )

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('[useUpdateTransactionVat] saveMerchantPreference error:', error)
      return { success: false, error }
    } finally {
      setIsUpdating(false)
    }
  }

  /**
   * Save multiple merchant VAT preferences in a single batch operation
   */
  const saveMerchantPreferencesBatch = async (
    userId: string,
    merchantNames: string[],
    { hasVat, vatPercentage }: VatUpdateData,
    teamId?: string | null
  ) => {
    if (merchantNames.length === 0) return { success: true }

    setIsUpdating(true)
    try {
      const now = new Date().toISOString()
      const records = merchantNames.map((name) => ({
        user_id: userId,
        team_id: teamId || null,
        merchant_name: normalizeMerchantName(name),
        has_vat: hasVat,
        vat_percentage: vatPercentage,
        updated_at: now,
      }))

      const { error } = await supabase
        .from('merchant_vat_preferences')
        .upsert(records, {
          onConflict: 'user_id,team_id,merchant_name',
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('[useUpdateTransactionVat] saveMerchantPreferencesBatch error:', error)
      return { success: false, error }
    } finally {
      setIsUpdating(false)
    }
  }

  /**
   * Get merchant VAT preference if it exists
   */
  const getMerchantPreference = async (userId: string, merchantName: string) => {
    try {
      const normalizedName = normalizeMerchantName(merchantName)

      const { data, error } = await supabase
        .from('merchant_vat_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('merchant_name', normalizedName)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, which is OK
        throw error
      }

      return data || null
    } catch (error) {
      console.error('[useUpdateTransactionVat] getMerchantPreference error:', error)
      return null
    }
  }

  return {
    isUpdating,
    updateSingle,
    updateBatch,
    updateAllByMerchant,
    saveMerchantPreference,
    saveMerchantPreferencesBatch,
    getMerchantPreference,
  }
}
