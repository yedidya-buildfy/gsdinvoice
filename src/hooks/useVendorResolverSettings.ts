/**
 * Hook for accessing vendor resolver settings
 *
 * Provides a convenient interface for components to check if vendor resolution
 * is enabled for their specific context and to update settings.
 */

import { useSettingsStore, type VendorResolverSettings } from '@/stores/settingsStore'

interface UseVendorResolverSettingsReturn {
  /** Current vendor resolver settings */
  settings: VendorResolverSettings
  /** Check if vendor resolution is enabled for credit card tables */
  enableInCreditCardTable: boolean
  /** Check if vendor resolution is enabled for bank transaction tables */
  enableInTransactionTable: boolean
  /** Check if vendor resolution is enabled for invoice bank link modal */
  enableInInvoiceLinkModal: boolean
  /** Check if vendor resolution is enabled for line item link modal */
  enableInLineItemModal: boolean
  /** Update a specific setting */
  updateSetting: <K extends keyof VendorResolverSettings>(
    key: K,
    value: VendorResolverSettings[K]
  ) => void
}

/**
 * Hook for accessing and managing vendor resolver settings
 *
 * @example
 * ```tsx
 * const { enableInCreditCardTable, updateSetting } = useVendorResolverSettings()
 *
 * // Check if enabled
 * if (enableInCreditCardTable) {
 *   // Use vendor resolution
 * }
 *
 * // Toggle setting
 * updateSetting('enableInCreditCardTable', false)
 * ```
 */
export function useVendorResolverSettings(): UseVendorResolverSettingsReturn {
  const vendorResolver = useSettingsStore((state) => state.vendorResolver)
  const setVendorResolverSetting = useSettingsStore((state) => state.setVendorResolverSetting)

  return {
    settings: vendorResolver,
    enableInCreditCardTable: vendorResolver.enableInCreditCardTable,
    enableInTransactionTable: vendorResolver.enableInTransactionTable,
    enableInInvoiceLinkModal: vendorResolver.enableInInvoiceLinkModal,
    enableInLineItemModal: vendorResolver.enableInLineItemModal,
    updateSetting: setVendorResolverSetting,
  }
}
