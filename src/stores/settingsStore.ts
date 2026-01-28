import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DuplicateAction = 'skip' | 'replace' | 'add'
export type MatchingTrigger = 'manual' | 'on_upload' | 'after_all_uploads'

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
      }),
    }
  )
)
