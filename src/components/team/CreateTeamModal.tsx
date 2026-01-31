import { useState } from 'react'
import { XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { useCreateTeam } from '@/hooks/useTeamManagement'
import { cx } from '@/utils/cx'

interface CreateTeamModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateTeamModal({ isOpen, onClose }: CreateTeamModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createTeam = useCreateTeam()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Team name is required')
      return
    }

    try {
      await createTeam.mutateAsync({ name: name.trim() })
      setName('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team')
    }
  }

  const handleClose = () => {
    setName('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <UserGroupIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Create Team</h2>
              <p className="text-sm text-text-muted">Start collaborating with others</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="team-name" className="block text-sm font-medium text-text mb-2">
              Team Name
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Acme Corp"
              className="w-full px-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTeam.isPending || !name.trim()}
              className={cx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                'bg-primary text-white hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createTeam.isPending ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
