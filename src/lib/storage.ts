import { supabase } from '@/lib/supabase'

export const BUCKET_NAME = 'documents'

export type FileType = 'pdf' | 'image' | 'xlsx' | 'csv' | 'unknown'

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'csv']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]

/**
 * Determine the file type based on MIME type and extension
 */
export function getFileType(file: File): FileType {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeType = file.type.toLowerCase()

  // Check by MIME type first
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (mimeType === 'text/csv') return 'csv'

  // Fallback to extension check
  if (extension === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png'].includes(extension || '')) return 'image'
  if (extension === 'xlsx') return 'xlsx'
  if (extension === 'csv') return 'csv'

  return 'unknown'
}

/**
 * Validate if a file type is allowed for upload
 */
export function isValidFileType(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeType = file.type.toLowerCase()

  // Check extension
  if (extension && ALLOWED_EXTENSIONS.includes(extension)) return true

  // Check MIME type
  if (ALLOWED_MIME_TYPES.includes(mimeType)) return true

  return false
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  file: File,
  userId: string
): Promise<{ path: string | null; error: Error | null }> {
  try {
    // Generate unique path with timestamp
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${userId}/${timestamp}-${sanitizedName}`

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, { upsert: false })

    if (error) {
      return { path: null, error: new Error(error.message) }
    }

    return { path, error: null }
  } catch (err) {
    return {
      path: null,
      error: err instanceof Error ? err : new Error('Upload failed'),
    }
  }
}

/**
 * Get the public URL for a file in storage
 */
export function getFileUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  path: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path])

    if (error) {
      return { error: new Error(error.message) }
    }

    return { error: null }
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error('Delete failed'),
    }
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
