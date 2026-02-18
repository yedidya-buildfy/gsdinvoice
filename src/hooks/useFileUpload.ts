import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadFile, getFileType, isValidFileType } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import { checkFileDuplicate } from '@/lib/duplicates'
import type { FileInsert } from '@/types/database'
import type { FileDuplicateMatch, DuplicateAction } from '@/lib/duplicates/types'

interface FileDuplicateResult {
  file: File
  matches: FileDuplicateMatch[]
  fileHash: string
}

interface UseFileUploadReturn {
  /** Currently uploading file (for display) */
  currentFile: File | null
  /** Progress percentage for current file (0-100) */
  currentProgress: number
  /** Whether any upload is in progress */
  isUploading: boolean
  /** Add files and start uploading immediately */
  addFiles: (files: File[]) => void
  /** Last error message */
  error: string | null
  /** Duplicate check result (if duplicate found) */
  duplicateResult: FileDuplicateResult | null
  /** Handle user's duplicate action choice */
  handleDuplicateAction: (action: DuplicateAction, replaceId?: string) => void
  /** Clear duplicate result and continue */
  clearDuplicateResult: () => void
}

export function useFileUpload(): UseFileUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateResult, setDuplicateResult] = useState<FileDuplicateResult | null>(null)
  const { user } = useAuth()
  const { currentTeam } = useTeam()

  // Queue for files to upload
  const uploadQueueRef = useRef<File[]>([])
  const isProcessingRef = useRef(false)
  // Store pending file while waiting for duplicate action
  const pendingDuplicateFileRef = useRef<{ file: File; fileHash: string } | null>(null)

  /**
   * Upload a single file (called after duplicate check or action)
   */
  const uploadSingleFile = useCallback(async (file: File, fileHash: string): Promise<boolean> => {
    if (!user || !currentTeam) return false

    try {
      // Progress: 30% - Starting upload
      setCurrentProgress(30)

      // Upload to Supabase Storage
      const { path, error: uploadError } = await uploadFile(file, user.id)

      if (uploadError || !path) {
        setError(uploadError?.message || 'Upload failed')
        return false
      }

      // Progress: 60% - File uploaded, saving to database
      setCurrentProgress(60)

      // Insert record into files table with file_hash and team_id
      const fileRecord: FileInsert & { file_hash: string } = {
        user_id: user.id,
        team_id: currentTeam.id,
        storage_path: path,
        file_type: getFileType(file),
        source_type: 'invoice',
        original_name: file.name,
        file_size: file.size,
        status: 'pending',
        file_hash: fileHash,
      }

      const { error: dbError } = await supabase
        .from('files')
        .insert(fileRecord)

      if (dbError) {
        setError(`Database error: ${dbError.message}`)
        return false
      }

      // Progress: 100% - Complete
      setCurrentProgress(100)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    }
  }, [user, currentTeam])

  /**
   * Process the upload queue sequentially
   */
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || uploadQueueRef.current.length === 0) {
      return
    }

    if (!user) {
      setError('User not authenticated')
      return
    }

    if (!currentTeam) {
      setError('No team selected')
      return
    }

    isProcessingRef.current = true
    setIsUploading(true)
    setError(null)

    while (uploadQueueRef.current.length > 0) {
      const file = uploadQueueRef.current.shift()!

      // Validate file type
      if (!isValidFileType(file)) {
        setError(`Invalid file type: ${file.name}`)
        continue
      }

      setCurrentFile(file)
      setCurrentProgress(0)

      try {
        // Check for duplicates before upload (scoped to team)
        setCurrentProgress(10)
        const duplicateCheck = await checkFileDuplicate(file, user.id, currentTeam.id)

        if (duplicateCheck.isDuplicate) {
          // Store pending file and show modal
          pendingDuplicateFileRef.current = { file, fileHash: duplicateCheck.fileHash }
          setDuplicateResult({
            file,
            matches: duplicateCheck.matches,
            fileHash: duplicateCheck.fileHash,
          })
          // Pause processing - will resume after user action
          isProcessingRef.current = false
          return
        }

        // No duplicate - proceed with upload
        const success = await uploadSingleFile(file, duplicateCheck.fileHash)

        if (success) {
          // Wait 2 seconds before clearing (so user sees completion)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    // Clear display after all uploads complete
    setCurrentFile(null)
    setCurrentProgress(0)
    setIsUploading(false)
    isProcessingRef.current = false
  }, [user, currentTeam, uploadSingleFile])

  /**
   * Add files and start uploading immediately
   */
  const addFiles = useCallback((newFiles: File[]) => {
    // Add to queue
    uploadQueueRef.current.push(...newFiles)

    // Start processing if not already
    processQueue()
  }, [processQueue])

  /**
   * Handle user's choice when duplicate is detected
   */
  const handleDuplicateAction = useCallback(async (action: DuplicateAction, replaceId?: string) => {
    const pending = pendingDuplicateFileRef.current
    if (!pending || !user) {
      setDuplicateResult(null)
      return
    }

    setDuplicateResult(null)

    try {
      switch (action) {
        case 'skip':
          // Don't upload, just continue with queue
          break

        case 'replace':
          if (replaceId) {
            // Delete in correct order due to foreign key constraints:
            // 1. invoice_rows -> invoices -> files

            // First, get the invoice ID for this file
            const { data: invoiceData } = await supabase
              .from('invoices')
              .select('id')
              .eq('file_id', replaceId)
              .single()

            if (invoiceData) {
              // Delete invoice_rows first
              await supabase
                .from('invoice_rows')
                .delete()
                .eq('invoice_id', invoiceData.id)

              // Delete the invoice
              await supabase
                .from('invoices')
                .delete()
                .eq('id', invoiceData.id)
            }

            // Now delete the file
            const { error: deleteError } = await supabase
              .from('files')
              .delete()
              .eq('id', replaceId)

            if (deleteError) {
              setError(`Failed to delete existing file: ${deleteError.message}`)
              break
            }
          }
          // Upload the new file
          await uploadSingleFile(pending.file, pending.fileHash)
          await new Promise(resolve => setTimeout(resolve, 2000))
          break

        case 'keep_both': {
          // Upload anyway with a new hash (append timestamp to make unique)
          const uniqueHash = `${pending.fileHash}_${Date.now()}`
          await uploadSingleFile(pending.file, uniqueHash)
          await new Promise(resolve => setTimeout(resolve, 2000))
          break
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }

    // Clear pending and continue processing queue
    pendingDuplicateFileRef.current = null
    setCurrentFile(null)
    setCurrentProgress(0)

    // Resume processing remaining files
    if (uploadQueueRef.current.length > 0) {
      processQueue()
    } else {
      setIsUploading(false)
    }
  }, [user, uploadSingleFile, processQueue])

  /**
   * Clear duplicate result without taking action (cancel)
   */
  const clearDuplicateResult = useCallback(() => {
    setDuplicateResult(null)
    pendingDuplicateFileRef.current = null
    setCurrentFile(null)
    setCurrentProgress(0)

    // Resume processing remaining files
    if (uploadQueueRef.current.length > 0) {
      processQueue()
    } else {
      setIsUploading(false)
    }
  }, [processQueue])

  return {
    currentFile,
    currentProgress,
    isUploading,
    addFiles,
    error,
    duplicateResult,
    handleDuplicateAction,
    clearDuplicateResult,
  }
}
