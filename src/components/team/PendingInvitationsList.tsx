import { useState } from 'react'
import {
  EnvelopeIcon,
  ClockIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useTeamInvitations, useRevokeInvitation, useResendInvitation } from '@/hooks/useTeamInvitations'
import { RoleBadge } from './RoleBadge'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import type { TeamInvitation } from '@/types/team'

export function PendingInvitationsList() {
  const { data: invitations, isLoading } = useTeamInvitations()
  const revokeInvitation = useRevokeInvitation()
  const resendInvitation = useResendInvitation()

  const [revokeConfirm, setRevokeConfirm] = useState<TeamInvitation | null>(null)

  if (isLoading) {
    return (
      <div className="h-12 bg-text-muted/10 rounded-lg animate-pulse" />
    )
  }

  if (!invitations || invitations.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-4">
        No pending invitations.
      </p>
    )
  }

  const handleRevoke = async () => {
    if (!revokeConfirm) return
    try {
      await revokeInvitation.mutateAsync(revokeConfirm.id)
      setRevokeConfirm(null)
    } catch (err) {
      console.error('Failed to revoke invitation:', err)
    }
  }

  const handleResend = async (invitationId: string) => {
    try {
      await resendInvitation.mutateAsync(invitationId)
    } catch (err) {
      console.error('Failed to resend invitation:', err)
    }
  }

  const formatExpiry = (expiresAt: string) => {
    const expiry = new Date(expiresAt)
    const now = new Date()
    const diffMs = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) return 'Expired'
    if (diffDays === 1) return 'Expires tomorrow'
    return `Expires in ${diffDays} days`
  }

  return (
    <>
      <div className="space-y-2">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-text-muted/10"
          >
            {/* Invitation info */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <EnvelopeIcon className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">
                  {invitation.email}
                </p>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <ClockIcon className="h-3 w-3" />
                  <span>{formatExpiry(invitation.expires_at)}</span>
                </div>
              </div>
            </div>

            {/* Role & Actions */}
            <div className="flex items-center gap-3">
              <RoleBadge role={invitation.role} />

              {/* Resend */}
              <button
                type="button"
                onClick={() => handleResend(invitation.id)}
                disabled={resendInvitation.isPending}
                className="p-2 text-text-muted hover:text-text transition-colors rounded-lg hover:bg-text-muted/10 disabled:opacity-50"
                title="Resend invitation"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>

              {/* Revoke */}
              <button
                type="button"
                onClick={() => setRevokeConfirm(invitation)}
                className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-red-500/10"
                title="Revoke invitation"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Revoke confirmation */}
      <ConfirmDialog
        isOpen={!!revokeConfirm}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeConfirm(null)}
        title="Revoke Invitation"
        message={`Are you sure you want to revoke the invitation for ${revokeConfirm?.email}? They will no longer be able to join the team with this link.`}
        confirmLabel={revokeInvitation.isPending ? 'Revoking...' : 'Revoke'}
        cancelLabel="Cancel"
        variant="danger"
      />
    </>
  )
}
