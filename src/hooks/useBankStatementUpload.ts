import { useState, useCallback, useRef } from 'react'
import { parseBankStatement, type ParsedTransaction } from '@/lib/parsers/bankStatementParser'
import { detectCreditCardCharge } from '@/lib/services/creditCardLinker'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import { useSettingsStore } from '@/stores/settingsStore'
import { utf8ToBase64, generateUniqueHash } from '@/lib/utils/hashUtils'
import type { TransactionInsert } from '@/types/database'
import type {
  TransactionDuplicateCheckResult,
  TransactionDuplicateMatch,
  DuplicateAction,
} from '@/lib/duplicates/types'

interface TransactionWithHash {
  tx: ParsedTransaction
  hash: string
}

interface UseBankStatementUploadReturn {
  /** Currently processing file */
  currentFile: File | null
  /** Processing status */
  status: 'idle' | 'parsing' | 'checking' | 'waiting_action' | 'saving' | 'matching' | 'success' | 'error'
  /** Progress percentage (0-100) */
  progress: number
  /** Error message if failed */
  error: string | null
  /** Number of transactions saved */
  savedCount: number
  /** Number of duplicates skipped */
  duplicateCount: number
  /** Number of CC transactions matched */
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

export function useBankStatementUpload(): UseBankStatementUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'checking' | 'waiting_action' | 'saving' | 'matching' | 'success' | 'error'>('idle')
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
        console.error('[Upload] Error checking duplicates:', error)
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
            description: tx.description,
            amountAgorot: tx.amountAgorot,
            reference: tx.reference,
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

    const duplicateHashes = new Set(duplicateResult.matches.map((m) => m.newTransaction.hash))

    try {
      let inserts: TransactionInsert[] = []

      if (action === 'skip') {
        // Only insert transactions that are NOT duplicates
        inserts = txWithHashes
          .filter(({ hash }) => !duplicateHashes.has(hash))
          .map(({ tx, hash }) => {
            const cardLastFour = detectCreditCardCharge(tx.description)
            const isCCCharge = cardLastFour !== null

            return {
              user_id: user.id,
              team_id: currentTeam?.id ?? null,
              date: tx.date,
              value_date: tx.valueDate,
              description: tx.description,
              reference: tx.reference,
              amount_agorot: tx.amountAgorot,
              balance_agorot: tx.balanceAgorot,
              is_income: tx.amountAgorot > 0,
              is_credit_card_charge: isCCCharge,
              transaction_type: isCCCharge ? 'bank_cc_charge' : 'bank_regular',
              source_file_id: null,
              hash: hash,
              match_status: 'unmatched',
            } as TransactionInsert
          })

        if (inserts.length === 0) {
          console.log('[Upload] All transactions are duplicates, nothing to insert')
          setSavedCount(0)
          setDuplicateCount(duplicateResult.duplicateCount)
          setProgress(100)
          setStatus('success')

          // Auto-clear after 2 seconds
          setTimeout(() => {
            setCurrentFile(null)
            setStatus('idle')
            setProgress(0)
            setDuplicateCheckResult(null)
            isProcessingRef.current = false
            pendingTransactionsRef.current = []
          }, 2000)
          return
        }

        // Simple insert for new transactions
        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        console.log('[Upload] Saved', saved, 'new transactions, skipped', duplicateResult.duplicateCount, 'duplicates')
        setSavedCount(saved)
        setDuplicateCount(duplicateResult.duplicateCount)

      } else if (action === 'replace') {
        // Delete existing duplicates first, then insert all
        const hashesToDelete = Array.from(duplicateHashes)

        if (hashesToDelete.length > 0) {
          console.log('[Upload] Deleting', hashesToDelete.length, 'existing transactions to replace...')

          // Delete in batches to avoid URL length limits
          const BATCH_SIZE = 50
          for (let i = 0; i < hashesToDelete.length; i += BATCH_SIZE) {
            const batch = hashesToDelete.slice(i, i + BATCH_SIZE)
            let deleteQuery = supabase
              .from('transactions')
              .delete()
              .eq('user_id', user.id)
              .in('hash', batch)

            if (currentTeam?.id) {
              deleteQuery = deleteQuery.eq('team_id', currentTeam.id)
            } else {
              deleteQuery = deleteQuery.is('team_id', null)
            }

            const { error: deleteError } = await deleteQuery

            if (deleteError) {
              console.error('[Upload] Delete error:', deleteError)
              throw new Error(`Failed to delete existing transactions: ${deleteError.message}`)
            }
          }
          console.log('[Upload] Deleted existing duplicates')
        }

        // Now insert all transactions
        inserts = txWithHashes.map(({ tx, hash }) => {
          const cardLastFour = detectCreditCardCharge(tx.description)
          const isCCCharge = cardLastFour !== null

          return {
            user_id: user.id,
            team_id: currentTeam?.id ?? null,
            date: tx.date,
            value_date: tx.valueDate,
            description: tx.description,
            reference: tx.reference,
            amount_agorot: tx.amountAgorot,
            balance_agorot: tx.balanceAgorot,
            is_income: tx.amountAgorot > 0,
            is_credit_card_charge: isCCCharge,
            transaction_type: isCCCharge ? 'bank_cc_charge' : 'bank_regular',
            source_file_id: null,
            hash: hash,
            match_status: 'unmatched',
          } as TransactionInsert
        })

        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        console.log('[Upload] Inserted', saved, 'transactions (replaced', duplicateResult.duplicateCount, 'existing)')
        setSavedCount(saved)
        setDuplicateCount(duplicateResult.duplicateCount)

      } else if (action === 'keep_both') {
        // Generate unique hashes for duplicates to bypass unique constraint
        inserts = txWithHashes.map(({ tx, hash }) => {
          const cardLastFour = detectCreditCardCharge(tx.description)
          const isCCCharge = cardLastFour !== null
          const finalHash = duplicateHashes.has(hash) ? generateUniqueHash(hash) : hash

          return {
            user_id: user.id,
            team_id: currentTeam?.id ?? null,
            date: tx.date,
            value_date: tx.valueDate,
            description: tx.description,
            reference: tx.reference,
            amount_agorot: tx.amountAgorot,
            balance_agorot: tx.balanceAgorot,
            is_income: tx.amountAgorot > 0,
            is_credit_card_charge: isCCCharge,
            transaction_type: isCCCharge ? 'bank_cc_charge' : 'bank_regular',
            source_file_id: null,
            hash: finalHash,
            match_status: 'unmatched',
          } as TransactionInsert
        })

        // Simple insert with unique hashes
        const { error: insertError, data: insertedData } = await supabase
          .from('transactions')
          .insert(inserts)
          .select()

        if (insertError) {
          throw new Error(`Failed to save transactions: ${insertError.message}`)
        }

        const saved = insertedData?.length || 0
        console.log('[Upload] Inserted', saved, 'transactions (kept both - created', duplicateResult.duplicateCount, 'duplicates)')
        setSavedCount(saved)
        setDuplicateCount(0) // No duplicates skipped in keep_both mode
      }

      setProgress(80)

      // Step 4: Trigger CC-Bank matching if enabled
      if (matchingTrigger === 'on_upload' || matchingTrigger === 'after_all_uploads') {
        setStatus('matching')
        setProgress(85)

        const matchingResult = await runCCBankMatching(user.id, {
          dateToleranceDays: ccBankDateRangeDays,
          amountTolerancePercent: ccBankAmountTolerance,
        })

        setMatchedCount(matchingResult.matchedCCTransactions)

        if (matchingResult.errors.length > 0) {
          console.warn('Matching warnings:', matchingResult.errors)
        }
      }

      setProgress(100)
      setStatus('success')

      // Auto-clear after 2 seconds
      setTimeout(() => {
        setCurrentFile(null)
        setStatus('idle')
        setProgress(0)
        setDuplicateCheckResult(null)
        isProcessingRef.current = false
        pendingTransactionsRef.current = []
      }, 2000)

    } catch (err) {
      console.error('[Upload] Error saving transactions:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStatus('error')
      isProcessingRef.current = false
    }
  }

  const handleDuplicateAction = useCallback((action: DuplicateAction) => {
    setShowDuplicateModal(false)

    if (!duplicateCheckResult) return

    executeSave(action, pendingTransactionsRef.current, duplicateCheckResult)
  }, [duplicateCheckResult, user, currentTeam, ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger])

  const addFile = useCallback(async (file: File) => {
    console.log('[Upload] addFile called with:', file.name)

    if (isProcessingRef.current || !user) {
      console.log('[Upload] Skipping - isProcessing:', isProcessingRef.current, 'user:', !!user)
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

    let parsedTransactions: ParsedTransaction[] = []

    try {
      // Step 1: Parse the file (0-30%)
      console.log('[Upload] Step 1: Starting file parse...')
      setStatus('parsing')
      setProgress(10)

      parsedTransactions = await parseBankStatement(file)
      console.log('[Upload] Parse complete. Transactions found:', parsedTransactions.length)
      setProgress(30)

      if (parsedTransactions.length === 0) {
        console.error('[Upload] ERROR: No transactions found in file!')
        setError('No transactions found in file')
        setStatus('error')
        isProcessingRef.current = false
        return
      }

      // Step 2: Generate hashes (30-40%)
      console.log('[Upload] Step 2: Generating hashes...')
      setStatus('checking')
      setProgress(35)

      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`${tx.date}|${tx.description.trim()}|${tx.amountAgorot}|${tx.reference || ''}`),
      }))

      console.log('[Upload] Generated', txWithHashes.length, 'hashes')

      // Store for later use after user action
      pendingTransactionsRef.current = txWithHashes

      // Step 3: Check for duplicates (40-50%)
      console.log('[Upload] Step 3: Checking for duplicates...')
      setProgress(45)

      const duplicateResult = await checkForDuplicates(user.id, currentTeam?.id ?? null, txWithHashes)
      console.log('[Upload] Duplicate check complete:', duplicateResult.duplicateCount, 'duplicates found')
      setProgress(50)

      // If duplicates found, show modal and wait for user action
      if (duplicateResult.duplicateCount > 0) {
        console.log('[Upload] Duplicates detected, showing modal...')
        setDuplicateCheckResult(duplicateResult)
        setShowDuplicateModal(true)
        setStatus('waiting_action')
        // Don't clear isProcessingRef - we're waiting for user action
        return
      }

      // No duplicates - proceed directly with insert
      console.log('[Upload] No duplicates, proceeding with insert...')
      await executeSave('skip', txWithHashes, duplicateResult)

    } catch (err) {
      console.error('[Upload] CAUGHT ERROR processing bank statement:', err)
      console.error('[Upload] Error type:', typeof err)
      console.error('[Upload] Error message:', err instanceof Error ? err.message : String(err))
      console.error('[Upload] Error stack:', err instanceof Error ? err.stack : 'N/A')
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
