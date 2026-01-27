import { useState, useCallback } from 'react'
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
  files: UploadingFile[]
  addFiles: (files: File[]) => void
  removeFile: (index: number) => void
  uploadAll: () => Promise<void>
  clearCompleted: () => void
  isUploading: boolean
}

export function useFileUpload(): UseFileUploadReturn {
  const [files, setFiles] = useState<UploadingFile[]>([])
  const { user } = useAuth()

  const isUploading = files.some((f) => f.status === 'uploading')

  const addFiles = useCallback((newFiles: File[]) => {
    const uploadingFiles: UploadingFile[] = newFiles.map((file) => {
      // Validate file type
      if (!isValidFileType(file)) {
        return {
          file,
          progress: 0,
          status: 'error' as const,
          error: 'Invalid file type. Allowed: PDF, JPG, PNG, XLSX, CSV',
        }
      }

      return {
        file,
        progress: 0,
        status: 'pending' as const,
      }
    })

    setFiles((prev) => [...prev, ...uploadingFiles])
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'success'))
  }, [])

  const uploadAll = useCallback(async () => {
    if (!user) {
      console.error('User not authenticated')
      return
    }

    // Get pending files indices
    const pendingIndices = files
      .map((f, i) => (f.status === 'pending' ? i : -1))
      .filter((i) => i !== -1)

    if (pendingIndices.length === 0) return

    // Set all pending to uploading
    setFiles((prev) =>
      prev.map((f, i) =>
        pendingIndices.includes(i) ? { ...f, status: 'uploading' as const } : f
      )
    )

    // Upload files sequentially to avoid overwhelming the server
    for (const index of pendingIndices) {
      const uploadingFile = files[index]

      try {
        // Upload to Supabase Storage
        const { path, error: uploadError } = await uploadFile(
          uploadingFile.file,
          user.id
        )

        if (uploadError || !path) {
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index
                ? {
                    ...f,
                    status: 'error' as const,
                    error: uploadError?.message || 'Upload failed',
                  }
                : f
            )
          )
          continue
        }

        // Insert record into files table
        const fileRecord: FileInsert = {
          user_id: user.id,
          storage_path: path,
          file_type: getFileType(uploadingFile.file),
          source_type: 'invoice',
          original_name: uploadingFile.file.name,
          file_size: uploadingFile.file.size,
          status: 'pending', // Awaiting AI extraction
        }

        const { error: dbError } = await supabase
          .from('files')
          .insert(fileRecord)

        if (dbError) {
          // File uploaded but DB insert failed - set error status
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index
                ? {
                    ...f,
                    status: 'error' as const,
                    error: `Database error: ${dbError.message}`,
                  }
                : f
            )
          )
          continue
        }

        // Success - update progress to 100 and status to success
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, progress: 100, status: 'success' as const }
              : f
          )
        )
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: 'error' as const,
                  error:
                    err instanceof Error ? err.message : 'Unknown error',
                }
              : f
          )
        )
      }
    }
  }, [files, user])

  return {
    files,
    addFiles,
    removeFile,
    uploadAll,
    clearCompleted,
    isUploading,
  }
}
