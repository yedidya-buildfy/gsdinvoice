import type { TeamRole } from '@/types/team'

/**
 * Permission helpers for team-based access control
 */

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY: TeamRole[] = ['viewer', 'member', 'admin', 'owner']

/**
 * Check if a role has at least the specified level
 */
export function hasRoleLevel(userRole: TeamRole, requiredRole: TeamRole): boolean {
  const userLevel = ROLE_HIERARCHY.indexOf(userRole)
  const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole)
  return userLevel >= requiredLevel
}

/**
 * Can manage team settings (name, avatar, etc.)
 */
export function canManageTeam(role: TeamRole): boolean {
  return hasRoleLevel(role, 'admin')
}

/**
 * Can create, edit, and delete data (invoices, transactions, etc.)
 */
export function canEditData(role: TeamRole): boolean {
  return hasRoleLevel(role, 'member')
}

/**
 * Can view data (everyone can view)
 */
export function canViewData(role: TeamRole): boolean {
  return hasRoleLevel(role, 'viewer')
}

/**
 * Can invite new members to the team
 */
export function canInviteMembers(role: TeamRole): boolean {
  return hasRoleLevel(role, 'admin')
}

/**
 * Can remove members from the team
 */
export function canRemoveMember(role: TeamRole, targetRole: TeamRole): boolean {
  // Must be admin or higher
  if (!hasRoleLevel(role, 'admin')) return false
  // Cannot remove someone with same or higher role (unless owner)
  if (role === 'owner') return true
  return hasRoleLevel(role, targetRole) && role !== targetRole
}

/**
 * Can change another member's role
 */
export function canChangeRole(userRole: TeamRole, targetCurrentRole: TeamRole, targetNewRole: TeamRole): boolean {
  // Must be admin or higher
  if (!hasRoleLevel(userRole, 'admin')) return false
  // Owner can change anyone's role
  if (userRole === 'owner') return true
  // Admin cannot promote to owner or change owner's role
  if (targetCurrentRole === 'owner' || targetNewRole === 'owner') return false
  // Admin can change roles of lower members
  return hasRoleLevel(userRole, targetCurrentRole) && userRole !== targetCurrentRole
}

/**
 * Can delete the team (owner only)
 */
export function canDeleteTeam(role: TeamRole): boolean {
  return role === 'owner'
}

/**
 * Can transfer team ownership (owner only)
 */
export function canTransferOwnership(role: TeamRole): boolean {
  return role === 'owner'
}

/**
 * Get role display label
 */
export function getRoleLabel(role: TeamRole): string {
  const labels: Record<TeamRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
  }
  return labels[role]
}

/**
 * Get role description
 */
export function getRoleDescription(role: TeamRole): string {
  const descriptions: Record<TeamRole, string> = {
    owner: 'Full access, can delete team and transfer ownership',
    admin: 'Manage members, full access to all data and settings',
    member: 'Create and edit data, cannot manage team settings',
    viewer: 'View-only access to all data',
  }
  return descriptions[role]
}

/**
 * Get available roles for invitation (owner cannot be invited)
 */
export function getInvitableRoles(): Exclude<TeamRole, 'owner'>[] {
  return ['admin', 'member', 'viewer']
}

/**
 * Check if user can assign a specific role
 */
export function canAssignRole(userRole: TeamRole, targetRole: TeamRole): boolean {
  if (userRole === 'owner') return true
  if (targetRole === 'owner') return false
  return hasRoleLevel(userRole, 'admin') && hasRoleLevel(userRole, targetRole)
}
