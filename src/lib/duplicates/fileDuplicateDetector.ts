/**
 * File Duplicate Detector (Level 1)
 *
 * Detects duplicate files before upload using:
 * 1. Primary: file_hash matching (filename + size)
 * 2. Secondary: Semantic matching (same vendor + amount ±2% + date ±2 days)
 */

import { supabase } from '@/lib/supabase'
import { generateFileHash } from './fileHashGenerator'
import { isSameMerchant } from '@/lib/utils/merchantParser'
import type { FileDuplicateCheckResult, FileDuplicateMatch } from './types'

const AMOUNT_TOLERANCE_PERCENT = 2
const DATE_WINDOW_DAYS = 2

/**
 * Check if two amounts match within tolerance (2%)
 */
function amountsMatch(amount1: number, amount2: number): boolean {
  const diff = Math.abs(amount1 - amount2)
  const larger = Math.max(Math.abs(amount1), Math.abs(amount2))
  const percentDiff = larger > 0 ? (diff / larger) * 100 : 0
  return percentDiff <= AMOUNT_TOLERANCE_PERCENT
}

/**
 * Check if two dates are within window (±2 days)
 */
function datesWithinWindow(date1: string, date2: string): boolean {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffMs = Math.abs(d1.getTime() - d2.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= DATE_WINDOW_DAYS
}

/**
 * Check if a file is a duplicate before upload
 *
 * @param file The file to check
 * @param userId The user's ID
 * @param teamId The team's ID (optional, for team-scoped duplicate check)
 * @returns Duplicate check result with matches if found
 */
export async function checkFileDuplicate(
  file: File,
  userId: string,
  teamId?: string | null
): Promise<FileDuplicateCheckResult> {
  const fileHash = generateFileHash(file)
  const matches: FileDuplicateMatch[] = []

  // Primary check: Exact hash match
  let hashQuery = supabase
    .from('files')
    .select('id, original_name, created_at, storage_path, file_hash')
    .eq('file_hash', fileHash)

  // Filter by team if provided, otherwise by user
  if (teamId) {
    hashQuery = hashQuery.eq('team_id', teamId)
  } else {
    hashQuery = hashQuery.eq('user_id', userId).is('team_id', null)
  }

  const { data: hashMatches, error: hashError } = await hashQuery

  if (!hashError && hashMatches && hashMatches.length > 0) {
    for (const match of hashMatches) {
      matches.push({
        existingFile: {
          id: match.id,
          original_name: match.original_name,
          created_at: match.created_at,
          storage_path: match.storage_path,
        },
        matchType: 'exact',
        confidence: 100,
        matchReason: 'Same filename and size',
      })
    }
  }

  // Secondary check: Semantic matching via invoices
  // Only if no exact matches found
  if (matches.length === 0) {
    // We can't do semantic matching without parsing the file first
    // This would require extracting vendor/amount/date before upload
    // For now, we also check for files with same name (ignoring size)
    let nameQuery = supabase
      .from('files')
      .select('id, original_name, created_at, storage_path')
      .eq('original_name', file.name)
      .neq('file_hash', fileHash) // Different hash but same name

    // Filter by team if provided, otherwise by user
    if (teamId) {
      nameQuery = nameQuery.eq('team_id', teamId)
    } else {
      nameQuery = nameQuery.eq('user_id', userId).is('team_id', null)
    }

    const { data: nameMatches, error: nameError } = await nameQuery

    if (!nameError && nameMatches && nameMatches.length > 0) {
      for (const match of nameMatches) {
        matches.push({
          existingFile: {
            id: match.id,
            original_name: match.original_name,
            created_at: match.created_at,
            storage_path: match.storage_path,
          },
          matchType: 'semantic',
          confidence: 75,
          matchReason: 'Same filename (different size - possibly modified)',
        })
      }
    }
  }

  return {
    isDuplicate: matches.length > 0,
    matches,
    fileHash,
  }
}

/**
 * Check for semantic duplicates by invoice data
 * Called after extraction to find invoices with same vendor + amount + date
 *
 * @param userId User ID
 * @param vendorName Vendor name from extracted invoice
 * @param totalAmountAgorot Total amount in agorot
 * @param invoiceDate Invoice date (YYYY-MM-DD)
 * @param excludeFileId File ID to exclude (the current file)
 * @param teamId Team ID (optional, for team-scoped duplicate check)
 */
export async function checkSemanticDuplicate(
  userId: string,
  vendorName: string | null,
  totalAmountAgorot: number | null,
  invoiceDate: string | null,
  excludeFileId: string,
  teamId?: string | null
): Promise<FileDuplicateMatch[]> {
  if (!vendorName || !totalAmountAgorot || !invoiceDate) {
    return []
  }

  const matches: FileDuplicateMatch[] = []

  // Query invoices with similar amount and date
  const minAmount = Math.floor(totalAmountAgorot * (1 - AMOUNT_TOLERANCE_PERCENT / 100))
  const maxAmount = Math.ceil(totalAmountAgorot * (1 + AMOUNT_TOLERANCE_PERCENT / 100))

  let query = supabase
    .from('invoices')
    .select(`
      id,
      vendor_name,
      total_amount_agorot,
      invoice_date,
      file_id,
      files!inner (
        id,
        original_name,
        created_at,
        storage_path
      )
    `)
    .neq('file_id', excludeFileId)
    .gte('total_amount_agorot', minAmount)
    .lte('total_amount_agorot', maxAmount)

  // Filter by team if provided, otherwise by user
  if (teamId) {
    query = query.eq('team_id', teamId)
  } else {
    query = query.eq('user_id', userId).is('team_id', null)
  }

  const { data: similarInvoices, error } = await query

  if (error || !similarInvoices) {
    return []
  }

  for (const invoice of similarInvoices) {
    // Check vendor match
    if (!invoice.vendor_name || !isSameMerchant(vendorName, invoice.vendor_name)) {
      continue
    }

    // Check date match
    if (!invoice.invoice_date || !datesWithinWindow(invoiceDate, invoice.invoice_date)) {
      continue
    }

    // Check amount match (double-check with exact tolerance)
    if (!invoice.total_amount_agorot || !amountsMatch(totalAmountAgorot, invoice.total_amount_agorot)) {
      continue
    }

    const file = invoice.files as unknown as {
      id: string
      original_name: string
      created_at: string
      storage_path: string
    }

    if (file) {
      matches.push({
        existingFile: {
          id: file.id,
          original_name: file.original_name,
          created_at: file.created_at,
          storage_path: file.storage_path,
        },
        matchType: 'semantic',
        confidence: 85,
        matchReason: `Same vendor (${invoice.vendor_name}), similar amount and date`,
      })
    }
  }

  return matches
}
