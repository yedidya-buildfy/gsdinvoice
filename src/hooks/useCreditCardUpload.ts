import { useState, useCallback, useRef } from 'react'
import { parseCreditCardStatement, type ParsedCreditCardTransaction } from '@/lib/parsers/creditCardParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { useSettingsStore } from '@/stores/settingsStore'
import { utf8ToBase64, generateUniqueHash } from '@/lib/utils/hashUtils'
import type { TransactionInsert, CreditCardInsert } from '@/types/database'
import type {
  TransactionDuplicateCheckResult,
  TransactionDuplicateMatch,
  DuplicateAction,
} from '@/lib/duplicates/types'

interface TransactionWithHash {
  tx: ParsedCreditCardTransaction
  hash: string
}

interface UseCreditCardUploadReturn {
  /** Currently processing file */
  currentFile: File | null
  /** Processing status */
  status: 'idle' | 'parsing' | 'checking' | 'saving' | 'matching' | 'success' | 'error' | 'waiting_action'
  /** Progress percentage (0-100) */
  progress: number
  /** Error message if failed */
  error: string | null
  /** Number of transactions saved */
  savedCount: number
  /** Number of duplicates skipped */
  duplicateCount: number
  /** Number of CC transactions matched to bank */
  matchedCount: number
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Add file and start processing immediately */
  addFile: (file: File) => void
  /** Duplicate check result for modal */
  duplicateCheckResult: TransactionDuplicateCheckResult | null
  /** Whether to show duplicate modal */
  showDuplicateModal: boolean
  /** Handle user's duplicate action choice */
  handleDuplicateAction: (action: DuplicateAction) => void
}

export function useCreditCardUpload(): UseCreditCardUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UseCreditCardUploadReturn['status']>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<TransactionDuplicateCheckResult | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const { user } = useAuth()
  const { currentTeam } = useTeam()

  const { ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger } = useSettingsStore()

  const isProcessingRef = useRef(false)
  const pendingTransactionsRef = useRef<TransactionWithHash[]>([])
  const cardIdMapRef = useRef<Record<string, string>>({})

  const isProcessing = status === 'parsing' || status === 'checking' || status === 'saving' || status === 'matching'

  // Check for duplicates by querying the database in batches
  const checkForDuplicates = async (
    userId: string,
    teamId: string | null,
    txWithHashes: TransactionWithHash[]
  ): Promise<TransactionDuplicateCheckResult> => {
    const hashes = txWithHashes.map((t) => t.hash)
    const matches: TransactionDuplicateMatch[] = []

    // Query in batches of 100 to avoid URL length limits
    const BATCH_SIZE = 100
    const existingHashMap = new Map<string, {
      id: string
      date: string
      description: string
      amount_agorot: number
      reference: string | null
      created_at: string | null
    }>()

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batchHashes = hashes.slice(i, i + BATCH_SIZE)

      let query = supabase
        .from('transactions')
        .select('id, hash, date, description, amount_agorot, reference, created_at')
        .eq('user_id', userId)
        .in('hash', batchHashes)

      if (teamId) {
        query = query.eq('team_id', teamId)
      } else {
        query = query.is('team_id', null)
      }

      const { data, error } = await query

      if (error) {
        console.error('[CC Upload] Error checking duplicates:', error)
        continue
      }

      if (data) {
        for (const tx of data) {
          if (tx.hash) {
            existingHashMap.set(tx.hash, {
              id: tx.id,
              date: tx.date,
              description: tx.description,
              amount_agorot: tx.amount_agorot,
              reference: tx.reference,
              created_at: tx.created_at,
            })
          }
        }
      }
    }

    // Build matches array
    for (const { tx, hash } of txWithHashes) {
      const existing = existingHashMap.get(hash)
      if (existing) {
        matches.push({
          newTransaction: {
            date: tx.date,
            description: tx.merchantName,
            amountAgorot: tx.amountAgorot,
            reference: tx.transactionType,
            hash,
          },
          existingTransaction: existing,
        })
      }
    }

    return {
      totalTransactions: txWithHashes.length,
      duplicateCount: matches.length,
      newCount: txWithHashes.length - matches.length,
      matches,
    }
  }

  // Execute the save operation based on user's choice
  const executeSave = async (
    action: DuplicateAction,
    txWithHashes: TransactionWithHash[],
    duplicateResult: TransactionDuplicateCheckResult
  ) => {
    if (!user) return

    setStatus('saving')
    setProgress(60)

    const cardIdMap = cardIdMapRef.current
    const duplicateHashes = new Set(duplicateResult.matches.map((m) => m.newTransaction.hash))

    try {
      let inserts: TransactionInsert[] = []

      if (action === 'skip') {
        // Only insert transactions that are NOT duplicates
        inserts = txWithHashes
          .filter(({ hash }) => !duplicateHashes.has(hash))
          .map(({ tx, hash }) => ({
            user_id: user.id,
            team_id: currentTeam?.id ?? null,
            date: tx.date,
            value_date: tx.billingDate,
            description: tx.merchantName,
            reference: tx.transactionType,
            amount_agorot: tx.amountAgorot,
            balance_agorot: null,
            is_income: tx.amountAgorot < 0,
            is_credit_card_charge: false,
            credit_card_id: cardIdMap[tx.cardLastFour],
            transaction_type: 'cc_purchase' as const,
            channel: tx.notes,
            source_file_id: null,
            hash,
            match_status: 'unmatched',
            foreign_amount_cents: tx.foreignAmount != null ? Math.round(tx.foreignAmount * 100) : null,
            foreign_currency: tx.foreignCurrency,
          }))

        if (inserts.length === 0) {
          setSavedCount(0)
          setDuplicateCount(duplicateResult.duplicateCount)
          setProgress(100)
          setStatus('success')

          setTimeout(() => {
            setCurrentFile(null)
            setStatus('idle')
            setProgress(0)
            setDuplicateCheckResult(null)
            isProcessingRef.current = false
            pendingTransactionsRef.current = []
          }, 3000)
          return
        }

        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        setSavedCount(saved)
        setDuplicateCount(duplicateResult.duplicateCount)

      } else if (action === 'replace') {
        // Unlink invoice_rows and document links, then delete existing duplicates, then insert all
        const existingIds = duplicateResult.matches.map((m) => m.existingTransaction.id)

        if (existingIds.length > 0) {
          // Unlink invoice_rows that reference these transactions
          const BATCH = 100
          for (let i = 0; i < existingIds.length; i += BATCH) {
            const batch = existingIds.slice(i, i + BATCH)
            const { error: unlinkError } = await supabase
              .from('invoice_rows')
              .update({ transaction_id: null, match_status: 'unmatched', matched_at: null, match_method: null, match_confidence: null })
              .in('transaction_id', batch)

            if (unlinkError) {
              console.error('[CC Upload] Error unlinking invoice_rows:', unlinkError)
            }
          }

          // Now delete the transactions
          for (let i = 0; i < existingIds.length; i += BATCH) {
            const batch = existingIds.slice(i, i + BATCH)
            const { error: deleteError } = await supabase
              .from('transactions')
              .delete()
              .in('id', batch)

            if (deleteError) {
              throw new Error(`Failed to delete existing transactions: ${deleteError.message}`)
            }
          }
        }

        // Now insert all transactions
        inserts = txWithHashes.map(({ tx, hash }) => ({
          user_id: user.id,
          team_id: currentTeam?.id ?? null,
          date: tx.date,
          value_date: tx.billingDate,
          description: tx.merchantName,
          reference: tx.transactionType,
          amount_agorot: tx.amountAgorot,
          balance_agorot: null,
          is_income: tx.amountAgorot < 0,
          is_credit_card_charge: false,
          credit_card_id: cardIdMap[tx.cardLastFour],
          transaction_type: 'cc_purchase' as const,
          channel: tx.notes,
          source_file_id: null,
          hash,
          match_status: 'unmatched',
          foreign_amount_cents: tx.foreignAmount != null ? Math.round(tx.foreignAmount * 100) : null,
          foreign_currency: tx.foreignCurrency,
        }))

        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        setSavedCount(saved)
        setDuplicateCount(duplicateResult.duplicateCount)

      } else if (action === 'keep_both') {
        // Generate unique hashes for duplicates to bypass unique constraint
        inserts = txWithHashes.map(({ tx, hash }) => {
          const finalHash = duplicateHashes.has(hash) ? generateUniqueHash(hash) : hash

          return {
            user_id: user.id,
            team_id: currentTeam?.id ?? null,
            date: tx.date,
            value_date: tx.billingDate,
            description: tx.merchantName,
            reference: tx.transactionType,
            amount_agorot: tx.amountAgorot,
            balance_agorot: null,
            is_income: tx.amountAgorot < 0,
            is_credit_card_charge: false,
            credit_card_id: cardIdMap[tx.cardLastFour],
            transaction_type: 'cc_purchase' as const,
            channel: tx.notes,
            source_file_id: null,
            hash: finalHash,
            match_status: 'unmatched',
            foreign_amount_cents: tx.foreignAmount != null ? Math.round(tx.foreignAmount * 100) : null,
            foreign_currency: tx.foreignCurrency,
          }
        })

        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        setSavedCount(saved)
        setDuplicateCount(0)
      }

      setProgress(80)

      // Run CC-Bank matching if enabled
      if (matchingTrigger === 'on_upload' || matchingTrigger === 'after_all_uploads') {
        setStatus('matching')

        const matchingResult = await runCCBankMatching(user.id, {
          dateToleranceDays: ccBankDateRangeDays,
          amountTolerancePercent: ccBankAmountTolerance,
        }, currentTeam?.id)

        setMatchedCount(matchingResult.matchedCCTransactions)

        if (matchingResult.errors.length > 0) {
          console.warn('Matching warnings:', matchingResult.errors)
        }
      }

      setProgress(100)
      setStatus('success')

      // Auto-clear after 3 seconds
      setTimeout(() => {
        setCurrentFile(null)
        setStatus('idle')
        setProgress(0)
        setDuplicateCheckResult(null)
        isProcessingRef.current = false
        pendingTransactionsRef.current = []
      }, 3000)

    } catch (err) {
      console.error('[CC Upload] Error saving:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStatus('error')
      isProcessingRef.current = false
      pendingTransactionsRef.current = []
    }
  }

  const handleDuplicateAction = useCallback((action: DuplicateAction) => {
    setShowDuplicateModal(false)

    if (!duplicateCheckResult) return

    executeSave(action, pendingTransactionsRef.current, duplicateCheckResult)
  }, [duplicateCheckResult, user, currentTeam, ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger])

  const addFile = useCallback(async (file: File) => {
    if (isProcessingRef.current || !user) {
      return
    }

    isProcessingRef.current = true
    setCurrentFile(file)
    setError(null)
    setSavedCount(0)
    setDuplicateCount(0)
    setMatchedCount(0)
    setProgress(0)
    setDuplicateCheckResult(null)
    setShowDuplicateModal(false)

    let parsedTransactions: ParsedCreditCardTransaction[] = []

    try {
      // Step 1: Parse the file (0-30%)
      setStatus('parsing')
      setProgress(10)

      parsedTransactions = await parseCreditCardStatement(file)
      setProgress(30)

      if (parsedTransactions.length === 0) {
        setError('No transactions found in file')
        setStatus('error')
        isProcessingRef.current = false
        return
      }

      // Step 2: Auto-create credit cards for unique card numbers (30-45%)
      setStatus('checking')
      setProgress(35)

      const uniqueCards = [...new Set(parsedTransactions.map(tx => tx.cardLastFour))]
      const cardIdMap: Record<string, string> = {}

      for (const cardLastFour of uniqueCards) {
        let cardQuery = supabase
          .from('credit_cards')
          .select('id')
          .eq('user_id', user.id)
          .eq('card_last_four', cardLastFour)

        if (currentTeam?.id) {
          cardQuery = cardQuery.eq('team_id', currentTeam.id)
        } else {
          cardQuery = cardQuery.is('team_id', null)
        }

        const { data: existing, error: fetchError } = await cardQuery.maybeSingle()

        if (fetchError) {
          throw new Error(`Failed to check existing cards: ${fetchError.message}`)
        }

        if (existing) {
          cardIdMap[cardLastFour] = existing.id
        } else {
          const newCard: CreditCardInsert = {
            user_id: user.id,
            team_id: currentTeam?.id ?? null,
            card_last_four: cardLastFour,
            card_type: 'visa',
          }

          const { data: created, error: createError } = await supabase
            .from('credit_cards')
            .insert(newCard)
            .select('id')
            .single()

          if (createError) {
            throw new Error(`Failed to create card: ${createError.message}`)
          }

          cardIdMap[cardLastFour] = created.id
        }
      }

      cardIdMapRef.current = cardIdMap
      setProgress(45)

      // Step 3: Generate hashes and check duplicates (45-55%)
      const txWithHashes: TransactionWithHash[] = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`cc|${tx.date}|${tx.merchantName.trim()}|${tx.amountAgorot}|${tx.cardLastFour}`),
      }))

      // Store for later use after user action
      pendingTransactionsRef.current = txWithHashes

      setProgress(50)

      const duplicateResult = await checkForDuplicates(user.id, currentTeam?.id ?? null, txWithHashes)
      setProgress(55)

      // If duplicates found, show modal and wait for user action
      if (duplicateResult.duplicateCount > 0) {
        setDuplicateCheckResult(duplicateResult)
        setShowDuplicateModal(true)
        setStatus('waiting_action')
        // Don't clear isProcessingRef - we're waiting for user action
        return
      }

      // No duplicates - proceed directly with insert
      await executeSave('skip', txWithHashes, duplicateResult)

    } catch (err) {
      console.error('[CC Upload] Error processing credit card statement:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStatus('error')
      isProcessingRef.current = false
    }
  }, [user, currentTeam, ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger])

  return {
    currentFile,
    status,
    progress,
    error,
    savedCount,
    duplicateCount,
    matchedCount,
    isProcessing,
    addFile,
    duplicateCheckResult,
    showDuplicateModal,
    handleDuplicateAction,
  }
}
