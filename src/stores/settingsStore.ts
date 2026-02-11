import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ColumnVisibilityState, TransactionColumnKey, CreditCardColumnKey, DocumentColumnKey } from '@/types/columnVisibility'

export type DuplicateAction = 'skip' | 'replace' | 'add'
export type MatchingTrigger = 'manual' | 'on_upload' | 'after_all_uploads'
export type TablePageSize = 25 | 50 | 100 | 200 | 999
export type LinkingAmountTolerance = number // 51-100 minimum match score filter (100 = exact match only)
export type LinkingCurrencyFilter = 'all' | 'ILS' | 'USD' | 'EUR'

/**
 * Vendor resolver settings - controls where vendor alias resolution is applied
 */
export interface VendorResolverSettings {
  enableInCreditCardTable: boolean      // CreditCardTable.tsx
  enableInTransactionTable: boolean     // TransactionTable.tsx
  enableInInvoiceLinkModal: boolean     // InvoiceBankLinkModal.tsx
  enableInLineItemModal: boolean        // LineItemLinkModal.tsx
}

interface SettingsState {
  // Extraction settings
  autoExtractOnUpload: boolean
  setAutoExtractOnUpload: (value: boolean) => void

  // Auto-approval
  autoApprovalThreshold: number // 0-100
  setAutoApprovalThreshold: (value: number) => void

  // Duplicate handling
  duplicateLineItemAction: DuplicateAction
  setDuplicateLineItemAction: (action: DuplicateAction) => void

  // Matching settings
  matchingTrigger: MatchingTrigger
  setMatchingTrigger: (trigger: MatchingTrigger) => void

  // CC-Bank linking tolerance
  ccBankAmountTolerance: number // percentage (e.g., 2 = 2%)
  setCcBankAmountTolerance: (value: number) => void

  ccBankDateRangeDays: number // days (e.g., 2 = ±2 days)
  setCcBankDateRangeDays: (value: number) => void

  // Matching confidence
  matchingConfidenceThreshold: number // 0-100
  setMatchingConfidenceThreshold: (value: number) => void

  // Auto-matching settings
  autoMatchThreshold: number // 0-100 minimum score to auto-link (default 70)
  setAutoMatchThreshold: (value: number) => void

  // Transaction linking defaults (for line item to transaction linking modal)
  linkingDateRangeDays: number // days before/after line item date (default 14)
  setLinkingDateRangeDays: (value: number) => void

  linkingAmountTolerance: LinkingAmountTolerance // minimum match score filter (default 70)
  setLinkingAmountTolerance: (value: LinkingAmountTolerance) => void

  linkingDefaultCurrency: LinkingCurrencyFilter // default currency filter
  setLinkingDefaultCurrency: (value: LinkingCurrencyFilter) => void

  // Auto-match toggle
  autoMatchEnabled: boolean // Enable bulk auto-matching of line items (default: true)
  setAutoMatchEnabled: (value: boolean) => void

  // Table display settings
  tablePageSize: TablePageSize // 25, 50, 100, 200, 999 (999 = all)
  setTablePageSize: (value: TablePageSize) => void

  // Vendor resolver settings
  vendorResolver: VendorResolverSettings
  setVendorResolverSetting: <K extends keyof VendorResolverSettings>(
    key: K,
    value: VendorResolverSettings[K]
  ) => void

  // Column visibility
  columnVisibility: ColumnVisibilityState
  setColumnVisibility: (table: keyof ColumnVisibilityState, column: string, visible: boolean) => void
  resetColumnVisibility: (table: keyof ColumnVisibilityState) => void
}

function defaultColumnVisibility(): ColumnVisibilityState {
  const txCols: Record<TransactionColumnKey, boolean> = {
    date: true, amount: true, vat: true, vatPercent: true, vatAmount: true,
    reference: true, invoice: true, matchPercent: true, matched: true,
  }
  const ccCols: Record<CreditCardColumnKey, boolean> = {
    date: true, amount: true, currency: true, vat: true, vatPercent: true,
    vatAmount: true, billing: true, status: true, card: true, link: true, invoice: true,
  }
  const docCols: Record<DocumentColumnKey, boolean> = {
    approval: true, type: true, size: true, vendor: true, total: true, vatAmount: true,
    added: true, items: true, confidence: true, bankLink: true, aiStatus: true,
  }
  return { transaction: txCols, creditCard: ccCols, document: docCols }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Extraction settings
      autoExtractOnUpload: true,
      setAutoExtractOnUpload: (value) => set({ autoExtractOnUpload: value }),

      // Auto-approval
      autoApprovalThreshold: 80,
      setAutoApprovalThreshold: (value) => set({ autoApprovalThreshold: value }),

      // Duplicate handling
      duplicateLineItemAction: 'skip',
      setDuplicateLineItemAction: (action) => set({ duplicateLineItemAction: action }),

      // Matching settings
      matchingTrigger: 'on_upload',
      setMatchingTrigger: (trigger) => set({ matchingTrigger: trigger }),

      // CC-Bank linking tolerance
      ccBankAmountTolerance: 2,
      setCcBankAmountTolerance: (value) => set({ ccBankAmountTolerance: value }),

      ccBankDateRangeDays: 2,
      setCcBankDateRangeDays: (value) => set({ ccBankDateRangeDays: value }),

      // Matching confidence
      matchingConfidenceThreshold: 70,
      setMatchingConfidenceThreshold: (value) => set({ matchingConfidenceThreshold: value }),

      // Auto-matching settings
      autoMatchThreshold: 70,
      setAutoMatchThreshold: (value) => set({ autoMatchThreshold: value }),

      // Transaction linking defaults
      linkingDateRangeDays: 14,
      setLinkingDateRangeDays: (value) => set({ linkingDateRangeDays: value }),

      linkingAmountTolerance: 70,
      setLinkingAmountTolerance: (value) => set({ linkingAmountTolerance: Math.max(51, Math.min(100, value)) }),

      linkingDefaultCurrency: 'all',
      setLinkingDefaultCurrency: (value) => set({ linkingDefaultCurrency: value }),

      // Auto-match toggle
      autoMatchEnabled: true,
      setAutoMatchEnabled: (value) => set({ autoMatchEnabled: value }),

      // Table display settings
      tablePageSize: 50,
      setTablePageSize: (value) => set({ tablePageSize: value }),

      // Vendor resolver settings - default all to true
      vendorResolver: {
        enableInCreditCardTable: true,
        enableInTransactionTable: true,
        enableInInvoiceLinkModal: true,
        enableInLineItemModal: true,
      },
      setVendorResolverSetting: (key, value) =>
        set((state) => ({
          vendorResolver: {
            ...state.vendorResolver,
            [key]: value,
          },
        })),

      // Column visibility - default all to true
      columnVisibility: defaultColumnVisibility(),
      setColumnVisibility: (table, column, visible) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [table]: {
              ...state.columnVisibility[table],
              [column]: visible,
            },
          },
        })),
      resetColumnVisibility: (table) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [table]: defaultColumnVisibility()[table],
          },
        })),
    }),
    {
      name: 'vat-manager-settings',
      partialize: (state) => ({
        autoExtractOnUpload: state.autoExtractOnUpload,
        autoApprovalThreshold: state.autoApprovalThreshold,
        duplicateLineItemAction: state.duplicateLineItemAction,
        matchingTrigger: state.matchingTrigger,
        ccBankAmountTolerance: state.ccBankAmountTolerance,
        ccBankDateRangeDays: state.ccBankDateRangeDays,
        matchingConfidenceThreshold: state.matchingConfidenceThreshold,
        autoMatchThreshold: state.autoMatchThreshold,
        linkingDateRangeDays: state.linkingDateRangeDays,
        linkingAmountTolerance: state.linkingAmountTolerance,
        linkingDefaultCurrency: state.linkingDefaultCurrency,
        autoMatchEnabled: state.autoMatchEnabled,
        tablePageSize: state.tablePageSize,
        vendorResolver: state.vendorResolver,
        columnVisibility: state.columnVisibility,
      }),
    }
  )
)
