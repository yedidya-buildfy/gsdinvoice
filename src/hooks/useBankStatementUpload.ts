import { useState, useCallback, useRef } from 'react'
import { parseBankStatement, type ParsedTransaction } from '@/lib/parsers/bankStatementParser'
import { detectCreditCardCharge } from '@/lib/services/creditCardLinker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
  status: 'idle' | 'parsing' | 'saving' | 'success' | 'error'
  /** Progress percentage (0-100) */
  progress: number
  /** Error message if failed */
  error: string | null
  /** Number of transactions saved */
  savedCount: number
  /** Number of duplicates skipped */
  duplicateCount: number
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Add file and start processing immediately */
  addFile: (file: File) => void
}

export function useBankStatementUpload(): UseBankStatementUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const { user } = useAuth()

  const isProcessingRef = useRef(false)

  const isProcessing = status === 'parsing' || status === 'saving'

  const addFile = useCallback(async (file: File) => {
    if (isProcessingRef.current || !user) {
      return
    }

    isProcessingRef.current = true
    setCurrentFile(file)
    setError(null)
    setSavedCount(0)
    setDuplicateCount(0)
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

      // Step 3: Insert transactions (60-100%)
      const inserts: TransactionInsert[] = newTransactions.map(({ tx, hash }) => {
        const cardLastFour = detectCreditCardCharge(tx.description)

        return {
          user_id: user.id,
          date: tx.date,
          value_date: tx.valueDate,
          description: tx.description,
          reference: tx.reference,
          amount_agorot: tx.amountAgorot,
          balance_agorot: tx.balanceAgorot,
          is_income: tx.amountAgorot > 0,
          is_credit_card_charge: cardLastFour !== null,
          source_file_id: null,
          hash: hash,
          match_status: 'unmatched',
        }
      })

      setProgress(80)

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
  }, [user])

  return {
    currentFile,
    status,
    progress,
    error,
    savedCount,
    duplicateCount,
    isProcessing,
    addFile,
  }
}
