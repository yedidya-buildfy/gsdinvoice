import { useState, useCallback, useRef } from 'react'
import { parseBankStatement, type ParsedTransaction } from '@/lib/parsers/bankStatementParser'
import { detectCreditCardCharge } from '@/lib/services/creditCardLinker'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSettingsStore } from '@/stores/settingsStore'
import type { TransactionInsert } from '@/types/database'

// UTF-8 safe base64 encoding for Hebrew text
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

interface UseBankStatementUploadReturn {
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
  /** Number of CC transactions matched */
  matchedCount: number
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Add file and start processing immediately */
  addFile: (file: File) => void
}

export function useBankStatementUpload(): UseBankStatementUploadReturn {
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

    let parsedTransactions: ParsedTransaction[] = []

    try {
      // Step 1: Parse the file (0-30%)
      setStatus('parsing')
      setProgress(10)

      parsedTransactions = await parseBankStatement(file)
      setProgress(30)

      if (parsedTransactions.length === 0) {
        setError('No transactions found in file')
        setStatus('error')
        isProcessingRef.current = false
        return
      }

      // Step 2: Generate hashes and check duplicates (30-60%)
      setStatus('saving')
      setProgress(40)

      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`${tx.date}|${tx.description.trim()}|${tx.amountAgorot}|${tx.reference || ''}`),
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

      // Step 3: Insert transactions (60-80%)
      // NEW SCHEMA: Use transaction_type instead of is_credit_card_charge
      const inserts: TransactionInsert[] = newTransactions.map(({ tx, hash }) => {
        const cardLastFour = detectCreditCardCharge(tx.description)
        const isCCCharge = cardLastFour !== null

        return {
          user_id: user.id,
          date: tx.date,
          value_date: tx.valueDate,
          description: tx.description,
          reference: tx.reference,
          amount_agorot: tx.amountAgorot,
          balance_agorot: tx.balanceAgorot,
          is_income: tx.amountAgorot > 0,
          is_credit_card_charge: isCCCharge, // Keep for backward compatibility
          transaction_type: isCCCharge ? 'bank_cc_charge' : 'bank_regular',
          source_file_id: null,
          hash: hash,
          match_status: 'unmatched',
        }
      })

      setProgress(70)

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
      setProgress(80)

      // Step 4: Trigger CC-Bank matching if enabled (80-100%)
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
        isProcessingRef.current = false
      }, 2000)

    } catch (err) {
      console.error('Error processing bank statement:', err)
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
