import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CreditCard, Transaction } from '@/types/database'

interface UseCreditCardsReturn {
  creditCards: CreditCard[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<any>
}

async function fetchCreditCards(userId: string): Promise<CreditCard[]> {
  console.log('[useCreditCards] Fetching credit cards for user:', userId)
  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  console.log('[useCreditCards] Fetch result:', { count: data?.length, error })
  if (error) throw error
  return data || []
}

export function useCreditCards(): UseCreditCardsReturn {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['credit_cards', user?.id],
    queryFn: () => fetchCreditCards(user!.id),
    enabled: !!user,
    staleTime: 30000, // 30s consistent with project pattern
  })

  return {
    creditCards: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

interface UseCreditCardTransactionsReturn {
  transactions: Transaction[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<any>
}

async function fetchCreditCardTransactions(
  userId: string,
  cardId?: string
): Promise<Transaction[]> {
  console.log('[useCreditCardTransactions] Fetching transactions for user:', userId, 'card:', cardId)

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_credit_card_charge', false)
    .not('linked_credit_card_id', 'is', null)

  if (cardId) {
    query = query.eq('linked_credit_card_id', cardId)
  }

  const { data, error } = await query.order('date', { ascending: false })

  console.log('[useCreditCardTransactions] Fetch result:', { count: data?.length, error })
  if (error) throw error
  return data || []
}

export function useCreditCardTransactions(cardId?: string): UseCreditCardTransactionsReturn {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['credit_card_transactions', user?.id, cardId],
    queryFn: () => fetchCreditCardTransactions(user!.id, cardId),
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
