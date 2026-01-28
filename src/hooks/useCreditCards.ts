import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CreditCard, Transaction } from '@/types/database'

// Extended transaction with joined credit card info
export interface TransactionWithCard extends Transaction {
  credit_card?: {
    card_last_four: string
    card_name: string | null
    card_type: string
  } | null
}

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

/**
 * Hook for deleting a credit card and unlinking its transactions
 */
export function useDeleteCreditCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cardId: string) => {
      // First, unlink all transactions from this card
      const { error: unlinkError } = await supabase
        .from('transactions')
        .update({ linked_credit_card_id: null })
        .eq('linked_credit_card_id', cardId)

      if (unlinkError) {
        throw new Error(`Failed to unlink transactions: ${unlinkError.message}`)
      }

      // Then delete the credit card
      const { error: deleteError } = await supabase
        .from('credit_cards')
        .delete()
        .eq('id', cardId)

      if (deleteError) {
        throw new Error(`Failed to delete card: ${deleteError.message}`)
      }

      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_cards'] })
      queryClient.invalidateQueries({ queryKey: ['credit_card_transactions'] })
    },
  })
}

interface CreateCreditCardInput {
  cardLastFour: string
  cardName?: string
  cardType: string
}

/**
 * Hook for creating a new credit card
 */
export function useCreateCreditCard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCreditCardInput) => {
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('credit_cards')
        .insert({
          user_id: user.id,
          card_last_four: input.cardLastFour,
          card_name: input.cardName || null,
          card_type: input.cardType,
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create card: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_cards'] })
    },
  })
}

interface UpdateCreditCardInput {
  id: string
  cardName?: string
}

/**
 * Hook for updating a credit card (e.g., renaming)
 */
export function useUpdateCreditCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateCreditCardInput) => {
      const { data, error } = await supabase
        .from('credit_cards')
        .update({ card_name: input.cardName || null })
        .eq('id', input.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update card: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_cards'] })
    },
  })
}

interface UseCreditCardTransactionsReturn {
  transactions: TransactionWithCard[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<any>
}

async function fetchCreditCardTransactions(
  userId: string,
  cardId?: string
): Promise<TransactionWithCard[]> {
  console.log('[useCreditCardTransactions] Fetching transactions for user:', userId, 'card:', cardId)

  // Join with credit_cards to get card_last_four
  let query = supabase
    .from('transactions')
    .select(`
      *,
      credit_card:credit_cards!linked_credit_card_id (
        card_last_four,
        card_name,
        card_type
      )
    `)
    .eq('user_id', userId)
    .eq('is_credit_card_charge', false)
    .not('linked_credit_card_id', 'is', null)

  if (cardId) {
    query = query.eq('linked_credit_card_id', cardId)
  }

  const { data, error } = await query.order('date', { ascending: false })

  console.log('[useCreditCardTransactions] Fetch result:', { count: data?.length, error })
  if (error) throw error
  return (data || []) as TransactionWithCard[]
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
