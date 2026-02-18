/**
 * File Hash Generator
 *
 * Generates a hash for file duplicate detection based on filename and size.
 * Uses UTF-8 safe base64 encoding pattern from useBankStatementUpload.ts
 */

/**
 * UTF-8 safe base64 encoding for consistent hashing
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

/**
 * Generate a hash for a file based on name and size
 * Format: file|{name}|{size}
 */
export function generateFileHash(file: File): string {
  const hashInput = `file|${file.name}|${file.size}`
  return utf8ToBase64(hashInput)
}

