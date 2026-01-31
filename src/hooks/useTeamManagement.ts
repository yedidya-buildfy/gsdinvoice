import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTeam } from '@/contexts/TeamContext'
import { useAuth } from '@/contexts/AuthContext'
import type { TeamUpdate } from '@/types/team'

/**
 * Generate a URL-friendly slug from a team name
 */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'team'}-${Date.now().toString(36)}`
}

/**
 * Hook to create a new team
 */
export function useCreateTeam() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!user) {
        throw new Error('Must be logged in to create a team')
      }

      const slug = generateSlug(name)

      // Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          name,
          slug,
          owner_id: user.id,
        })
        .select()
        .single()

      if (teamError) {
        throw new Error(teamError.message)
      }

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          team_id: team.id,
          user_id: user.id,
          role: 'owner',
        })

      if (memberError) {
        // Rollback team creation
        await supabase.from('teams').delete().eq('id', team.id)
        throw new Error(memberError.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: team.id,
        action: 'team.created',
        metadata: { name },
      })

      return team
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      refreshTeams()
    },
  })
}

/**
 * Hook to update team settings
 */
export function useUpdateTeam() {
  const queryClient = useQueryClient()
  const { currentTeam, refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async (updates: TeamUpdate) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      const { error } = await supabase
        .from('teams')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentTeam.id)

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'team.updated',
        metadata: { updates: JSON.parse(JSON.stringify(updates)) },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      refreshTeams()
    },
  })
}

/**
 * Hook to delete a team (owner only)
 */
export function useDeleteTeam() {
  const queryClient = useQueryClient()
  const { refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async (teamId: string) => {
      // Log before deletion
      await supabase.from('team_audit_logs').insert({
        team_id: teamId,
        action: 'team.deleted',
      })

      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      refreshTeams()
    },
  })
}

/**
 * Hook to upload team avatar
 */
export function useUploadTeamAvatar() {
  const { currentTeam } = useTeam()
  const updateTeam = useUpdateTeam()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      // Validate file
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (file.size > maxSize) {
        throw new Error('File size must be less than 5MB')
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        throw new Error('File must be JPEG, PNG, WebP, or GIF')
      }

      // Generate unique filename
      const ext = file.name.split('.').pop()
      const filename = `team-avatars/${currentTeam.id}/${Date.now()}.${ext}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filename)

      // Update team with avatar URL
      await updateTeam.mutateAsync({ avatar_url: urlData.publicUrl })

      return urlData.publicUrl
    },
  })
}

/**
 * Hook to remove team avatar
 */
export function useRemoveTeamAvatar() {
  const { currentTeam } = useTeam()
  const updateTeam = useUpdateTeam()

  return useMutation({
    mutationFn: async () => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      // Remove avatar URL from team
      await updateTeam.mutateAsync({ avatar_url: null })

      // Note: We don't delete the file from storage to prevent orphaned file issues
      // Old files can be cleaned up with a scheduled job if needed
    },
  })
}

/**
 * Hook to leave a team (for non-owners)
 */
export function useLeaveTeam() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async (teamId: string) => {
      if (!user) {
        throw new Error('Must be logged in')
      }

      // Check if user is owner
      const { data: membership } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .is('removed_at', null)
        .single()

      if (membership?.role === 'owner') {
        throw new Error('Owners cannot leave the team. Transfer ownership first.')
      }

      // Soft delete membership
      const { error } = await supabase
        .from('team_members')
        .update({ removed_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('user_id', user.id)

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: teamId,
        action: 'member.left',
        target_user_id: user.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      refreshTeams()
    },
  })
}
