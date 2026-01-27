import { useState, useCallback } from 'react'
import { parseBankStatement, type ParsedTransaction } from '@/lib/parsers/bankStatementParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { TransactionInsert } from '@/types/database'

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

      if (parsedTransactions.length === 0) {
        setError('No transactions found in file')
        setStatus('error')
        return
      }

      // Step 2: Save to database with duplicate detection
      setStatus('saving')
      let saved = 0
      let duplicates = 0

      for (const tx of parsedTransactions) {
        try {
          // Generate hash for duplicate detection
          const hash = btoa(`${tx.date}|${tx.description.trim()}|${tx.amountAgorot}|${tx.reference || ''}`)

          // Check for existing transaction with same hash
          const { data: existing } = await supabase
            .from('transactions')
            .select('id')
            .eq('hash', hash)
            .eq('user_id', user.id)
            .single()

          if (existing) {
            duplicates++
            continue
          }

          // Create transaction insert object
          const transactionInsert: TransactionInsert = {
            user_id: user.id,
            date: tx.date,
            value_date: tx.valueDate,
            description: tx.description,
            reference: tx.reference,
            amount_agorot: tx.amountAgorot,
            balance_agorot: tx.balanceAgorot,
            is_income: tx.amountAgorot > 0,
            is_credit_card_charge: false,
            source_file_id: null, // No file record for bank imports
            hash: hash,
            match_status: 'unmatched',
          }

          // Insert to database
          const { error: insertError } = await supabase
            .from('transactions')
            .insert(transactionInsert)

          if (insertError) {
            console.error('Failed to insert transaction:', insertError)
            continue
          }

          saved++
        } catch (txError) {
          console.error('Error processing transaction:', txError)
          // Continue with next transaction
        }
      }

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
