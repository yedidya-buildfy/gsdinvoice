import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Team, TeamWithRole, TeamContextType } from '@/types/team'

const TeamContext = createContext<TeamContextType | undefined>(undefined)

const LAST_TEAM_KEY = 'vat-manager-last-team-id'

interface TeamProviderProps {
  children: ReactNode
}

export function TeamProvider({ children }: TeamProviderProps) {
  const { user } = useAuth()
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [currentTeam, setCurrentTeam] = useState<TeamWithRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Fetch user's teams with their roles
  const fetchTeams = useCallback(async () => {
    if (!user) {
      setTeams([])
      setCurrentTeam(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get teams where user is an active member
      const { data: memberships, error: memberError } = await supabase
        .from('team_members')
        .select(`
          role,
          team:teams (
            id,
            name,
            slug,
            owner_id,
            avatar_url,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .is('removed_at', null)

      if (memberError) {
        throw new Error(memberError.message)
      }

      // Transform to TeamWithRole array
      const teamsWithRoles: TeamWithRole[] = (memberships || [])
        .filter((m) => m.team) // Filter out any null teams
        .map((m) => ({
          ...(m.team as unknown as Team),
          role: m.role as TeamWithRole['role'],
        }))

      setTeams(teamsWithRoles)

      // Determine current team
      const lastTeamId = localStorage.getItem(LAST_TEAM_KEY)
      let selectedTeam: TeamWithRole | null = null

      if (lastTeamId) {
        selectedTeam = teamsWithRoles.find((t) => t.id === lastTeamId) || null
      }

      // If no saved team or saved team not found, use first team
      if (!selectedTeam && teamsWithRoles.length > 0) {
        selectedTeam = teamsWithRoles[0]
      }

      setCurrentTeam(selectedTeam)

      // If user has no teams, create a personal team
      if (teamsWithRoles.length === 0) {
        const newTeam = await createPersonalTeam(user.id, user.user_metadata?.full_name)
        if (newTeam) {
          setTeams([newTeam])
          setCurrentTeam(newTeam)
        }
      }
    } catch (err) {
      console.error('[TeamContext] Error fetching teams:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch teams'))
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Create a personal team for the user
  const createPersonalTeam = async (userId: string, userName?: string): Promise<TeamWithRole | null> => {
    try {
      const teamName = userName ? `${userName}'s Team` : 'My Team'
      const slug = `team-${userId.slice(0, 8)}-${Date.now()}`

      // Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          name: teamName,
          slug,
          owner_id: userId,
        })
        .select()
        .single()

      if (teamError) {
        throw new Error(teamError.message)
      }

      // Add user as owner
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          team_id: team.id,
          user_id: userId,
          role: 'owner',
        })

      if (memberError) {
        throw new Error(memberError.message)
      }

      return {
        ...team,
        role: 'owner' as const,
      }
    } catch (err) {
      console.error('[TeamContext] Error creating personal team:', err)
      return null
    }
  }

  // Switch to a different team
  const switchTeam = useCallback((teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (team) {
      setCurrentTeam(team)
      localStorage.setItem(LAST_TEAM_KEY, teamId)
    }
  }, [teams])

  // Refresh teams list
  const refreshTeams = useCallback(async () => {
    await fetchTeams()
  }, [fetchTeams])

  // Fetch teams when user changes
  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // Clear current team when user logs out
  useEffect(() => {
    if (!user) {
      setCurrentTeam(null)
      setTeams([])
    }
  }, [user])

  const value: TeamContextType = {
    currentTeam,
    teams,
    isLoading,
    error,
    switchTeam,
    refreshTeams,
  }

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}

export function useTeam() {
  const context = useContext(TeamContext)
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider')
  }
  return context
}
