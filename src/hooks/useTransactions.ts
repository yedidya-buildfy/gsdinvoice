import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Transaction } from '@/types/database'

interface UseTransactionsReturn {
  transactions: Transaction[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

async function fetchTransactions(userId: string): Promise<Transaction[]> {
  console.log('[useTransactions] Fetching transactions for user:', userId)

  // Fetch all transactions - Supabase default limit is 1000, so we need to paginate
  const allTransactions: Transaction[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error

    if (data && data.length > 0) {
      allTransactions.push(...data)
      offset += PAGE_SIZE
      hasMore = data.length === PAGE_SIZE
    } else {
      hasMore = false
    }
  }

  console.log('[useTransactions] Fetch result:', { count: allTransactions.length })
  return allTransactions
}

export function useTransactions(): UseTransactionsReturn {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: () => fetchTransactions(user!.id),
    enabled: !!user,
    staleTime: 30000, // 30s consistent with project pattern
  })

  return {
    transactions: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
