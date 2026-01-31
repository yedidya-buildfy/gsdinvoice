/**
 * Duplicate Detection Types
 *
 * Two-level duplicate detection:
 * - Level 1 (File): Before upload - hash + semantic matching
 * - Level 2 (Line Items): After extraction - reference_id + date matching
 */

export type DuplicateAction = 'skip' | 'replace' | 'keep_both'

// ============================================================================
// Level 1: File Duplicate Detection
// ============================================================================

export interface FileDuplicateMatch {
  existingFile: {
    id: string
    original_name: string
    created_at: string | null
    storage_path: string | null
  }
  matchType: 'exact' | 'semantic'
  confidence?: number
  matchReason: string
}

export interface FileDuplicateCheckResult {
  isDuplicate: boolean
  matches: FileDuplicateMatch[]
  fileHash: string
}

// ============================================================================
// Level 2: Line Item Duplicate Detection
// ============================================================================

export interface LineItemForCheck {
  reference_id: string | null
  transaction_date: string | null
  amount_agorot: number | null
  currency: string | null
  description: string | null
}

export interface ExistingLineItem {
  id: string
  invoice_id: string
  reference_id: string | null
  transaction_date: string | null
  total_agorot: number | null
  description: string | null
}

export interface LineItemDuplicateMatch {
  newItem: LineItemForCheck
  existingItems: ExistingLineItem[]
  matchType: 'exact_reference' | 'date_amount'
}

export interface LineItemDuplicateCheckResult {
  totalItems: number
  duplicateCount: number
  matches: LineItemDuplicateMatch[]
  newItems: LineItemForCheck[]
}

// ============================================================================
// Level 3: Transaction/Bank Statement Duplicate Detection
// ============================================================================

export interface TransactionDuplicateMatch {
  newTransaction: {
    date: string
    description: string
    amountAgorot: number
    reference: string | null
    hash: string
  }
  existingTransaction: {
    id: string
    date: string
    description: string
    amount_agorot: number
    reference: string | null
    created_at: string | null
  }
}

export interface TransactionDuplicateCheckResult {
  totalTransactions: number
  duplicateCount: number
  newCount: number
  matches: TransactionDuplicateMatch[]
}

