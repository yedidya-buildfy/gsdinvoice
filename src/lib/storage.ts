import { supabase } from '@/lib/supabase'

export const BUCKET_NAME = 'documents'

export type FileType = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'xlsx' | 'csv' | 'unknown'

// Image types for display logic
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'webp'] as const
export function isImageType(fileType: string): boolean {
  return IMAGE_TYPES.includes(fileType.toLowerCase() as typeof IMAGE_TYPES[number])
}

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
 * Returns specific format (e.g., 'png', 'jpg') for AI extraction compatibility
 */
export function getFileType(file: File): FileType {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeType = file.type.toLowerCase()

  // Check by MIME type first
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (mimeType === 'text/csv') return 'csv'

  // Fallback to extension check
  if (extension === 'pdf') return 'pdf'
  if (extension === 'png') return 'png'
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg'
  if (extension === 'webp') return 'webp'
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

