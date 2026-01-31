import { useState, useMemo } from 'react'
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
} from '@heroicons/react/24/outline'
import { useVendorAliases } from '@/hooks/useVendorAliases'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { Badge } from '@/components/ui/base/badges/badges'
import { LoadingIndicator } from '@/components/ui/application/loading-indicator/loading-indicator'
import type { VendorAlias } from '@/types/database'
import { VendorAliasModal } from './VendorAliasModal'

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

  // Local state
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAlias, setEditingAlias] = useState<VendorAlias | null>(null)
  const [deleteConfirmAlias, setDeleteConfirmAlias] = useState<VendorAlias | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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

          {/* Search - only show if there are aliases */}
          {aliases.length > 0 && (
            <div className="mt-4 relative max-w-md">
              <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                type="text"
                placeholder="Search by pattern or vendor name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-10 pe-4 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface/50"
                >
                  <XMarkIcon className="w-4 h-4 text-text-muted hover:text-text" />
                </button>
              )}
            </div>
          )}
        </div>

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
          // Table
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background/30">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">
                    Transaction Pattern
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-text-muted uppercase tracking-wider">
                    Maps To
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                    Match Type
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-end text-xs font-medium text-text-muted uppercase tracking-wider w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-muted/10">
                {filteredAliases.map((alias) => {
                  const sourceConfig = SOURCE_CONFIG[alias.source]
                  const SourceIcon = sourceConfig.icon

                  return (
                    <tr
                      key={alias.id}
                      className="hover:bg-background/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <code className="px-2 py-1 bg-background/50 rounded text-sm font-mono text-text">
                          {alias.alias_pattern}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-text">
                          {alias.canonical_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge
                          type="badge-color"
                          size="sm"
                          color={MATCH_TYPE_COLORS[alias.match_type]}
                        >
                          {MATCH_TYPE_LABELS[alias.match_type]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge
                          type="badge-color"
                          size="sm"
                          color={sourceConfig.color}
                        >
                          <span className="flex items-center gap-1">
                            <SourceIcon className="w-3 h-3" />
                            {sourceConfig.label}
                          </span>
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
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
          <div className="px-6 py-3 border-t border-text-muted/10 bg-background/20">
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
    </div>
  )
}
