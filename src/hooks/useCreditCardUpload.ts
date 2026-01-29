import { useState, useCallback, useRef } from 'react'
import { parseCreditCardStatement, type ParsedCreditCardTransaction } from '@/lib/parsers/creditCardParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TransactionInsert, CreditCardInsert } from '@/types/database'

// UTF-8 safe base64 encoding for Hebrew text
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

interface UseCreditCardUploadReturn {
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
  /** Number of CC transactions matched to bank */
  matchedCount: number
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Add file and start processing immediately */
  addFile: (file: File) => void
}

export function useCreditCardUpload(): UseCreditCardUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'matching' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const { user } = useAuth()

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

      // Step 2: Auto-create credit cards for unique card numbers (30-50%)
      setStatus('saving')
      setProgress(40)

      const uniqueCards = [...new Set(parsedTransactions.map(tx => tx.cardLastFour))]
      const cardIdMap: Record<string, string> = {}

      for (const cardLastFour of uniqueCards) {
        const { data: existing, error: fetchError } = await supabase
          .from('credit_cards')
          .select('id')
          .eq('user_id', user.id)
          .eq('card_last_four', cardLastFour)
          .maybeSingle()

        if (fetchError) {
          throw new Error(`Failed to check existing cards: ${fetchError.message}`)
        }

        if (existing) {
          cardIdMap[cardLastFour] = existing.id
        } else {
          const newCard: CreditCardInsert = {
            user_id: user.id,
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

      setProgress(50)

      // Step 3: Generate hashes and check duplicates (50-70%)
      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`cc|${tx.date}|${tx.merchantName.trim()}|${tx.amountAgorot}|${tx.cardLastFour}`),
      }))

      const allHashes = txWithHashes.map((t) => t.hash)
      const { data: existingRows } = await supabase
        .from('transactions')
        .select('hash')
        .eq('user_id', user.id)
        .in('hash', allHashes)

      const existingHashes = new Set((existingRows || []).map((r) => r.hash))
      const newTransactions = txWithHashes.filter((t) => !existingHashes.has(t.hash))
      const duplicates = txWithHashes.length - newTransactions.length

      setProgress(70)

      if (newTransactions.length === 0) {
        setSavedCount(0)
        setDuplicateCount(duplicates)
        setProgress(100)
        setStatus('success')

        // Auto-clear after 2 seconds
        setTimeout(() => {
          setCurrentFile(null)
          setStatus('idle')
          setProgress(0)
          isProcessingRef.current = false
        }, 2000)
        return
      }

      // Step 4: Insert into transactions table with transaction_type = 'cc_purchase' (70-90%)
      // NEW SCHEMA: All CC data now lives in transactions table
      const inserts: TransactionInsert[] = newTransactions.map(({ tx, hash }) => ({
        user_id: user.id,
        date: tx.date,
        value_date: tx.billingDate,
        description: tx.merchantName,
        reference: tx.transactionType,
        amount_agorot: tx.amountAgorot,
        balance_agorot: null,
        is_income: tx.amountAgorot < 0,
        is_credit_card_charge: false,
        // NEW SCHEMA: Use credit_card_id and transaction_type instead of linked_credit_card_id
        credit_card_id: cardIdMap[tx.cardLastFour],
        transaction_type: 'cc_purchase',
        channel: tx.notes,
        source_file_id: null,
        hash: hash,
        match_status: 'unmatched',
        foreign_amount_cents: tx.foreignAmount ? Math.round(tx.foreignAmount * 100) : null,
        foreign_currency: tx.foreignCurrency,
      }))

      setProgress(75)

      const { error: insertError, data: insertedData } = await supabase
        .from('transactions')
        .insert(inserts)
        .select()

      if (insertError) {
        throw new Error(`Failed to save transactions: ${insertError.message}`)
      }

      const saved = insertedData?.length || 0
      setSavedCount(saved)
      setDuplicateCount(duplicates)
      setProgress(90)

      // Step 6: Run CC-Bank matching if enabled (90-100%)
      if (matchingTrigger === 'on_upload' || matchingTrigger === 'after_all_uploads') {
        setStatus('matching')

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
        isProcessingRef.current = false
      }, 2000)

    } catch (err) {
      console.error('Error processing credit card statement:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStatus('error')
      isProcessingRef.current = false
    }
  }, [user, ccBankDateRangeDays, ccBankAmountTolerance, matchingTrigger])

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
