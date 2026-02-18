/**
 * Hash generation utilities for transaction deduplication
 * Handles UTF-8 safe encoding for Hebrew text and other unicode characters
 */

/**
 * UTF-8 safe base64 encoding
 * Properly handles Hebrew text and other multi-byte characters
 * @param str - The string to encode
 * @returns Base64 encoded string
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
  return btoa(binString)
}

/**
 * Generate a unique hash by appending a random suffix
 * Used when keeping both duplicate transactions
 * @param baseHash - The original hash value
 * @returns A new unique hash with a random suffix
 */
export function generateUniqueHash(baseHash: string): string {
  const suffix = Math.random().toString(36).substring(2, 10)
  return `${baseHash}_dup_${suffix}`
}

