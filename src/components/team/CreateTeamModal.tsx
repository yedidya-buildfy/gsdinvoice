import { useState } from 'react'
import { XMarkIcon, UserGroupIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { useCreateTeam } from '@/hooks/useTeamManagement'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cx } from '@/utils/cx'

interface CreateTeamModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateTeamModal({ isOpen, onClose }: CreateTeamModalProps) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createTeam = useCreateTeam()

  // Check if user can create more businesses based on their plan
  const { data: canCreate, isLoading: isCheckingLimit } = useQuery({
    queryKey: ['can-create-business', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_create_business')
      if (error) {
        console.error('Error checking business limit:', error)
        return true // Allow creation on error to avoid blocking
      }
      return data as boolean
    },
    enabled: isOpen && !!user,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Business name is required')
      return
    }

    try {
      await createTeam.mutateAsync({ name: name.trim() })
      setName('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create business')
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
              <h2 className="text-lg font-semibold text-text">Create Business</h2>
              <p className="text-sm text-text-muted">Add a new business to manage</p>
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

        {/* Limit reached warning */}
        {!isCheckingLimit && canCreate === false && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-500">Business limit reached</p>
                <p className="text-sm text-text-muted mt-1">
                  You've reached the maximum number of businesses for your plan.
                  Upgrade your subscription to create more businesses.
                </p>
                <a
                  href="/settings?tab=billing"
                  className="inline-block mt-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  View upgrade options
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="business-name" className="block text-sm font-medium text-text mb-2">
              Business Name
            </label>
            <input
              id="business-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Acme Corp"
              className="w-full px-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
              disabled={canCreate === false}
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
              disabled={createTeam.isPending || !name.trim() || canCreate === false}
              className={cx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                'bg-primary text-white hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createTeam.isPending ? 'Creating...' : 'Create Business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
