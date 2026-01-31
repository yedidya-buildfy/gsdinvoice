import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import {
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useInvitationByToken, useAcceptInvitation } from '@/hooks/useTeamInvitations'
import { getRoleLabel } from '@/lib/permissions'
import { cx } from '@/utils/cx'
import type { TeamRole } from '@/types/team'

// Extended invitation type with team info from join query
interface InvitationWithTeam {
  id: string
  team_id: string
  email: string
  role: Exclude<TeamRole, 'owner'>
  token: string
  invited_by: string | null
  expires_at: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  created_at: string
  team?: {
    id: string
    name: string
    avatar_url: string | null
  }
}

export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { data: invitation, isLoading, error } = useInvitationByToken(token || null)
  const acceptInvitation = useAcceptInvitation()
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // If not logged in, redirect to login with return URL
  useEffect(() => {
    if (!authLoading && !user && token) {
      navigate(`/login?redirect=/invite/${token}`)
    }
  }, [authLoading, user, token, navigate])

  const handleAccept = async () => {
    if (!token) return

    try {
      await acceptInvitation.mutateAsync(token)
      setAccepted(true)
      // Redirect to dashboard after a short delay
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept invitation')
    }
  }

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  // Error state
  if (error || acceptError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircleIcon className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Invalid Invitation</h1>
          <p className="text-text-muted mb-6">
            {acceptError || (error instanceof Error ? error.message : 'This invitation is invalid or has expired.')}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go to Dashboard
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  // Cast invitation data to our extended type
  const invitationData = invitation as InvitationWithTeam | null | undefined

  // Success state
  if (accepted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Welcome to the Team!</h1>
          <p className="text-text-muted mb-6">
            You have successfully joined{' '}
            <span className="text-text font-medium">
              {invitationData?.team?.name}
            </span>
            . Redirecting to dashboard...
          </p>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
        </div>
      </div>
    )
  }

  // Invitation preview
  if (!invitationData) {
    return null
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-xl p-8">
        {/* Team info */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            {invitationData.team?.avatar_url ? (
              <img
                src={invitationData.team.avatar_url}
                alt=""
                className="w-20 h-20 rounded-xl object-cover"
              />
            ) : (
              <UserGroupIcon className="w-10 h-10 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">
            Join {invitationData.team?.name}
          </h1>
          <p className="text-text-muted">
            You've been invited to join this team as a{' '}
            <span className="text-text font-medium">{getRoleLabel(invitationData.role)}</span>
          </p>
        </div>

        {/* User info */}
        <div className="bg-background/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-text-muted mb-1">Joining as</p>
          <p className="text-text font-medium">{user?.email}</p>
          {invitationData.email.toLowerCase() !== user?.email?.toLowerCase() && (
            <p className="text-xs text-amber-500 mt-2">
              Note: This invitation was sent to {invitationData.email}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleAccept}
            disabled={acceptInvitation.isPending}
            className={cx(
              'w-full px-6 py-3 rounded-lg font-medium transition-colors',
              'bg-primary text-white hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {acceptInvitation.isPending ? 'Joining...' : 'Accept Invitation'}
          </button>
          <Link
            to="/"
            className="block w-full px-6 py-3 text-center text-text-muted hover:text-text transition-colors"
          >
            Decline
          </Link>
        </div>
      </div>
    </div>
  )
}
