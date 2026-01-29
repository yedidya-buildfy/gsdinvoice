import { useState, useCallback, useRef } from 'react'
import { parseCreditCardStatement, type ParsedCreditCardTransaction } from '@/lib/parsers/creditCardParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { runCCBankMatching, type MatchingResult } from '@/lib/services/ccBankMatcher'
import { normalizeMerchantName } from '@/lib/utils/merchantParser'
import { useSettingsStore } from '@/stores/settingsStore'
import type { CreditCardTransactionInsert, CreditCardInsert } from '@/types/database'

// UTF-8 safe base64 encoding for Hebrew text
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

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

      setProgress(40)

      // Step 3: Generate hashes and check duplicates (40-60%)
      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        // Hash based on transaction_date, merchant, amount, card, and charge_date
        hash: utf8ToBase64(`cctx|${tx.date}|${tx.merchantName.trim()}|${tx.amountAgorot}|${tx.cardLastFour}|${tx.billingDate || ''}`),
      }))

      const allHashes = txWithHashes.map((t) => t.hash)
      const { data: existingRows } = await supabase
        .from('credit_card_transactions')
        .select('hash')
        .eq('user_id', user.id)
        .in('hash', allHashes)

      const existingHashes = new Set((existingRows || []).map((r) => r.hash))
      const newTransactions = txWithHashes.filter((t) => !existingHashes.has(t.hash))
      const duplicates = txWithHashes.length - newTransactions.length

      setProgress(60)

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

      // Step 4: Insert CC transactions (60-80%)
      const inserts: CreditCardTransactionInsert[] = newTransactions.map(({ tx, hash }) => ({
        user_id: user.id,
        transaction_date: tx.date,
        merchant_name: tx.merchantName,
        amount_agorot: tx.amountAgorot,
        currency: tx.foreignCurrency || 'ILS',
        foreign_amount_cents: tx.foreignAmount ? Math.round(tx.foreignAmount * 100) : null,
        foreign_currency: tx.foreignCurrency,
        card_last_four: tx.cardLastFour,
        charge_date: tx.billingDate || tx.date, // Use transaction date if no billing date
        transaction_type: tx.transactionType,
        notes: tx.notes,
        bank_transaction_id: null,
        match_status: 'unmatched',
        match_confidence: null,
        normalized_merchant: normalizeMerchantName(tx.merchantName),
        hash: hash,
        source_file_id: null,
        credit_card_id: cardIdMap[tx.cardLastFour],
      }))

      setProgress(70)

      const { error: insertError, data: insertedData } = await supabase
        .from('credit_card_transactions')
        .insert(inserts)
        .select()

      if (insertError) {
        throw new Error(`Failed to save CC transactions: ${insertError.message}`)
      }

      const saved = insertedData?.length || 0
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
