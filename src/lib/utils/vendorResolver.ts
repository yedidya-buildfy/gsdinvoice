/**
 * Vendor Resolver Utility
 *
 * Resolves transaction descriptions to canonical vendor names using vendor aliases.
 * This utility provides functions for matching transaction descriptions against
 * user-defined alias patterns and returning standardized vendor names.
 */

import type { VendorAlias } from '@/types/database'
import { parseMerchantName } from './merchantParser'

/**
 * Result of vendor display info lookup
 */
export interface VendorDisplayInfo {
  /** The display name to show (canonical name or parsed merchant name) */
  displayName: string
  /** Whether the name was resolved via an alias (true) or fallback (false) */
  isResolved: boolean
  /** The alias that matched, if any */
  matchedAlias?: VendorAlias
}

/**
 * Checks if a transaction description matches a single alias pattern.
 * Pattern matching is case-insensitive.
 *
 * @param description - The transaction description to check (e.g., "FACEBK *ADS 123")
 * @param alias - The vendor alias to match against
 * @returns true if the description matches the alias pattern, false otherwise
 *
 * @example
 * ```ts
 * const alias: VendorAlias = {
 *   alias_pattern: 'FACEBK',
 *   canonical_name: 'Meta (Facebook)',
 *   match_type: 'starts_with',
 *   priority: 100,
 *   // ... other fields
 * }
 * matchesAliasPattern('FACEBK *ADS 123', alias) // returns true
 * matchesAliasPattern('Google Ads', alias)      // returns false
 * ```
 */
export function matchesAliasPattern(description: string, alias: VendorAlias): boolean {
  if (!description || !alias.alias_pattern) {
    return false
  }

  const normalizedDesc = description.toUpperCase().trim()
  const pattern = alias.alias_pattern.toUpperCase().trim()

  if (!pattern) {
    return false
  }

  switch (alias.match_type) {
    case 'exact':
      return normalizedDesc === pattern
    case 'starts_with':
      return normalizedDesc.startsWith(pattern)
    case 'ends_with':
      return normalizedDesc.endsWith(pattern)
    case 'contains':
    default:
      return normalizedDesc.includes(pattern)
  }
}

/**
 * Sorts aliases by priority (higher priority first).
 * Handles null/undefined priority values by treating them as 0.
 *
 * @param aliases - Array of vendor aliases to sort
 * @returns A new array sorted by priority descending
 */
function sortAliasesByPriority(aliases: VendorAlias[]): VendorAlias[] {
  return [...aliases].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/**
 * Resolves a transaction description to a canonical vendor name using vendor aliases.
 *
 * The function:
 * 1. Sorts aliases by priority (higher priority first)
 * 2. Checks each alias pattern against the description
 * 3. Returns the canonical name of the first matching alias
 *
 * @param description - The transaction description to resolve (e.g., "FACEBK *ADS 123")
 * @param aliases - Array of vendor aliases to check against
 * @returns The canonical vendor name if a match is found, null otherwise
 *
 * @example
 * ```ts
 * const aliases: VendorAlias[] = [
 *   { alias_pattern: 'FACEBK', canonical_name: 'Meta (Facebook)', match_type: 'starts_with', priority: 100, ... },
 *   { alias_pattern: 'FB', canonical_name: 'Meta (Facebook)', match_type: 'starts_with', priority: 50, ... },
 * ]
 *
 * resolveVendorName('FACEBK *ADS 123', aliases)  // returns 'Meta (Facebook)'
 * resolveVendorName('Unknown Merchant', aliases) // returns null
 * ```
 */
export function resolveVendorName(
  description: string,
  aliases: VendorAlias[]
): string | null {
  if (!description || !aliases || aliases.length === 0) {
    return null
  }

  const sortedAliases = sortAliasesByPriority(aliases)

  for (const alias of sortedAliases) {
    if (matchesAliasPattern(description, alias)) {
      return alias.canonical_name
    }
  }

  return null
}

/**
 * Resolves a transaction description to a vendor name, with a fallback.
 * Unlike `resolveVendorName`, this function never returns null.
 *
 * Resolution order:
 * 1. Check vendor aliases (sorted by priority)
 * 2. If no match, use the fallback parser
 * 3. Default fallback is `parseMerchantName` from merchantParser
 *
 * @param description - The transaction description to resolve
 * @param aliases - Array of vendor aliases to check against
 * @param fallbackParser - Optional custom parser function for when no alias matches
 * @returns The canonical vendor name, or a parsed/cleaned version of the description
 *
 * @example
 * ```ts
 * // With alias match
 * resolveVendorNameWithFallback('FACEBK *ADS', aliases)
 * // returns 'Meta (Facebook)'
 *
 * // Without alias match (uses default parser)
 * resolveVendorNameWithFallback('Some Unknown Merchant -REF123', [])
 * // returns 'Some Unknown Merchant' (cleaned by parseMerchantName)
 *
 * // With custom fallback
 * resolveVendorNameWithFallback('Custom', [], (desc) => desc.toUpperCase())
 * // returns 'CUSTOM'
 * ```
 */
export function resolveVendorNameWithFallback(
  description: string,
  aliases: VendorAlias[],
  fallbackParser?: (desc: string) => string
): string {
  if (!description) {
    return ''
  }

  // Try to resolve via aliases first
  const resolved = resolveVendorName(description, aliases)
  if (resolved) {
    return resolved
  }

  // Use fallback parser or default to parseMerchantName
  const parser = fallbackParser ?? parseMerchantName
  return parser(description)
}

/**
 * Gets comprehensive display information for a vendor name resolution.
 * Useful for UI components that need to indicate whether an alias was used.
 *
 * @param description - The transaction description to resolve
 * @param aliases - Array of vendor aliases to check against
 * @returns Object containing displayName, isResolved flag, and optionally the matched alias
 *
 * @example
 * ```ts
 * // With alias match
 * getVendorDisplayInfo('FACEBK *ADS', aliases)
 * // returns {
 * //   displayName: 'Meta (Facebook)',
 * //   isResolved: true,
 * //   matchedAlias: { alias_pattern: 'FACEBK', canonical_name: 'Meta (Facebook)', ... }
 * // }
 *
 * // Without alias match
 * getVendorDisplayInfo('Unknown Merchant -REF', [])
 * // returns {
 * //   displayName: 'Unknown Merchant',
 * //   isResolved: false,
 * //   matchedAlias: undefined
 * // }
 * ```
 */
export function getVendorDisplayInfo(
  description: string,
  aliases: VendorAlias[]
): VendorDisplayInfo {
  if (!description) {
    return {
      displayName: '',
      isResolved: false,
    }
  }

  if (!aliases || aliases.length === 0) {
    return {
      displayName: parseMerchantName(description),
      isResolved: false,
    }
  }

  const sortedAliases = sortAliasesByPriority(aliases)

  for (const alias of sortedAliases) {
    if (matchesAliasPattern(description, alias)) {
      return {
        displayName: alias.canonical_name,
        isResolved: true,
        matchedAlias: alias,
      }
    }
  }

  return {
    displayName: parseMerchantName(description),
    isResolved: false,
  }
}

/**
 * Finds all aliases that match a given description.
 * Useful for debugging or showing all applicable aliases to users.
 *
 * @param description - The transaction description to check
 * @param aliases - Array of vendor aliases to check against
 * @returns Array of matching aliases, sorted by priority (highest first)
 */
export function findMatchingAliases(
  description: string,
  aliases: VendorAlias[]
): VendorAlias[] {
  if (!description || !aliases || aliases.length === 0) {
    return []
  }

  const sortedAliases = sortAliasesByPriority(aliases)
  return sortedAliases.filter((alias) => matchesAliasPattern(description, alias))
}
