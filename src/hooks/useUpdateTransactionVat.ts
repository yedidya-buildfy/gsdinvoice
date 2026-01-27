import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { normalizeMerchantName, getMerchantBaseKey } from '@/lib/utils/merchantParser'

interface VatUpdateData {
  hasVat: boolean
  vatPercentage: number
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
   * Update VAT for all transactions matching a merchant name pattern
   * Uses smart merchant matching to group similar merchants (e.g., FACEBK *ABC123 and FACEBK *XYZ789)
   */
  const updateAllByMerchant = async (
    userId: string,
    merchantName: string,
    { hasVat, vatPercentage }: VatUpdateData
  ) => {
    setIsUpdating(true)
    try {
      // Get the base key for the merchant we're looking for
      const targetKey = getMerchantBaseKey(merchantName)

      // Fetch all transactions for this user (we'll filter in JS for smart matching)
      const { data: allTransactions, error: fetchError } = await supabase
        .from('transactions')
        .select('id, amount_agorot, description, is_income')
        .eq('user_id', userId)

      if (fetchError) throw fetchError

      if (!allTransactions || allTransactions.length === 0) {
        return { success: true, count: 0 }
      }

      // Filter transactions that match the merchant (excluding income)
      const matchingTransactions = allTransactions.filter((tx) => {
        if (tx.is_income) return false
        const txKey = getMerchantBaseKey(tx.description)
        return txKey === targetKey
      })

      if (matchingTransactions.length === 0) {
        return { success: true, count: 0 }
      }

      // Update each matching transaction with calculated VAT
      for (const tx of matchingTransactions) {
        const vatAmountAgorot = hasVat
          ? calculateVatFromTotal(tx.amount_agorot, vatPercentage)
          : null

        const { error } = await supabase
          .from('transactions')
          .update({
            has_vat: hasVat,
            vat_percentage: vatPercentage,
            vat_amount_agorot: vatAmountAgorot,
          })
          .eq('id', tx.id)

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
    { hasVat, vatPercentage }: VatUpdateData
  ) => {
    setIsUpdating(true)
    try {
      const normalizedName = normalizeMerchantName(merchantName)

      const { error } = await supabase
        .from('merchant_vat_preferences')
        .upsert(
          {
            user_id: userId,
            merchant_name: normalizedName,
            has_vat: hasVat,
            vat_percentage: vatPercentage,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,merchant_name',
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
    updateAllByMerchant,
    saveMerchantPreference,
    getMerchantPreference,
  }
}
