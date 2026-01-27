import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Transaction } from '@/types/database'

interface UseTransactionsReturn {
  transactions: Transaction[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  if (error) throw error
  return data || []
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
