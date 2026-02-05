import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import type { Transaction } from '@/types/database'

interface UseTransactionsReturn {
  transactions: Transaction[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

async function fetchTransactions(
  userId: string,
  teamId: string | null
): Promise<Transaction[]> {
  console.log('[useTransactions] Fetching transactions for user:', userId, 'team:', teamId)

  // Fetch all transactions - Supabase default limit is 1000, so we need to paginate
  const allTransactions: Transaction[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    // Filter by team if provided, otherwise get personal transactions (no team)
    if (teamId) {
      query = query.eq('team_id', teamId)
    } else {
      query = query.is('team_id', null)
    }

    const { data, error } = await query

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
  const { currentTeam } = useTeam()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transactions', user?.id, currentTeam?.id],
    queryFn: () => fetchTransactions(user!.id, currentTeam?.id ?? null),
    enabled: !!user && !!currentTeam,
    staleTime: 30000, // 30s consistent with project pattern
  })

  return {
    transactions: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
