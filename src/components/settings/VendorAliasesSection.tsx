import { useState, useMemo, useCallback } from 'react'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  TagIcon,
  SparklesIcon,
  UserIcon,
  CpuChipIcon,
  XMarkIcon,
  QuestionMarkCircleIcon,
  CreditCardIcon,
  BuildingOfficeIcon,
  LinkIcon,
  DocumentDuplicateIcon,
  AdjustmentsHorizontalIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline'
import { useVendorAliases } from '@/hooks/useVendorAliases'
import { useVendorResolverSettings } from '@/hooks/useVendorResolverSettings'
import { Tooltip, TooltipTrigger } from '@/components/ui/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { Badge } from '@/components/ui/base/badges/badges'
import { LoadingIndicator } from '@/components/ui/application/loading-indicator/loading-indicator'
import type { VendorAlias } from '@/types/database'
import { VendorAliasModal } from './VendorAliasModal'
import { getVendorInfo } from '@/lib/utils/vendorResolver'

// Checkbox styling: dark background with green border (uses custom CSS class)
const checkboxClass = 'checkbox-dark'

/**
 * Match type display labels
 */
const MATCH_TYPE_LABELS: Record<VendorAlias['match_type'], string> = {
  exact: 'Exact',
  contains: 'Contains',
  starts_with: 'Starts With',
  ends_with: 'Ends With',
}

/**
 * Match type badge colors
 */
const MATCH_TYPE_COLORS: Record<VendorAlias['match_type'], 'gray' | 'blue' | 'purple' | 'indigo'> = {
  exact: 'gray',
  contains: 'blue',
  starts_with: 'purple',
  ends_with: 'indigo',
}

/**
 * Source display labels and colors
 */
const SOURCE_CONFIG: Record<VendorAlias['source'], { label: string; color: 'gray' | 'brand' | 'success'; icon: typeof UserIcon }> = {
  system: { label: 'System', color: 'gray', icon: CpuChipIcon },
  user: { label: 'Custom', color: 'brand', icon: UserIcon },
  learned: { label: 'Learned', color: 'success', icon: SparklesIcon },
}

interface VendorAliasesSectionProps {
  className?: string
}

/**
 * VendorAliasesSection - Settings section for managing vendor aliases
 *
 * Displays a table of vendor aliases with search, add, edit, and delete functionality.
 * Includes empty state with seed defaults button.
 */
/**
 * Help text for each vendor resolution setting
 */
const RESOLUTION_HELP = {
  creditCardTable: {
    title: 'CC Purchases Table',
    description: 'Applies vendor resolution to the Credit Card Purchases table in Money Movements. Transaction descriptions like "FACEBK *ADS" will display as "Meta (Facebook)".',
  },
  transactionTable: {
    title: 'Bank Transactions Table',
    description: 'Applies vendor resolution to the Bank Transactions table. Bank statement descriptions will be converted to clean vendor names.',
  },
  invoiceLinkModal: {
    title: 'Invoice Link Modal',
    description: 'Applies vendor resolution when linking invoice line items to bank charges. Makes it easier to identify the correct transaction.',
  },
  lineItemModal: {
    title: 'Line Item Modal',
    description: 'Applies vendor resolution in the individual line item linking modal. Shows clean vendor names instead of raw transaction descriptions.',
  },
}

export function VendorAliasesSection({ className }: VendorAliasesSectionProps) {
  const {
    aliases,
    isLoading,
    error,
    createAlias,
    updateAlias,
    deleteAlias,
    seedDefaults,
  } = useVendorAliases()

  const {
    enableInCreditCardTable,
    enableInTransactionTable,
    enableInInvoiceLinkModal,
    enableInLineItemModal,
    updateSetting,
  } = useVendorResolverSettings()

  // Local state
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAlias, setEditingAlias] = useState<VendorAlias | null>(null)
  const [deleteConfirmAlias, setDeleteConfirmAlias] = useState<VendorAlias | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [testPatternInput, setTestPatternInput] = useState('')

  // Compute test pattern result based on input
  const testPatternResult = useMemo(() => {
    if (!testPatternInput.trim()) {
      return null
    }
    return getVendorInfo(testPatternInput, aliases)
  }, [testPatternInput, aliases])

  // Filter aliases based on search query
  const filteredAliases = useMemo(() => {
    if (!searchQuery.trim()) {
      return aliases
    }
    const query = searchQuery.toLowerCase()
    return aliases.filter(
      (alias) =>
        alias.alias_pattern.toLowerCase().includes(query) ||
        alias.canonical_name.toLowerCase().includes(query)
    )
  }, [aliases, searchQuery])

  // Selection state derived from filtered aliases
  const allSelected = filteredAliases.length > 0 && filteredAliases.every(a => selectedIds.has(a.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  // Clear selection when search changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    setSelectedIds(new Set())
  }, [])

  // Select all / deselect all
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAliases.map(a => a.id)))
    }
  }, [allSelected, filteredAliases])

  // Toggle single selection
  const handleSelectOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    try {
      // Delete all selected aliases
      await Promise.all(Array.from(selectedIds).map(id => deleteAlias(id)))
      setSelectedIds(new Set())
    } finally {
      setIsDeleting(false)
      setShowBulkDeleteConfirm(false)
    }
  }

  // Handle opening modal for new alias
  const handleAddAlias = () => {
    setEditingAlias(null)
    setIsModalOpen(true)
  }

  // Handle opening modal for editing
  const handleEditAlias = (alias: VendorAlias) => {
    setEditingAlias(alias)
    setIsModalOpen(true)
  }

  // Handle modal close
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingAlias(null)
  }

  // Handle modal save
  const handleModalSave = async (data: {
    alias_pattern: string
    canonical_name: string
    match_type: VendorAlias['match_type']
    priority?: number
    default_has_vat?: boolean | null
    default_vat_percentage?: number | null
  }) => {
    if (editingAlias) {
      await updateAlias(editingAlias.id, data)
    } else {
      await createAlias({
        ...data,
        source: 'user',
      })
    }
    handleModalClose()
  }

  // Handle delete confirmation
  const handleDeleteClick = (alias: VendorAlias) => {
    setDeleteConfirmAlias(alias)
  }

  // Handle confirmed delete
  const handleConfirmDelete = async () => {
    if (!deleteConfirmAlias) return

    setIsDeleting(true)
    try {
      await deleteAlias(deleteConfirmAlias.id)
    } finally {
      setIsDeleting(false)
      setDeleteConfirmAlias(null)
    }
  }

  // Handle seed defaults
  const handleSeedDefaults = async () => {
    setIsSeeding(true)
    try {
      await seedDefaults()
    } finally {
      setIsSeeding(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        <div className="bg-surface border border-text-muted/10 rounded-xl p-6">
          <div className="flex items-center justify-center py-12">
            <LoadingIndicator type="spinner" size="md" label="Loading aliases..." />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <div className="bg-surface border border-text-muted/10 rounded-xl p-6">
          <div className="text-center py-12">
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="bg-surface border border-text-muted/10 rounded-xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-text-muted/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TagIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">Vendor Aliases</h3>
                <p className="text-sm text-text-muted mt-0.5">
                  Map transaction descriptions to vendor names for better matching
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddAlias}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              Add Alias
            </button>
          </div>

          {/* Apply Aliases Section */}
          <div className="mt-5 pt-5 border-t border-text-muted/10">
            <div className="flex items-center gap-2 mb-4">
              <AdjustmentsHorizontalIcon className="w-4 h-4 text-text-muted" />
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Apply Aliases</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* CC Purchases Table */}
              <div className="flex items-center justify-between p-4 bg-background/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500/10 rounded-lg">
                    <CreditCardIcon className="w-5 h-5 text-teal-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">CC Purchases Table</span>
                    <Tooltip
                      title={RESOLUTION_HELP.creditCardTable.title}
                      description={RESOLUTION_HELP.creditCardTable.description}
                      placement="top"
                    >
                      <TooltipTrigger>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-text-muted/20 hover:bg-text-muted/30 transition-colors cursor-help">
                          <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-text-muted" />
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableInCreditCardTable}
                  onClick={() => updateSetting('enableInCreditCardTable', !enableInCreditCardTable)}
                  className={cx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    enableInCreditCardTable ? 'bg-primary' : 'bg-text-muted/30'
                  )}
                >
                  <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', enableInCreditCardTable ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>

              {/* Bank Transactions Table */}
              <div className="flex items-center justify-between p-4 bg-background/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <BuildingOfficeIcon className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">Bank Transactions</span>
                    <Tooltip
                      title={RESOLUTION_HELP.transactionTable.title}
                      description={RESOLUTION_HELP.transactionTable.description}
                      placement="top"
                    >
                      <TooltipTrigger>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-text-muted/20 hover:bg-text-muted/30 transition-colors cursor-help">
                          <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-text-muted" />
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableInTransactionTable}
                  onClick={() => updateSetting('enableInTransactionTable', !enableInTransactionTable)}
                  className={cx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    enableInTransactionTable ? 'bg-primary' : 'bg-text-muted/30'
                  )}
                >
                  <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', enableInTransactionTable ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>

              {/* Invoice Link Modal */}
              <div className="flex items-center justify-between p-4 bg-background/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <LinkIcon className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">Invoice Link Modal</span>
                    <Tooltip
                      title={RESOLUTION_HELP.invoiceLinkModal.title}
                      description={RESOLUTION_HELP.invoiceLinkModal.description}
                      placement="top"
                    >
                      <TooltipTrigger>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-text-muted/20 hover:bg-text-muted/30 transition-colors cursor-help">
                          <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-text-muted" />
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableInInvoiceLinkModal}
                  onClick={() => updateSetting('enableInInvoiceLinkModal', !enableInInvoiceLinkModal)}
                  className={cx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    enableInInvoiceLinkModal ? 'bg-primary' : 'bg-text-muted/30'
                  )}
                >
                  <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', enableInInvoiceLinkModal ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>

              {/* Line Item Modal */}
              <div className="flex items-center justify-between p-4 bg-background/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <DocumentDuplicateIcon className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">Line Item Modal</span>
                    <Tooltip
                      title={RESOLUTION_HELP.lineItemModal.title}
                      description={RESOLUTION_HELP.lineItemModal.description}
                      placement="top"
                    >
                      <TooltipTrigger>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-text-muted/20 hover:bg-text-muted/30 transition-colors cursor-help">
                          <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-text-muted" />
                        </span>
                      </TooltipTrigger>
                    </Tooltip>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableInLineItemModal}
                  onClick={() => updateSetting('enableInLineItemModal', !enableInLineItemModal)}
                  className={cx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    enableInLineItemModal ? 'bg-primary' : 'bg-text-muted/30'
                  )}
                >
                  <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', enableInLineItemModal ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>
            </div>
          </div>

          {/* Test Pattern Section */}
          <div className="mt-5 pt-5 border-t border-text-muted/10">
            <div className="flex items-center gap-2 mb-4">
              <BeakerIcon className="w-4 h-4 text-text-muted" />
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Test Pattern</span>
            </div>

            <div className="space-y-3">
              {/* Test input */}
              <div className="relative max-w-xl">
                <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Enter a transaction description to test..."
                  value={testPatternInput}
                  onChange={(e) => setTestPatternInput(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 bg-background/50 border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                {testPatternInput && (
                  <button
                    type="button"
                    onClick={() => setTestPatternInput('')}
                    className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface/50"
                  >
                    <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
                  </button>
                )}
              </div>

              {/* Test result */}
              {testPatternResult && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-background/30 rounded-lg max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Result:</span>
                    <span className="text-sm font-medium text-text">{testPatternResult.displayName}</span>
                  </div>

                  <Badge
                    type="color"
                    size="sm"
                    color={testPatternResult.isResolved ? 'success' : 'gray'}
                  >
                    {testPatternResult.isResolved ? 'Matched' : 'No Match'}
                  </Badge>

                  {testPatternResult.isResolved && testPatternResult.matchedAlias && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Pattern:</span>
                        <code className="px-1.5 py-0.5 bg-surface/50 rounded text-xs font-mono text-text">
                          {testPatternResult.matchedAlias.alias_pattern}
                        </code>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">VAT:</span>
                        {testPatternResult.vatDefault.hasVat === null ? (
                          <span className="text-xs text-text-muted">-</span>
                        ) : testPatternResult.vatDefault.hasVat ? (
                          <Badge type="color" size="sm" color="success">
                            {testPatternResult.vatDefault.vatPercentage}%
                          </Badge>
                        ) : (
                          <Badge type="color" size="sm" color="gray">
                            No VAT
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search - only show if there are aliases */}
          {aliases.length > 0 && (
            <div className="mt-4 relative max-w-md">
              <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                type="text"
                placeholder="Search by pattern or vendor name..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full ps-10 pe-4 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface/50"
                >
                  <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="px-6 py-3 border-b border-text-muted/10 bg-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">
                {selectedIds.size} alias{selectedIds.size === 1 ? '' : 'es'} selected
              </span>
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <TrashIcon className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {aliases.length === 0 ? (
          // Empty state
          <div className="px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-text-muted/10 mb-4">
              <TagIcon className="w-6 h-6 text-text-muted" />
            </div>
            <h4 className="text-lg font-medium text-text mb-2">No vendor aliases yet</h4>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
              Vendor aliases help map transaction descriptions to recognizable vendor names.
              Start with common defaults or add your own.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSeedDefaults}
                disabled={isSeeding}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSeeding ? (
                  <>
                    <LoadingIndicator type="spinner" size="sm" />
                    Seeding...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Seed Defaults
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleAddAlias}
                className="flex items-center gap-2 px-4 py-2 border border-text-muted/20 text-text rounded-lg hover:bg-background/50 transition-colors text-sm font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Add Custom
              </button>
            </div>
          </div>
        ) : filteredAliases.length === 0 ? (
          // No results state
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-muted">
              No aliases found matching &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          // Table - index table style (matching money-movements tables)
          <div className="overflow-hidden rounded-lg border border-text-muted/20 mx-6 mb-6">
            <table className="w-full">
              <thead className="bg-surface/50">
                <tr>
                  <th className="px-4 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      onChange={handleSelectAll}
                      className={checkboxClass}
                    />
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">
                    Pattern
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">
                    Maps To
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-28">
                    Match Type
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                    Source
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                    VAT
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-muted/10">
                {filteredAliases.map((alias) => {
                  const sourceConfig = SOURCE_CONFIG[alias.source]
                  const SourceIcon = sourceConfig.icon
                  const isSelected = selectedIds.has(alias.id)

                  return (
                    <tr
                      key={alias.id}
                      onClick={() => handleSelectOne(alias.id)}
                      className={`hover:bg-surface/30 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(alias.id)}
                          className={checkboxClass}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <code className="px-2 py-1 bg-background/50 rounded text-sm font-mono text-text">
                          {alias.alias_pattern}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text">
                          {alias.canonical_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          type="color"
                          size="sm"
                          color={MATCH_TYPE_COLORS[alias.match_type]}
                        >
                          {MATCH_TYPE_LABELS[alias.match_type]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          type="color"
                          size="sm"
                          color={sourceConfig.color}
                        >
                          <span className="flex items-center gap-1">
                            <SourceIcon className="w-3 h-3" />
                            {sourceConfig.label}
                          </span>
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alias.default_has_vat === null ? (
                          <span className="text-xs text-text-muted">-</span>
                        ) : alias.default_has_vat ? (
                          <Badge type="color" size="sm" color="success">
                            {alias.default_vat_percentage}%
                          </Badge>
                        ) : (
                          <Badge type="color" size="sm" color="gray">
                            No VAT
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditAlias(alias)}
                            className="p-2 text-text-muted hover:text-text hover:bg-background/50 rounded-lg transition-colors"
                            title="Edit alias"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(alias)}
                            className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete alias"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with count */}
        {aliases.length > 0 && (
          <div className="px-6 py-3 bg-background/20">
            <p className="text-xs text-text-muted">
              {filteredAliases.length === aliases.length
                ? `${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`
                : `${filteredAliases.length} of ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <VendorAliasModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        editingAlias={editingAlias}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirmAlias}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmAlias(null)}
        title="Delete Vendor Alias"
        message={`Are you sure you want to delete the alias "${deleteConfirmAlias?.alias_pattern}"? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        title="Delete Multiple Aliases"
        message={`Are you sure you want to delete ${selectedIds.size} alias${selectedIds.size === 1 ? '' : 'es'}? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}
