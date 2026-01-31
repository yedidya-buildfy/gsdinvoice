import { useState } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Heading as AriaHeading,
} from 'react-aria-components'
import { XMarkIcon, TagIcon } from '@heroicons/react/24/outline'
import { cx } from '@/utils/cx'
import type { VendorAlias } from '@/types/database'

/**
 * Match type options for the dropdown
 */
const MATCH_TYPE_OPTIONS: { value: VendorAlias['match_type']; label: string; description: string }[] = [
  { value: 'exact', label: 'Exact Match', description: 'Pattern must match exactly' },
  { value: 'contains', label: 'Contains', description: 'Transaction contains this pattern' },
  { value: 'starts_with', label: 'Starts With', description: 'Transaction starts with pattern' },
  { value: 'ends_with', label: 'Ends With', description: 'Transaction ends with pattern' },
]

interface VendorAliasModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    alias_pattern: string
    canonical_name: string
    match_type: VendorAlias['match_type']
    priority?: number
  }) => Promise<void>
  editingAlias?: VendorAlias | null
}

/**
 * Internal form component that resets when key changes
 */
function VendorAliasForm({
  editingAlias,
  onSave,
  onClose,
  isSaving,
  setIsSaving,
}: {
  editingAlias?: VendorAlias | null
  onSave: VendorAliasModalProps['onSave']
  onClose: () => void
  isSaving: boolean
  setIsSaving: (value: boolean) => void
}) {
  // Initialize form state from editingAlias
  const [aliasPattern, setAliasPattern] = useState(editingAlias?.alias_pattern ?? '')
  const [canonicalName, setCanonicalName] = useState(editingAlias?.canonical_name ?? '')
  const [matchType, setMatchType] = useState<VendorAlias['match_type']>(editingAlias?.match_type ?? 'contains')
  const [priority, setPriority] = useState(editingAlias?.priority ?? 0)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!editingAlias

  // Validate form
  const validateForm = (): boolean => {
    if (!aliasPattern.trim()) {
      setError('Pattern is required')
      return false
    }
    if (!canonicalName.trim()) {
      setError('Vendor name is required')
      return false
    }
    return true
  }

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSaving(true)
    setError(null)

    try {
      await onSave({
        alias_pattern: aliasPattern.trim(),
        canonical_name: canonicalName.trim(),
        match_type: matchType,
        priority,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alias')
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Pattern input */}
      <div>
        <label htmlFor="alias-pattern" className="block text-sm font-medium text-text mb-1.5">
          Transaction Pattern
        </label>
        <input
          id="alias-pattern"
          type="text"
          value={aliasPattern}
          onChange={(e) => setAliasPattern(e.target.value)}
          placeholder="e.g., FACEBK, GOOG*, AMZN"
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-mono text-sm"
          disabled={isSaving}
        />
        <p className="text-xs text-text-muted mt-1">
          The pattern that appears in your bank/CC statements
        </p>
      </div>

      {/* Canonical name input */}
      <div>
        <label htmlFor="canonical-name" className="block text-sm font-medium text-text mb-1.5">
          Vendor Name
        </label>
        <input
          id="canonical-name"
          type="text"
          value={canonicalName}
          onChange={(e) => setCanonicalName(e.target.value)}
          placeholder="e.g., Meta Platforms, Google, Amazon"
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          disabled={isSaving}
        />
        <p className="text-xs text-text-muted mt-1">
          The vendor name as it appears on your invoices
        </p>
      </div>

      {/* Match type select */}
      <div>
        <label htmlFor="match-type" className="block text-sm font-medium text-text mb-1.5">
          Match Type
        </label>
        <select
          id="match-type"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as VendorAlias['match_type'])}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          disabled={isSaving}
        >
          {MATCH_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted mt-1">
          How the pattern should match transaction descriptions
        </p>
      </div>

      {/* Priority input */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-text mb-1.5">
          Priority
        </label>
        <input
          id="priority"
          type="number"
          value={priority}
          onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
          min={0}
          max={100}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          disabled={isSaving}
        />
        <p className="text-xs text-text-muted mt-1">
          Higher priority aliases are checked first (0-100)
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="flex-1 px-4 py-2 text-sm font-medium text-text-muted bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              Saving...
            </>
          ) : (
            isEditing ? 'Update Alias' : 'Add Alias'
          )}
        </button>
      </div>
    </form>
  )
}

/**
 * VendorAliasModal - Modal for creating or editing vendor aliases
 */
export function VendorAliasModal({
  isOpen,
  onClose,
  onSave,
  editingAlias,
}: VendorAliasModalProps) {
  const [isSaving, setIsSaving] = useState(false)

  // Handle close
  const handleClose = () => {
    if (!isSaving) {
      onClose()
    }
  }

  if (!isOpen) return null

  const isEditing = !!editingAlias
  // Use a key to reset the form when editingAlias changes
  const formKey = editingAlias?.id ?? 'new'

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      className={(state) =>
        cx(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
          state.isEntering && 'duration-200 ease-out animate-in fade-in',
          state.isExiting && 'duration-150 ease-in animate-out fade-out'
        )
      }
    >
      <AriaModal
        className={(state) =>
          cx(
            'w-full max-w-lg mx-4',
            state.isEntering && 'duration-200 ease-out animate-in zoom-in-95',
            state.isExiting && 'duration-150 ease-in animate-out zoom-out-95'
          )
        }
      >
        <AriaDialog className="rounded-xl bg-surface p-6 shadow-xl ring-1 ring-white/10 outline-none">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TagIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <AriaHeading slot="title" className="text-lg font-semibold text-text">
                  {isEditing ? 'Edit Vendor Alias' : 'Add Vendor Alias'}
                </AriaHeading>
                <p className="text-sm text-text-muted mt-0.5">
                  {isEditing
                    ? 'Update the pattern matching settings'
                    : 'Create a new pattern to map transactions to vendors'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="p-2 text-text-muted hover:text-text hover:bg-background/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form - key resets state when switching between add/edit modes */}
          <VendorAliasForm
            key={formKey}
            editingAlias={editingAlias}
            onSave={onSave}
            onClose={handleClose}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
          />
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  )
}
