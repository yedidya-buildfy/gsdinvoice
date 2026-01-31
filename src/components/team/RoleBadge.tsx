import { cx } from '@/utils/cx'
import { getRoleLabel } from '@/lib/permissions'
import type { TeamRole } from '@/types/team'

interface RoleBadgeProps {
  role: TeamRole
  size?: 'sm' | 'md'
}

const roleColors: Record<TeamRole, string> = {
  owner: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  admin: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  member: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  viewer: 'bg-text-muted/10 text-text-muted border-text-muted/20',
}

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border font-medium',
        roleColors[role],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {getRoleLabel(role)}
    </span>
  )
}
