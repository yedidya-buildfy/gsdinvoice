import { useState, useCallback } from 'react'
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
  file: File | null
  status: 'idle' | 'parsing' | 'saving' | 'success' | 'error'
  error: string | null
  parsedCount: number
  savedCount: number
  duplicateCount: number
  selectFile: (file: File) => void
  processFile: () => Promise<void>
  reset: () => void
}

export function useBankStatementUpload(): UseBankStatementUploadReturn {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [parsedCount, setParsedCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const { user } = useAuth()

  const selectFile = useCallback((newFile: File) => {
    setFile(newFile)
    setStatus('idle')
    setError(null)
    setParsedCount(0)
    setSavedCount(0)
    setDuplicateCount(0)
  }, [])

  const processFile = useCallback(async () => {
    if (!file || !user) {
      setError('No file selected or user not authenticated')
      setStatus('error')
      return
    }

    let parsedTransactions: ParsedTransaction[] = []

    try {
      // Step 1: Parse the file
      setStatus('parsing')
      setError(null)

      parsedTransactions = await parseBankStatement(file)
      setParsedCount(parsedTransactions.length)
      console.log('[BankUpload] Parsed transactions:', parsedTransactions.length, parsedTransactions.slice(0, 2))

      if (parsedTransactions.length === 0) {
        setError('No transactions found in file')
        setStatus('error')
        return
      }

      // Step 2: Save to database with batch insert
      setStatus('saving')

      // Generate hashes for all transactions
      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`${tx.date}|${tx.description.trim()}|${tx.amountAgorot}|${tx.reference || ''}`),
      }))

      // Fetch existing hashes in ONE query
      const allHashes = txWithHashes.map((t) => t.hash)
      const { data: existingRows } = await supabase
        .from('transactions')
        .select('hash')
        .eq('user_id', user.id)
        .in('hash', allHashes)

      const existingHashes = new Set((existingRows || []).map((r) => r.hash))

      // Filter out duplicates client-side
      const newTransactions = txWithHashes.filter((t) => !existingHashes.has(t.hash))
      const duplicates = txWithHashes.length - newTransactions.length

      console.log('[BankUpload] Found', duplicates, 'duplicates,', newTransactions.length, 'new transactions')

      if (newTransactions.length === 0) {
        setSavedCount(0)
        setDuplicateCount(duplicates)
        setStatus('success')
        return
      }

      // Create insert objects for all new transactions
      const inserts: TransactionInsert[] = newTransactions.map(({ tx, hash }) => {
        const cardLastFour = detectCreditCardCharge(tx.description);

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
        };
      })

      // Batch insert ALL transactions in ONE query
      const { error: insertError, data: insertedData } = await supabase
        .from('transactions')
        .insert(inserts)
        .select()

      if (insertError) {
        console.error('[BankUpload] Batch insert failed:', insertError)
        throw new Error(`Failed to save transactions: ${insertError.message}`)
      }

      const saved = insertedData?.length || 0
      console.log('[BankUpload] Batch insert complete. Saved:', saved, 'Duplicates:', duplicates)

      setSavedCount(saved)
      setDuplicateCount(duplicates)
      setStatus('success')
    } catch (err) {
      console.error('Error processing bank statement:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStatus('error')
    }
  }, [file, user])

  const reset = useCallback(() => {
    setFile(null)
    setStatus('idle')
    setError(null)
    setParsedCount(0)
    setSavedCount(0)
    setDuplicateCount(0)
  }, [])

  return {
    file,
    status,
    error,
    parsedCount,
    savedCount,
    duplicateCount,
    selectFile,
    processFile,
    reset,
  }
}
