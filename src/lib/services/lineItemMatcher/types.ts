/**
 * Types for Line Item to Transaction Matching
 */

import type { Transaction, InvoiceRow, Invoice } from '@/types/database'

type TransactionType = 'bank_regular' | 'bank_cc_charge' | 'cc_purchase'

export type MatchMethod = 'manual' | 'rule_reference' | 'rule_amount_date' | 'rule_fuzzy' | 'ai_assisted'

/**
 * Line item with invoice context for display
 */
export interface LineItemWithInvoice extends InvoiceRow {
  invoice: Pick<Invoice, 'id' | 'vendor_name' | 'invoice_number' | 'invoice_date'>
}

/**
 * Transaction with credit card context for display
 */
export interface TransactionWithCard extends Transaction {
  credit_card?: {
    card_last_four: string
    card_name: string | null
    card_type: string
  } | null
}

/**
 * Options for finding matchable transactions
 */
export interface GetMatchableTransactionsOptions {
  teamId?: string | null              // filter by team
  dateRangeDays?: number              // default: 7
  amountTolerancePercent?: number     // default: 10
  transactionTypes?: TransactionType[] // default: ['bank_regular', 'cc_purchase']
  creditCardId?: string               // filter by specific card
  searchQuery?: string                // search in description
}

/**
 * Options for finding matchable line items
 */
export interface GetMatchableLineItemsOptions {
  teamId?: string | null              // filter by team
  dateRangeDays?: number              // default: 7
  amountTolerancePercent?: number     // default: 10
  invoiceId?: string                  // filter by specific invoice
  vendorName?: string                 // filter by vendor
  searchQuery?: string                // search in description
}

/**
 * Result of linking operation
 */
export interface LinkResult {
  success: boolean
  error?: string
}

/**
 * Summary of linked items for a transaction
 */
export interface TransactionLinkSummary {
  transactionId: string
  linkedCount: number
  totalAllocatedAgorot: number
  transactionAmountAgorot: number
  remainingAgorot: number
  isFullyAllocated: boolean
}

/**
 * Summary of linked transaction for a line item
 */
export interface LineItemLinkSummary {
  lineItemId: string
  isLinked: boolean
  transaction?: Pick<Transaction, 'id' | 'date' | 'description' | 'amount_agorot' | 'transaction_type'>
  matchConfidence?: number
  matchMethod?: MatchMethod
}
