import { useState, useEffect, useCallback } from 'react'
import {
  ClockIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { cx } from '@/utils/cx'

interface VatChangeModalProps {
  isOpen: boolean
  onClose: () => void
  selectedCount: number
  merchantNames: string[]
  onApplyToSelected: (hasVat: boolean, vatPercentage: number) => void
  onApplyToAllPast: (hasVat: boolean, vatPercentage: number) => void
  onApplyToAllMerchant: (hasVat: boolean, vatPercentage: number) => void
  onApplyToFuture: (hasVat: boolean, vatPercentage: number) => void
  isLoading?: boolean
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
  selected?: boolean
}

function ActionButton({ icon: Icon, label, description, onClick, disabled, selected }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex items-start gap-3 w-full p-3 rounded-lg text-start transition-colors',
        selected
          ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20'
          : 'bg-background/50 hover:bg-background border border-text-muted/20',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
      <div>
        <div className={cx('text-sm font-medium', selected ? 'text-primary' : 'text-text')}>{label}</div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
    </button>
  )
}

export function VatChangeModal({
  isOpen,
  onClose,
  selectedCount,
  merchantNames,
  onApplyToSelected,
  onApplyToAllPast,
  onApplyToAllMerchant,
  onApplyToFuture,
  isLoading,
}: VatChangeModalProps) {
  const [hasVat, setHasVat] = useState(true)
  const [vatPercentage, setVatPercentage] = useState(18)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const uniqueMerchants = [...new Set(merchantNames)]
  const merchantsDisplay = uniqueMerchants.length <= 3
    ? uniqueMerchants.join(', ')
    : `${uniqueMerchants.slice(0, 2).join(', ')} +${uniqueMerchants.length - 2} more`

  const handleClose = () => {
    setSelectedIndex(0)
    onClose()
  }

  // Execute action based on selected index
  const executeSelectedAction = useCallback(() => {
    switch (selectedIndex) {
      case 0:
        onApplyToAllMerchant(hasVat, vatPercentage)
        break
      case 1:
        onApplyToAllPast(hasVat, vatPercentage)
        break
      case 2:
        onApplyToSelected(hasVat, vatPercentage)
        break
      case 3:
        onApplyToFuture(hasVat, vatPercentage)
        break
    }
  }, [selectedIndex, hasVat, vatPercentage, onApplyToAllMerchant, onApplyToAllPast, onApplyToSelected, onApplyToFuture])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % 4)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + 4) % 4)
          break
        case 'Enter':
          e.preventDefault()
          if (!isLoading) {
            executeSelectedAction()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, executeSelectedAction])

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content>
        <div className="flex items-start justify-between mb-4">
          <Modal.Title>Set VAT for {selectedCount} transactions</Modal.Title>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* VAT Settings */}
        <div className="mb-6 space-y-4">
          {/* VAT Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted w-20">VAT:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHasVat(true)}
                className={cx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                  hasVat
                    ? 'bg-primary text-white'
                    : 'bg-background border border-text-muted/30 text-text-muted hover:text-text'
                )}
              >
                {hasVat && <CheckIcon className="w-4 h-4" />}
                Yes
              </button>
              <button
                type="button"
                onClick={() => setHasVat(false)}
                className={cx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                  !hasVat
                    ? 'bg-primary text-white'
                    : 'bg-background border border-text-muted/30 text-text-muted hover:text-text'
                )}
              >
                {!hasVat && <CheckIcon className="w-4 h-4" />}
                No
              </button>
            </div>
          </div>

          {/* VAT Percentage */}
          {hasVat && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-muted w-20">VAT %:</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={vatPercentage}
                onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)}
                className="w-20 bg-background border border-text-muted/30 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
        </div>

        {/* Merchants info */}
        <p className="text-xs text-text-muted mb-4" dir="auto">
          Merchants: {merchantsDisplay}
        </p>

        <Modal.Actions>
          <ActionButton
            icon={DocumentDuplicateIcon}
            label="All transactions with same merchant"
            description="Update all past + save for future imports (recommended)"
            onClick={() => onApplyToAllMerchant(hasVat, vatPercentage)}
            disabled={isLoading}
            selected={selectedIndex === 0}
          />

          <ActionButton
            icon={ClockIcon}
            label="All past from these merchants"
            description={`Update all existing transactions from ${uniqueMerchants.length} merchant${uniqueMerchants.length > 1 ? 's' : ''}`}
            onClick={() => onApplyToAllPast(hasVat, vatPercentage)}
            disabled={isLoading}
            selected={selectedIndex === 1}
          />

          <ActionButton
            icon={CheckIcon}
            label={`Selected transactions only (${selectedCount})`}
            description="Apply only to the selected transactions"
            onClick={() => onApplyToSelected(hasVat, vatPercentage)}
            disabled={isLoading}
            selected={selectedIndex === 2}
          />

          <ActionButton
            icon={ArrowPathIcon}
            label="Only future transactions"
            description="Save preferences for future imports only"
            onClick={() => onApplyToFuture(hasVat, vatPercentage)}
            disabled={isLoading}
            selected={selectedIndex === 3}
          />
        </Modal.Actions>
      </Modal.Content>
    </Modal.Overlay>
  )
}
