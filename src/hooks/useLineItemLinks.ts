/**
 * Hook for managing line item links to transactions
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getTransactionLinkCounts } from '@/lib/services/lineItemMatcher'

interface UseLineItemLinksOptions {
  transactionIds: string[]
  enabled?: boolean
}

/**
 * Hook to fetch link counts for multiple transactions
 */
export function useTransactionLinkCounts({ transactionIds, enabled = true }: UseLineItemLinksOptions) {
  const [linkCounts, setLinkCounts] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use a ref to store the serialized transaction IDs for stable comparison
  const transactionIdsKey = JSON.stringify(transactionIds.slice().sort())
  const prevKeyRef = useRef<string>('')

  const fetchCounts = useCallback(async (ids: string[]) => {
    if (!enabled || ids.length === 0) {
      setLinkCounts(new Map())
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const counts = await getTransactionLinkCounts(ids)
      setLinkCounts(counts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch link counts')
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    // Only fetch if the transaction IDs actually changed
    if (transactionIdsKey !== prevKeyRef.current) {
      prevKeyRef.current = transactionIdsKey
      fetchCounts(transactionIds)
    }
  }, [transactionIdsKey, transactionIds, fetchCounts])

  const refetch = useCallback(() => {
    fetchCounts(transactionIds)
  }, [fetchCounts, transactionIds])

  return {
    linkCounts,
    isLoading,
    error,
    refetch,
  }
}
