import { BuildingOfficeIcon, CheckIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { RoleBadge } from './RoleBadge'
import { cx } from '@/utils/cx'
import type { TeamWithRole } from '@/types/team'

interface BusinessCardProps {
  team: TeamWithRole
  isCurrent: boolean
  onSelect: () => void
  memberCount?: number
}

export function BusinessCard({ team, isCurrent, onSelect, memberCount }: BusinessCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'relative flex flex-col items-center p-4 rounded-xl border transition-all min-w-[140px]',
        'hover:border-primary/50 hover:bg-primary/5',
        isCurrent
          ? 'bg-primary/10 border-primary/30'
          : 'bg-surface border-text-muted/10'
      )}
    >
      {/* Current badge */}
      {isCurrent && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded text-xs text-primary">
            <CheckIcon className="w-3 h-3" />
          </div>
        </div>
      )}

      {/* Business icon */}
      <div className={cx(
        'p-3 rounded-xl mb-3',
        isCurrent ? 'bg-primary/20' : 'bg-text-muted/10'
      )}>
        {team.avatar_url ? (
          <img
            src={team.avatar_url}
            alt={team.name}
            className="w-6 h-6 rounded object-cover"
          />
        ) : (
          <BuildingOfficeIcon className={cx(
            'w-6 h-6',
            isCurrent ? 'text-primary' : 'text-text-muted'
          )} />
        )}
      </div>

      {/* Business name */}
      <h3 className="text-sm font-medium text-text truncate max-w-full mb-1">
        {team.name}
      </h3>

      {/* Role badge */}
      <RoleBadge role={team.role} size="sm" />

      {/* Member count */}
      {memberCount !== undefined && (
        <div className="flex items-center gap-1 mt-2 text-xs text-text-muted">
          <UserGroupIcon className="w-3 h-3" />
          <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
        </div>
      )}
    </button>
  )
}
