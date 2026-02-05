import { useState, useRef, useEffect } from 'react'
import { ChevronUpDownIcon, CheckIcon, PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { useTeam } from '@/contexts/TeamContext'
import { CreateTeamModal } from './CreateTeamModal'
import { cx } from '@/utils/cx'

interface TeamSwitcherProps {
  isExpanded: boolean
}

export function TeamSwitcher({ isExpanded }: TeamSwitcherProps) {
  const { currentTeam, teams, switchTeam, isLoading } = useTeam()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown when sidebar collapses
  useEffect(() => {
    if (!isExpanded) {
      setIsOpen(false)
    }
  }, [isExpanded])

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-10 bg-text-muted/10 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!currentTeam) {
    return null
  }

  const handleSelect = (teamId: string) => {
    switchTeam(teamId)
    setIsOpen(false)
  }

  return (
    <>
      <div className="relative px-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => isExpanded && setIsOpen(!isOpen)}
          className={cx(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2 transition-colors',
            'hover:bg-background text-text',
            !isExpanded && 'justify-center'
          )}
          title={!isExpanded ? currentTeam.name : undefined}
        >
          {/* Team Avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            {currentTeam.avatar_url ? (
              <img
                src={currentTeam.avatar_url}
                alt={currentTeam.name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <UserGroupIcon className="h-4 w-4 text-primary" />
            )}
          </div>

          {isExpanded && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-text truncate">
                  {currentTeam.name}
                </p>
                <p className="text-xs text-text-muted capitalize">
                  {currentTeam.role}
                </p>
              </div>
              <ChevronUpDownIcon className="h-4 w-4 text-text-muted shrink-0" />
            </>
          )}
        </button>

        {/* Dropdown */}
        {isOpen && isExpanded && (
          <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-text-muted/20 bg-surface shadow-lg">
            <div className="p-1">
              {/* Team list */}
              <div className="max-h-48 overflow-y-auto">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => handleSelect(team.id)}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                      team.id === currentTeam.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-text hover:bg-background'
                    )}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
                      {team.avatar_url ? (
                        <img
                          src={team.avatar_url}
                          alt={team.name}
                          className="h-6 w-6 rounded object-cover"
                        />
                      ) : (
                        <UserGroupIcon className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{team.name}</p>
                    </div>
                    {team.id === currentTeam.id && (
                      <CheckIcon className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="my-1 border-t border-text-muted/10" />

              {/* Create new team */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setShowCreateModal(true)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-text-muted transition-colors hover:bg-background hover:text-text"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-text-muted/30">
                  <PlusIcon className="h-3 w-3" />
                </div>
                <span className="text-sm">Create business</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </>
  )
}
