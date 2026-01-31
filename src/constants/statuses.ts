/**
 * Centralized status and type constants
 * Use these instead of hardcoded strings throughout the codebase
 */

// File/Document extraction statuses
export const EXTRACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  FAILED: 'failed',
} as const

export type ExtractionStatus = typeof EXTRACTION_STATUS[keyof typeof EXTRACTION_STATUS]

// Transaction types
export const TRANSACTION_TYPE = {
  BANK_REGULAR: 'bank_regular',
  BANK_CC_CHARGE: 'bank_cc_charge',
  CC_PURCHASE: 'cc_purchase',
} as const

export type TransactionType = typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE]

// Match statuses for CC-Bank matching
export const MATCH_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type MatchStatus = typeof MATCH_STATUS[keyof typeof MATCH_STATUS]

// Line item match statuses
export const LINE_ITEM_MATCH_STATUS = {
  UNMATCHED: 'unmatched',
  MATCHED: 'matched',
  PARTIAL: 'partial',
} as const

export type LineItemMatchStatus = typeof LINE_ITEM_MATCH_STATUS[keyof typeof LINE_ITEM_MATCH_STATUS]

// Match methods
export const MATCH_METHOD = {
  MANUAL: 'manual',
  AUTO: 'auto',
} as const

export type MatchMethod = typeof MATCH_METHOD[keyof typeof MATCH_METHOD]
