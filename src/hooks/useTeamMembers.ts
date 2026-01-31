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

      // Fetch profiles for each user
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds)

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

      // Fetch user emails using admin API or RPC function
      // For now, we'll use the profile data and show user_id if no profile exists
      // In production, you would use a server-side function to get emails
      return members.map((member) => {
        const profile = profileMap.get(member.user_id)
        return {
          ...member,
          user: {
            email: profile?.full_name || member.user_id.slice(0, 8) + '...', // Fallback to partial user_id
            profile: profile || null,
          },
        }
      })
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
export function useTransferOwnership() {
  const queryClient = useQueryClient()
  const { currentTeam, refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      // Update current owner to admin
      const { error: demoteError } = await supabase
        .from('team_members')
        .update({ role: 'admin' })
        .eq('team_id', currentTeam.id)
        .eq('role', 'owner')

      if (demoteError) {
        throw new Error(demoteError.message)
      }

      // Update new owner
      const { error: promoteError } = await supabase
        .from('team_members')
        .update({ role: 'owner' })
        .eq('team_id', currentTeam.id)
        .eq('user_id', newOwnerId)

      if (promoteError) {
        throw new Error(promoteError.message)
      }

      // Update team owner_id
      const { error: teamError } = await supabase
        .from('teams')
        .update({ owner_id: newOwnerId })
        .eq('id', currentTeam.id)

      if (teamError) {
        throw new Error(teamError.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'team.ownership_transferred',
        target_user_id: newOwnerId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', currentTeam?.id] })
      refreshTeams()
    },
  })
}
