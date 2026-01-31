import { useState } from 'react'
import { XMarkIcon, EnvelopeIcon, UserPlusIcon, ClipboardDocumentIcon, CheckIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { useInviteMember } from '@/hooks/useTeamInvitations'
import { useTeam } from '@/contexts/TeamContext'
import { getInvitableRoles, getRoleLabel, getRoleDescription } from '@/lib/permissions'
import { cx } from '@/utils/cx'
import type { TeamRole, TeamInvitation } from '@/types/team'

interface InviteDataWithEmail extends TeamInvitation {
  emailSent?: boolean
}

interface InviteMemberModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InviteMemberModal({ isOpen, onClose }: InviteMemberModalProps) {
  const { currentTeam } = useTeam()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<TeamRole, 'owner'>>('member')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [inviteData, setInviteData] = useState<InviteDataWithEmail | null>(null)
  const [copied, setCopied] = useState(false)
  const [invitedEmail, setInvitedEmail] = useState('')
  const inviteMember = useInviteMember()

  const roles = getInvitableRoles()

  const getInviteUrl = (token: string) => {
    return `${window.location.origin}/invite/${token}`
  }

  const handleCopyLink = async () => {
    if (!inviteData?.token) return

    try {
      await navigator.clipboard.writeText(getInviteUrl(inviteData.token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy link to clipboard')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setInviteData(null)
    setCopied(false)

    if (!email.trim()) {
      setError('Email is required')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    try {
      const trimmedEmail = email.trim().toLowerCase()
      const data = await inviteMember.mutateAsync({ email: trimmedEmail, role })
      setSuccess(true)
      setInviteData(data)
      setInvitedEmail(trimmedEmail)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    }
  }

  const handleClose = () => {
    setEmail('')
    setRole('member')
    setError(null)
    setSuccess(false)
    setInviteData(null)
    setCopied(false)
    setInvitedEmail('')
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
              <UserPlusIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Invite Member</h2>
              <p className="text-sm text-text-muted">
                Invite someone to {currentTeam?.name}
              </p>
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

        {/* Success message with copy link */}
        {success && inviteData && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 shrink-0">
                <CheckIcon className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-400">
                  Invitation created successfully!
                </p>
                {inviteData.emailSent ? (
                  <p className="text-sm text-green-400/80 mt-1 flex items-center gap-1.5">
                    <PaperAirplaneIcon className="h-3.5 w-3.5" />
                    We've sent an email to <span className="font-medium">{invitedEmail}</span>
                  </p>
                ) : (
                  <p className="text-sm text-text-muted mt-1">
                    Share the link below to invite them:
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs text-text-muted mb-2">
                {inviteData.emailSent ? 'Or share this link directly:' : 'Invitation link:'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getInviteUrl(inviteData.token)}
                  className="flex-1 px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm font-mono truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={cx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    copied
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  )}
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 w-full px-4 py-2 text-sm font-medium rounded-lg bg-surface hover:bg-surface/80 text-text transition-colors border border-text-muted/20"
            >
              Done
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="mb-4">
            <label htmlFor="invite-email" className="block text-sm font-medium text-text mb-2">
              Email Address
            </label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full pl-10 pr-3 py-2 bg-background border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
          </div>

          {/* Role */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-text mb-2">
              Role
            </label>
            <div className="space-y-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cx(
                    'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                    role === r
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-background/50 border border-text-muted/20 hover:bg-background'
                  )}
                >
                  <div
                    className={cx(
                      'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                      role === r ? 'border-primary' : 'border-text-muted/50'
                    )}
                  >
                    {role === r && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <div className={cx('text-sm font-medium', role === r ? 'text-primary' : 'text-text')}>
                      {getRoleLabel(r)}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {getRoleDescription(r)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

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
              disabled={inviteMember.isPending || !email.trim() || success}
              className={cx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                'bg-primary text-white hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {inviteMember.isPending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>

        {/* Info text */}
        <p className="mt-4 text-xs text-text-muted text-center">
          The invitation link will expire in 7 days.
        </p>
      </div>
    </div>
  )
}
