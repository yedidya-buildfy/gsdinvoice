import { useState, useCallback } from 'react'
import { parseCreditCardStatement, type ParsedCreditCardTransaction } from '@/lib/parsers/creditCardParser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { TransactionInsert, CreditCardInsert } from '@/types/database'

// UTF-8 safe base64 encoding for Hebrew text
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

interface UseCreditCardUploadReturn {
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

export function useCreditCardUpload(): UseCreditCardUploadReturn {
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

    let parsedTransactions: ParsedCreditCardTransaction[] = []

    try {
      // Step 1: Parse the file
      setStatus('parsing')
      setError(null)

      parsedTransactions = await parseCreditCardStatement(file)
      setParsedCount(parsedTransactions.length)
      console.log('[CreditCardUpload] Parsed transactions:', parsedTransactions.length, parsedTransactions.slice(0, 2))

      if (parsedTransactions.length === 0) {
        setError('No transactions found in file')
        setStatus('error')
        return
      }

      // Step 2: Auto-create credit cards for unique card numbers
      setStatus('saving')

      const uniqueCards = [...new Set(parsedTransactions.map(tx => tx.cardLastFour))]
      console.log('[CreditCardUpload] Unique cards found:', uniqueCards)

      // Build map of cardLastFour -> card ID
      const cardIdMap: Record<string, string> = {}

      for (const cardLastFour of uniqueCards) {
        // Check if card exists
        const { data: existing, error: fetchError } = await supabase
          .from('credit_cards')
          .select('id')
          .eq('user_id', user.id)
          .eq('card_last_four', cardLastFour)
          .maybeSingle()

        if (fetchError) {
          console.error('[CreditCardUpload] Error fetching card:', fetchError)
          throw new Error(`Failed to check existing cards: ${fetchError.message}`)
        }

        if (existing) {
          cardIdMap[cardLastFour] = existing.id
          console.log('[CreditCardUpload] Card already exists:', cardLastFour, existing.id)
        } else {
          // Create new card
          const newCard: CreditCardInsert = {
            user_id: user.id,
            card_last_four: cardLastFour,
            card_type: 'visa', // default, user can edit later
          }

          const { data: created, error: createError } = await supabase
            .from('credit_cards')
            .insert(newCard)
            .select('id')
            .single()

          if (createError) {
            console.error('[CreditCardUpload] Error creating card:', createError)
            throw new Error(`Failed to create card: ${createError.message}`)
          }

          cardIdMap[cardLastFour] = created.id
          console.log('[CreditCardUpload] Created new card:', cardLastFour, created.id)
        }
      }

      // Step 3: Generate hashes for all transactions
      const txWithHashes = parsedTransactions.map((tx) => ({
        tx,
        hash: utf8ToBase64(`cc|${tx.date}|${tx.merchantName.trim()}|${tx.amountAgorot}|${tx.cardLastFour}`),
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

      console.log('[CreditCardUpload] Found', duplicates, 'duplicates,', newTransactions.length, 'new transactions')

      if (newTransactions.length === 0) {
        setSavedCount(0)
        setDuplicateCount(duplicates)
        setStatus('success')
        return
      }

      // Step 4: Create insert objects for all new transactions
      const inserts: TransactionInsert[] = newTransactions.map(({ tx, hash }) => ({
        user_id: user.id,
        date: tx.date,
        value_date: tx.billingDate,
        description: tx.merchantName,
        reference: tx.transactionType,
        amount_agorot: tx.amountAgorot,
        balance_agorot: null, // Credit card transactions don't have balances
        is_income: tx.amountAgorot > 0,
        is_credit_card_charge: false, // Detail rows, not bank charges
        linked_credit_card_id: cardIdMap[tx.cardLastFour],
        channel: tx.notes,
        source_file_id: null,
        hash: hash,
        match_status: 'unmatched',
      }))

      // Batch insert ALL transactions in ONE query
      const { error: insertError, data: insertedData } = await supabase
        .from('transactions')
        .insert(inserts)
        .select()

      if (insertError) {
        console.error('[CreditCardUpload] Batch insert failed:', insertError)
        throw new Error(`Failed to save transactions: ${insertError.message}`)
      }

      const saved = insertedData?.length || 0
      console.log('[CreditCardUpload] Batch insert complete. Saved:', saved, 'Duplicates:', duplicates)

      setSavedCount(saved)
      setDuplicateCount(duplicates)
      setStatus('success')
    } catch (err) {
      console.error('Error processing credit card statement:', err)
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
