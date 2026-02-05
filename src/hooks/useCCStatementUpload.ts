import { useState, useCallback, useRef } from 'react'
import { parseCreditCardStatement, type ParsedCreditCardTransaction } from '@/lib/parsers/creditCardParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import { runCCBankMatching, type MatchingResult } from '@/lib/services/ccBankMatcher'
import { useSettingsStore } from '@/stores/settingsStore'
import { utf8ToBase64 } from '@/lib/utils/hashUtils'
import type { TransactionInsert, CreditCardInsert } from '@/types/database'

interface UseCCStatementUploadReturn {
  /** Currently processing file */
  currentFile: File | null
  /** Processing status */
  status: 'idle' | 'parsing' | 'saving' | 'matching' | 'success' | 'error'
  /** Progress percentage (0-100) */
  progress: number
  /** Error message if failed */
  error: string | null
  /** Number of transactions saved */
  savedCount: number
  /** Number of duplicates skipped */
  duplicateCount: number
  /** Number of transactions matched to bank charges */
  matchedCount: number
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Add file and start processing immediately */
  addFile: (file: File) => void
}

export function useCCStatementUpload(): UseCCStatementUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'matching' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const { user } = useAuth()
  const { currentTeam } = useTeam()

  const { ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger } = useSettingsStore()

  const isProcessingRef = useRef(false)

  const isProcessing = status === 'parsing' || status === 'saving' || status === 'matching'

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

      // Step 2: Auto-create credit cards for unique card numbers (30-40%)
      setStatus('saving')
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

      setProgress(40)

      // Step 3: Generate hashes and prepare transactions (40-60%)
      // NEW SCHEMA: CC data is now in transactions table with transaction_type = 'cc_purchase'
      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        // Hash based on transaction_date, merchant, amount, card, and charge_date
        hash: utf8ToBase64(`cctx|${tx.date}|${tx.merchantName.trim()}|${tx.amountAgorot}|${tx.cardLastFour}|${tx.billingDate || ''}`),
      }))

      setProgress(50)

      // Prepare all transactions for upsert
      // NEW SCHEMA: All CC data now in transactions table with transaction_type = 'cc_purchase'
      const inserts: TransactionInsert[] = txWithHashes.map(({ tx, hash }) => ({
        user_id: user.id,
        team_id: currentTeam?.id ?? null,
        date: tx.date,
        value_date: tx.billingDate || tx.date, // charge_date
        description: tx.merchantName, // merchant_name
        reference: tx.transactionType,
        amount_agorot: tx.amountAgorot,
        balance_agorot: null,
        is_income: tx.amountAgorot < 0,
        is_credit_card_charge: false,
        transaction_type: 'cc_purchase',
        credit_card_id: cardIdMap[tx.cardLastFour],
        channel: tx.notes,
        source_file_id: null,
        hash: hash,
        match_status: 'unmatched',
        foreign_amount_cents: tx.foreignAmount ? Math.round(tx.foreignAmount * 100) : null,
        foreign_currency: tx.foreignCurrency,
      }))

      setProgress(60)

      // Step 4: Upsert CC transactions with ON CONFLICT DO NOTHING (60-80%)
      // This is database-level duplicate protection - much more reliable than pre-checking
      // The unique constraint on (user_id, hash) ensures duplicates are ignored
      setProgress(70)

      // Use upsert with ignoreDuplicates: true which generates ON CONFLICT DO NOTHING
      // This is efficient because:
      // 1. No URL length limits (single request handles all data)
      // 2. Database handles duplicate detection atomically
      // 3. No race conditions between check and insert
      const { error: insertError, data: insertedData } = await supabase
        .from('transactions')
        .upsert(inserts, {
          onConflict: 'user_id,hash',
          ignoreDuplicates: true
        })
        .select()

      if (insertError) {
        throw new Error(`Failed to save CC transactions: ${insertError.message}`)
      }

      const saved = insertedData?.length || 0
      const duplicates = txWithHashes.length - saved
      setSavedCount(saved)
      setDuplicateCount(duplicates)
      setProgress(80)

      // Step 5: Run matching if enabled (80-100%)
      let matchingResult: MatchingResult | null = null

      if (matchingTrigger === 'on_upload' || matchingTrigger === 'after_all_uploads') {
        setStatus('matching')
        setProgress(85)

        matchingResult = await runCCBankMatching(user.id, {
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
        isProcessingRef.current = false
      }, 2000)

    } catch (err) {
      console.error('Error processing CC statement:', err)
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
  }
}
