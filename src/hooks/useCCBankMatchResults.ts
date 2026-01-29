import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CCBankMatchResult, CreditCardTransaction, Transaction } from '@/types/database'

export interface MatchResultWithDetails extends CCBankMatchResult {
  bank_transaction: Transaction
  cc_transactions: CreditCardTransaction[]
}

interface UseCCBankMatchResultsReturn {
  matchResults: MatchResultWithDetails[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

interface MatchSummary {
  totalMatches: number
  totalDiscrepancyAgorot: number
  avgConfidence: number
  totalCCTransactions: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

interface UseCCBankMatchSummaryReturn {
  summary: MatchSummary
  isLoading: boolean
  error: Error | null
}

async function fetchMatchResults(userId: string): Promise<MatchResultWithDetails[]> {
  // Fetch match results
  const { data: results, error: resultsError } = await supabase
    .from('cc_bank_match_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (resultsError) throw resultsError
  if (!results || results.length === 0) return []

  // Fetch bank transactions for the results
  const bankTxIds = results.map(r => r.bank_transaction_id)
  const { data: bankTxs, error: bankError } = await supabase
    .from('transactions')
    .select('*')
    .in('id', bankTxIds)

  if (bankError) throw bankError

  // Create lookup map for bank transactions
  const bankTxMap = new Map((bankTxs || []).map(tx => [tx.id, tx]))

  // Fetch CC transactions for each result
  const { data: ccTxs, error: ccError } = await supabase
    .from('credit_card_transactions')
    .select('*')
    .in('bank_transaction_id', bankTxIds)

  if (ccError) throw ccError

  // Group CC transactions by bank_transaction_id
  const ccTxsByBankId = new Map<string, CreditCardTransaction[]>()
  for (const ccTx of ccTxs || []) {
    if (!ccTx.bank_transaction_id) continue
    const existing = ccTxsByBankId.get(ccTx.bank_transaction_id) || []
    existing.push(ccTx)
    ccTxsByBankId.set(ccTx.bank_transaction_id, existing)
  }

  // Combine results with their bank transaction and CC transactions
  const resultsWithDetails: MatchResultWithDetails[] = results
    .map(result => ({
      ...result,
      bank_transaction: bankTxMap.get(result.bank_transaction_id)!,
      cc_transactions: ccTxsByBankId.get(result.bank_transaction_id) || [],
    }))
    .filter(r => r.bank_transaction) // Filter out any with missing bank transactions

  return resultsWithDetails
}

export function useCCBankMatchResults(): UseCCBankMatchResultsReturn {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cc-bank-match-results', user?.id],
    queryFn: () => fetchMatchResults(user!.id),
    enabled: !!user,
    staleTime: 30000, // 30s cache
  })

  return {
    matchResults: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

export function useCCBankMatchSummary(): UseCCBankMatchSummaryReturn {
  const { matchResults, isLoading, error } = useCCBankMatchResults()

  const summary: MatchSummary = {
    totalMatches: matchResults.length,
    totalDiscrepancyAgorot: matchResults.reduce((sum, r) => sum + Math.abs(r.discrepancy_agorot), 0),
    avgConfidence: matchResults.length > 0
      ? matchResults.reduce((sum, r) => sum + r.match_confidence, 0) / matchResults.length
      : 0,
    totalCCTransactions: matchResults.reduce((sum, r) => sum + r.cc_transaction_count, 0),
    pendingCount: matchResults.filter(r => r.status === 'pending').length,
    approvedCount: matchResults.filter(r => r.status === 'approved').length,
    rejectedCount: matchResults.filter(r => r.status === 'rejected').length,
  }

  return {
    summary,
    isLoading,
    error,
  }
}

interface UseUpdateMatchStatusReturn {
  updateStatus: (matchId: string, status: 'pending' | 'approved' | 'rejected') => Promise<void>
  isUpdating: boolean
}

export function useUpdateMatchStatus(): UseUpdateMatchStatusReturn {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const mutation = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: string; status: string }) => {
      const { error } = await supabase
        .from('cc_bank_match_results')
        .update({ status })
        .eq('id', matchId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cc-bank-match-results', user?.id] })
    },
  })

  return {
    updateStatus: async (matchId: string, status: 'pending' | 'approved' | 'rejected') => {
      await mutation.mutateAsync({ matchId, status })
    },
    isUpdating: mutation.isPending,
  }
}

interface UseUnmatchCCTransactionsReturn {
  unmatch: (matchId: string, ccTransactionIds: string[]) => Promise<void>
  isUnmatching: boolean
}

export function useUnmatchCCTransactions(): UseUnmatchCCTransactionsReturn {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const mutation = useMutation({
    mutationFn: async ({ matchId, ccTransactionIds }: { matchId: string; ccTransactionIds: string[] }) => {
      // Reset CC transactions to unmatched
      const { error: ccError } = await supabase
        .from('credit_card_transactions')
        .update({
          bank_transaction_id: null,
          match_status: 'unmatched',
          match_confidence: null,
        })
        .in('id', ccTransactionIds)

      if (ccError) throw ccError

      // Fetch current match result to check remaining transactions
      const { data: matchResult, error: fetchError } = await supabase
        .from('cc_bank_match_results')
        .select('*, bank_transaction_id')
        .eq('id', matchId)
        .single()

      if (fetchError) throw fetchError

      // Count remaining linked CC transactions
      const { count, error: countError } = await supabase
        .from('credit_card_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('bank_transaction_id', matchResult.bank_transaction_id)

      if (countError) throw countError

      if (count === 0) {
        // No remaining transactions, delete the match result
        const { error: matchError } = await supabase
          .from('cc_bank_match_results')
          .delete()
          .eq('id', matchId)

        if (matchError) throw matchError
      } else {
        // Update match result totals
        const { data: remainingTxs, error: txError } = await supabase
          .from('credit_card_transactions')
          .select('amount_agorot')
          .eq('bank_transaction_id', matchResult.bank_transaction_id)

        if (txError) throw txError

        const totalCCAmount = remainingTxs.reduce((sum, tx) => sum + tx.amount_agorot, 0)
        const discrepancy = matchResult.bank_amount_agorot - totalCCAmount

        const { error: updateError } = await supabase
          .from('cc_bank_match_results')
          .update({
            total_cc_amount_agorot: totalCCAmount,
            cc_transaction_count: remainingTxs.length,
            discrepancy_agorot: discrepancy,
          })
          .eq('id', matchId)

        if (updateError) throw updateError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cc-bank-match-results', user?.id] })
    },
  })

  return {
    unmatch: async (matchId: string, ccTransactionIds: string[]) => {
      await mutation.mutateAsync({ matchId, ccTransactionIds })
    },
    isUnmatching: mutation.isPending,
  }
}

// Hook to fetch CC transactions with flexible filtering
// Queries from `transactions` table (same source as CC page) for consistency
interface CCTransactionFilters {
  fromDate?: string
  toDate?: string
  cardIds?: string[]  // Filter by linked_credit_card_id (empty = all cards)
  dateField?: 'transaction_date' | 'charge_date'  // Maps to: date / value_date in transactions table
  connectionStatus?: 'all' | 'connected' | 'not_connected'
}

// Shape returned by this hook (mapped from transactions table)
export interface CCTransactionDisplay {
  id: string
  transaction_date: string
  charge_date: string | null
  merchant_name: string
  amount_agorot: number
  card_last_four: string | null
  card_name: string | null
  linked_credit_card_id: string | null
  bank_transaction_id: string | null
  hash: string | null
}

interface UseCCTransactionsReturn {
  transactions: CCTransactionDisplay[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

export function useCCTransactions(filters: CCTransactionFilters): UseCCTransactionsReturn {
  const { user } = useAuth()
  const dateField = filters.dateField || 'transaction_date'
  const connectionStatus = filters.connectionStatus || 'not_connected'

  // Map dateField to transactions table column names
  const dbDateField = dateField === 'transaction_date' ? 'date' : 'value_date'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cc-transactions-display', user?.id, filters],
    queryFn: async () => {
      // Query from transactions table (same as CC page) where linked_credit_card_id is set
      let query = supabase
        .from('transactions')
        .select('id, date, value_date, description, amount_agorot, hash, linked_credit_card_id, match_status, credit_cards!inner(card_last_four, card_name)')
        .eq('user_id', user!.id)
        .not('linked_credit_card_id', 'is', null)
        .order(dbDateField, { ascending: false })

      // Apply connection status filter based on match_status
      if (connectionStatus === 'connected') {
        query = query.neq('match_status', 'unmatched')
      } else if (connectionStatus === 'not_connected') {
        query = query.eq('match_status', 'unmatched')
      }
      // 'all' = no filter on match_status

      if (filters.fromDate) {
        query = query.gte(dbDateField, filters.fromDate)
      }
      if (filters.toDate) {
        query = query.lte(dbDateField, filters.toDate)
      }

      // Filter by card IDs if specified
      if (filters.cardIds && filters.cardIds.length > 0) {
        query = query.in('linked_credit_card_id', filters.cardIds)
      }

      const { data, error } = await query

      if (error) throw error

      // Map to CCTransactionDisplay shape
      const mapped: CCTransactionDisplay[] = (data || []).map((tx: Record<string, unknown>) => {
        const creditCard = tx.credit_cards as { card_last_four: string; card_name: string | null } | null
        return {
          id: tx.id as string,
          transaction_date: tx.date as string,
          charge_date: tx.value_date as string | null,
          merchant_name: tx.description as string,
          amount_agorot: tx.amount_agorot as number,
          card_last_four: creditCard?.card_last_four || null,
          card_name: creditCard?.card_name || null,
          linked_credit_card_id: tx.linked_credit_card_id as string | null,
          bank_transaction_id: tx.match_status !== 'unmatched' ? 'linked' : null, // Use match_status as proxy
          hash: tx.hash as string | null,
        }
      })

      return mapped
    },
    enabled: !!user,
    staleTime: 30000,
  })

  return {
    transactions: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

// Legacy alias for backwards compatibility
interface UnmatchedCCFilters {
  fromDate?: string
  toDate?: string
  cardLastFour?: string
}

interface UseUnmatchedCCTransactionsReturn {
  transactions: CCTransactionDisplay[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

export function useUnmatchedCCTransactions(filters: UnmatchedCCFilters): UseUnmatchedCCTransactionsReturn {
  return useCCTransactions({
    ...filters,
    connectionStatus: 'not_connected',
    dateField: 'transaction_date',
  })
}

// Hook to attach CC transactions to a bank transaction
interface UseAttachCCTransactionsReturn {
  attach: (bankTransactionId: string, ccTransactionIds: string[]) => Promise<void>
  isAttaching: boolean
}

export function useAttachCCTransactions(): UseAttachCCTransactionsReturn {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const mutation = useMutation({
    mutationFn: async ({ bankTransactionId, ccTransactionIds }: { bankTransactionId: string; ccTransactionIds: string[] }) => {
      // The ccTransactionIds might be from the `transactions` table (CC page display)
      // or from `credit_card_transactions` table. We need to handle both cases.

      // First, try to find these IDs in credit_card_transactions directly
      const { data: directMatch } = await supabase
        .from('credit_card_transactions')
        .select('id')
        .in('id', ccTransactionIds)

      let ccTxIdsToUpdate = ccTransactionIds

      // If no direct match, these IDs are from the transactions table
      // Look up the hashes and find corresponding credit_card_transactions
      if (!directMatch || directMatch.length === 0) {
        // Get hashes from transactions table
        const { data: txHashes, error: hashError } = await supabase
          .from('transactions')
          .select('hash')
          .in('id', ccTransactionIds)

        if (hashError) throw hashError

        const hashes = txHashes?.map(t => t.hash).filter(Boolean) || []

        if (hashes.length > 0) {
          // Find credit_card_transactions with matching hashes
          const { data: ccTxs, error: ccLookupError } = await supabase
            .from('credit_card_transactions')
            .select('id')
            .in('hash', hashes)

          if (ccLookupError) throw ccLookupError

          ccTxIdsToUpdate = ccTxs?.map(t => t.id) || []
        }
      }

      if (ccTxIdsToUpdate.length === 0) {
        throw new Error('No matching credit card transactions found')
      }

      // Update CC transactions to link to bank transaction
      const { error: ccError } = await supabase
        .from('credit_card_transactions')
        .update({
          bank_transaction_id: bankTransactionId,
          match_status: 'manual',
          match_confidence: 100,
        })
        .in('id', ccTxIdsToUpdate)

      if (ccError) throw ccError

      // Check if a match result already exists
      const { data: existingMatch, error: fetchError } = await supabase
        .from('cc_bank_match_results')
        .select('*')
        .eq('bank_transaction_id', bankTransactionId)
        .maybeSingle()

      if (fetchError) throw fetchError

      // Fetch all linked CC transactions to calculate totals
      const { data: allLinkedTxs, error: linkedError } = await supabase
        .from('credit_card_transactions')
        .select('amount_agorot, card_last_four, transaction_date')
        .eq('bank_transaction_id', bankTransactionId)

      if (linkedError) throw linkedError

      const totalCCAmount = allLinkedTxs.reduce((sum, tx) => sum + tx.amount_agorot, 0)
      const txCount = allLinkedTxs.length

      // Fetch bank transaction amount and date
      const { data: bankTx, error: bankError } = await supabase
        .from('transactions')
        .select('amount_agorot, date')
        .eq('id', bankTransactionId)
        .single()

      if (bankError) throw bankError

      const bankAmount = bankTx.amount_agorot
      const discrepancy = bankAmount - totalCCAmount

      if (existingMatch) {
        // Update existing match result
        const { error: updateError } = await supabase
          .from('cc_bank_match_results')
          .update({
            total_cc_amount_agorot: totalCCAmount,
            cc_transaction_count: txCount,
            discrepancy_agorot: discrepancy,
          })
          .eq('id', existingMatch.id)

        if (updateError) throw updateError
      } else {
        // Get card_last_four from the first CC transaction, use bank date for charge_date
        const cardLastFour = allLinkedTxs[0]?.card_last_four || 'XXXX'
        const chargeDate = bankTx.date

        // Create new match result
        const { error: createError } = await supabase
          .from('cc_bank_match_results')
          .insert({
            user_id: user!.id,
            bank_transaction_id: bankTransactionId,
            card_last_four: cardLastFour,
            charge_date: chargeDate,
            bank_amount_agorot: bankAmount,
            total_cc_amount_agorot: totalCCAmount,
            cc_transaction_count: txCount,
            discrepancy_agorot: discrepancy,
            match_confidence: 100,
            status: 'pending',
          })

        if (createError) throw createError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cc-bank-match-results', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['unmatched-cc-transactions', user?.id] })
    },
  })

  return {
    attach: async (bankTransactionId: string, ccTransactionIds: string[]) => {
      await mutation.mutateAsync({ bankTransactionId, ccTransactionIds })
    },
    isAttaching: mutation.isPending,
  }
}
