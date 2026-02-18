/**
 * Centralized status and type constants
 * Use these instead of hardcoded strings throughout the codebase
 */

// Transaction types
export const TRANSACTION_TYPE = {
  BANK_REGULAR: 'bank_regular',
  BANK_CC_CHARGE: 'bank_cc_charge',
  CC_PURCHASE: 'cc_purchase',
} as const

// Line item match statuses
export const LINE_ITEM_MATCH_STATUS = {
  UNMATCHED: 'unmatched',
  MATCHED: 'matched',
  PARTIAL: 'partial',
} as const

// Match methods
export const MATCH_METHOD = {
  MANUAL: 'manual',
  AUTO: 'auto',
} as const
