import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadFile, getFileType, isValidFileType } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import type { FileInsert } from '@/types/database'

export interface UploadingFile {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
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
}

export function useFileUpload(): UseFileUploadReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  // Queue for files to upload
  const uploadQueueRef = useRef<File[]>([])
  const isProcessingRef = useRef(false)

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
        // Progress: 30% - Starting upload
        setCurrentProgress(30)

        // Upload to Supabase Storage
        const { path, error: uploadError } = await uploadFile(file, user.id)

        if (uploadError || !path) {
          setError(uploadError?.message || 'Upload failed')
          continue
        }

        // Progress: 60% - File uploaded, saving to database
        setCurrentProgress(60)

        // Insert record into files table
        const fileRecord: FileInsert = {
          user_id: user.id,
          storage_path: path,
          file_type: getFileType(file),
          source_type: 'invoice',
          original_name: file.name,
          file_size: file.size,
          status: 'pending',
        }

        const { error: dbError } = await supabase
          .from('files')
          .insert(fileRecord)

        if (dbError) {
          setError(`Database error: ${dbError.message}`)
          continue
        }

        // Progress: 100% - Complete
        setCurrentProgress(100)

        // Wait 2 seconds before clearing (so user sees completion)
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    // Clear display after all uploads complete
    setCurrentFile(null)
    setCurrentProgress(0)
    setIsUploading(false)
    isProcessingRef.current = false
  }, [user])

  /**
   * Add files and start uploading immediately
   */
  const addFiles = useCallback((newFiles: File[]) => {
    // Add to queue
    uploadQueueRef.current.push(...newFiles)

    // Start processing if not already
    processQueue()
  }, [processQueue])

  return {
    currentFile,
    currentProgress,
    isUploading,
    addFiles,
    error,
  }
}
