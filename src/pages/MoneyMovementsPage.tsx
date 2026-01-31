import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { BankTab, CCChargesTab, CCPurchasesTab, CCMatchingTab } from '@/components/money-movements'
import { CCChargeModal } from '@/components/bank/CCChargeModal'

type TabId = 'bank' | 'cc-charges' | 'cc-purchases' | 'matching'

const tabs: { id: TabId; label: string }[] = [
  { id: 'bank', label: 'Bank' },
  { id: 'cc-purchases', label: 'CC Purchases' },
  { id: 'cc-charges', label: 'CC Charges' },
  { id: 'matching', label: 'Matching' },
]

export function MoneyMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TabId | null
  const validTabs: TabId[] = ['bank', 'cc-charges', 'cc-purchases', 'matching']
  const activeTab: TabId = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'bank'

  // CC Charge modal state (for CC Charges tab)
  const [selectedCCChargeId, setSelectedCCChargeId] = useState<string | null>(null)
  // For linking unmatched CC transactions (from Matching tab or CC Purchases tab)
  const [linkingCCTransactionId, setLinkingCCTransactionId] = useState<string | null>(null)

  // Refetch trigger - incremented to trigger child refetches
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const handleTabChange = (tab: TabId) => {
    setSearchParams({ tab })
  }

  const handleRefetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1)
  }, [])

  const handleCCChargeClick = (bankTransactionId: string) => {
    setSelectedCCChargeId(bankTransactionId)
  }

  const handleLinkCCTransaction = (ccTransactionId: string) => {
    setLinkingCCTransactionId(ccTransactionId)
  }

  const handleModalClose = () => {
    setSelectedCCChargeId(null)
    setLinkingCCTransactionId(null)
    // Trigger refetch after modal closes (in case linking happened)
    handleRefetch()
  }

  // Get current tab index for keyboard navigation
  const currentTabIndex = tabs.findIndex((tab) => tab.id === activeTab)

  // Keyboard navigation for tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is interacting with form controls
      const activeEl = document.activeElement
      const isFormControl = activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        activeEl?.getAttribute('role') === 'slider'

      if (isFormControl) {
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const newIndex = (currentTabIndex + 1) % tabs.length
        setSearchParams({ tab: tabs[newIndex].id })
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const newIndex = (currentTabIndex - 1 + tabs.length) % tabs.length
        setSearchParams({ tab: tabs[newIndex].id })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [currentTabIndex, setSearchParams])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">Money Movements</h1>

      {/* Tab Navigation */}
      <div className="bg-surface rounded-lg p-6">
        <div className="flex justify-center mb-6">
          <div className="flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text hover:border-text-muted/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div key={refetchTrigger}>
          {activeTab === 'bank' && (
            <BankTab onRefetch={handleRefetch} />
          )}

          {activeTab === 'cc-charges' && (
            <CCChargesTab
              onCCChargeClick={handleCCChargeClick}
              onRefetch={handleRefetch}
            />
          )}

          {activeTab === 'cc-purchases' && (
            <CCPurchasesTab
              onBankChargeClick={handleCCChargeClick}
              onLinkCCTransaction={handleLinkCCTransaction}
              onRefetch={handleRefetch}
            />
          )}

          {activeTab === 'matching' && (
            <CCMatchingTab
              onOpenLinkModal={handleLinkCCTransaction}
              onRefetch={handleRefetch}
            />
          )}
        </div>
      </div>

      {/* CC Charge Details Modal */}
      <CCChargeModal
        isOpen={!!selectedCCChargeId}
        onClose={handleModalClose}
        bankTransactionId={selectedCCChargeId}
      />

      {/* Link CC Transaction Modal (from Matching tab or CC Purchases tab) */}
      <CCChargeModal
        isOpen={!!linkingCCTransactionId}
        onClose={handleModalClose}
        bankTransactionId={null}
        ccTransactionIdToLink={linkingCCTransactionId}
      />
    </div>
  )
}
