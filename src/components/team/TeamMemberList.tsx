import { useState } from 'react'
import {
  UserIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useTeamMembers, useUpdateMemberRole, useRemoveMember } from '@/hooks/useTeamMembers'
import { useTeam } from '@/contexts/TeamContext'
import { useAuth } from '@/contexts/AuthContext'
import { RoleBadge } from './RoleBadge'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { canRemoveMember, canChangeRole, getInvitableRoles, getRoleLabel } from '@/lib/permissions'
import type { TeamRole, TeamMemberWithProfile } from '@/types/team'

export function TeamMemberList() {
  const { currentTeam } = useTeam()
  const { user } = useAuth()
  const { data: members, isLoading } = useTeamMembers()
  const updateRole = useUpdateMemberRole()
  const removeMember = useRemoveMember()

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<TeamMemberWithProfile | null>(null)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ member: TeamMemberWithProfile; newRole: TeamRole } | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-text-muted/10 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!members || members.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-4">
        No business members found.
      </p>
    )
  }

  const currentUserRole = currentTeam?.role || 'viewer'
  const roles = getInvitableRoles()

  const handleRemove = async () => {
    if (!removeConfirm) return
    try {
      await removeMember.mutateAsync(removeConfirm.id)
      setRemoveConfirm(null)
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  const handleRoleChange = async () => {
    if (!roleChangeTarget) return
    try {
      await updateRole.mutateAsync({
        memberId: roleChangeTarget.member.id,
        role: roleChangeTarget.newRole,
      })
      setRoleChangeTarget(null)
    } catch (err) {
      console.error('Failed to change role:', err)
    }
  }

  return (
    <>
      <div className="space-y-2">
        {members.map((member) => {
          const isCurrentUser = member.user_id === user?.id
          const canRemove = canRemoveMember(currentUserRole, member.role) && !isCurrentUser
          const canChange = canChangeRole(currentUserRole, member.role, member.role) && !isCurrentUser

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-text-muted/10"
            >
              {/* Member info */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  {member.user.profile?.avatar_url ? (
                    <img
                      src={member.user.profile.avatar_url}
                      alt=""
                      className="h-10 w-10 object-cover"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 text-text-muted" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text">
                      {member.user.profile?.full_name || member.user.email}
                    </p>
                    {isCurrentUser && (
                      <span className="text-xs text-text-muted">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">{member.user.email}</p>
                </div>
              </div>

              {/* Role & Actions */}
              <div className="flex items-center gap-3">
                <RoleBadge role={member.role} />

                {/* Actions menu */}
                {(canRemove || canChange) && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                      className="p-2 text-text-muted hover:text-text transition-colors rounded-lg hover:bg-text-muted/10"
                    >
                      <EllipsisVerticalIcon className="h-4 w-4" />
                    </button>

                    {openMenuId === member.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-text-muted/20 bg-surface shadow-lg">
                        <div className="p-1">
                          {/* Role change options */}
                          {canChange && roles.map((r) => {
                            if (r === member.role) return null
                            if (!canChangeRole(currentUserRole, member.role, r)) return null
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => {
                                  setRoleChangeTarget({ member, newRole: r })
                                  setOpenMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-background transition-colors"
                              >
                                <ShieldCheckIcon className="h-4 w-4 text-text-muted" />
                                Change to {getRoleLabel(r)}
                              </button>
                            )
                          })}

                          {/* Remove option */}
                          {canRemove && (
                            <>
                              {canChange && <div className="my-1 border-t border-text-muted/10" />}
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveConfirm(member)
                                  setOpenMenuId(null)
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <TrashIcon className="h-4 w-4" />
                                Remove member
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Remove confirmation */}
      <ConfirmDialog
        isOpen={!!removeConfirm}
        onConfirm={handleRemove}
        onCancel={() => setRemoveConfirm(null)}
        title="Remove Business Member"
        message={`Are you sure you want to remove ${removeConfirm?.user.profile?.full_name || removeConfirm?.user.email} from this business? They will lose access to all business data.`}
        confirmLabel={removeMember.isPending ? 'Removing...' : 'Remove'}
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Role change confirmation */}
      <ConfirmDialog
        isOpen={!!roleChangeTarget}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleChangeTarget(null)}
        title="Change Role"
        message={`Change ${roleChangeTarget?.member.user.profile?.full_name || roleChangeTarget?.member.user.email}'s role to ${roleChangeTarget?.newRole ? getRoleLabel(roleChangeTarget.newRole) : ''}?`}
        confirmLabel={updateRole.isPending ? 'Updating...' : 'Change Role'}
        cancelLabel="Cancel"
        variant="warning"
      />
    </>
  )
}
