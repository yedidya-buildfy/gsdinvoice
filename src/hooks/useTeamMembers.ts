import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTeam } from '@/contexts/TeamContext'
import type { TeamMemberWithProfile, TeamRole } from '@/types/team'

/**
 * Hook to fetch team members with their profile info
 */
export function useTeamMembers() {
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['team-members', currentTeam?.id],
    queryFn: async (): Promise<TeamMemberWithProfile[]> => {
      if (!currentTeam) {
        return []
      }

      // Get team members
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', currentTeam.id)
        .is('removed_at', null)
        .order('joined_at', { ascending: true })

      if (membersError) {
        throw new Error(membersError.message)
      }

      if (!members || members.length === 0) {
        return []
      }

      // Get user IDs
      const userIds = members.map((m) => m.user_id)

      // Fetch profiles for each user (includes email)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, email')
        .in('user_id', userIds)

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

      return members.map((member) => {
        const profile = profileMap.get(member.user_id)
        const email = profile?.email || member.user_id.slice(0, 8) + '...'
        return {
          ...member,
          role: member.role as TeamMemberWithProfile['role'],
          user: {
            email,
            profile: profile || null,
          },
        }
      }) as TeamMemberWithProfile[]
    },
    enabled: !!currentTeam,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to update a team member's role
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: TeamRole }) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      const { error } = await supabase
        .from('team_members')
        .update({ role })
        .eq('id', memberId)
        .eq('team_id', currentTeam.id)

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'member.role_changed',
        metadata: { member_id: memberId, new_role: role },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', currentTeam?.id] })
    },
  })
}

/**
 * Hook to remove a team member (soft delete)
 */
export function useRemoveMember() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async (memberId: string) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      // Get member info for audit log
      const { data: member } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('id', memberId)
        .single()

      const { error } = await supabase
        .from('team_members')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', memberId)
        .eq('team_id', currentTeam.id)

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'member.removed',
        target_user_id: member?.user_id,
        metadata: { member_id: memberId },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', currentTeam?.id] })
    },
  })
}

/**
 * Hook to transfer team ownership
 */
/**
 * Hook to fetch member counts for multiple teams
 */
export function useTeamMemberCounts(teamIds: string[]) {
  return useQuery({
    queryKey: ['team-member-counts', teamIds],
    queryFn: async (): Promise<Record<string, number>> => {
      if (teamIds.length === 0) {
        return {}
      }

      const { data, error } = await supabase
        .from('team_members')
        .select('team_id')
        .in('team_id', teamIds)
        .is('removed_at', null)

      if (error) {
        throw new Error(error.message)
      }

      // Count members per team
      const counts: Record<string, number> = {}
      for (const teamId of teamIds) {
        counts[teamId] = 0
      }
      for (const member of data || []) {
        counts[member.team_id] = (counts[member.team_id] || 0) + 1
      }

      return counts
    },
    enabled: teamIds.length > 0,
    staleTime: 60 * 1000, // Cache for 1 minute
  })
}
