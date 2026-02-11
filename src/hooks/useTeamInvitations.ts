import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTeam } from '@/contexts/TeamContext'
import { useAuth } from '@/contexts/AuthContext'
import type { TeamInvitation, TeamRole } from '@/types/team'

/**
 * Generate a secure random token for invitations
 */
function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Hook to fetch pending invitations for the current team
 */
export function useTeamInvitations() {
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['team-invitations', currentTeam?.id],
    queryFn: async (): Promise<TeamInvitation[]> => {
      if (!currentTeam) {
        return []
      }

      const { data, error } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('team_id', currentTeam.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      // Cast to TeamInvitation with proper role types
      return (data || []) as TeamInvitation[]
    },
    enabled: !!currentTeam,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to invite a new member to the team
 */
export function useInviteMember() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Exclude<TeamRole, 'owner'> }) => {
      if (!currentTeam || !user) {
        throw new Error('No team selected')
      }

      // Note: We can't check if user is already a member by email since auth.users
      // isn't queryable from client. The invitation will fail on acceptance if already a member.

      // Check if there's already a pending invitation
      const { data: existingInvite } = await supabase
        .from('team_invitations')
        .select('id')
        .eq('team_id', currentTeam.id)
        .eq('email', email)
        .eq('status', 'pending')
        .single()

      if (existingInvite) {
        throw new Error('An invitation is already pending for this email')
      }

      const token = generateToken()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiration

      const { data, error } = await supabase
        .from('team_invitations')
        .insert({
          team_id: currentTeam.id,
          email,
          role,
          token,
          invited_by: user.id,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'member.invited',
        metadata: { email, role, invitation_id: data.id },
      })

      // Send invitation email (non-blocking - don't fail if email fails)
      const inviteUrl = `${window.location.origin}/invite/${data.token}`
      let emailSent = false

      try {
        const { error: emailError } = await supabase.functions.invoke('send-team-invite', {
          body: {
            email,
            teamName: currentTeam.name,
            inviterName: user.user_metadata?.full_name || user.email || 'A team member',
            role,
            inviteUrl,
          },
        })

        if (emailError) {
          console.warn('Failed to send invitation email:', emailError)
        } else {
          emailSent = true
        }
      } catch (emailError) {
        // Don't fail the invitation if email fails - the link still works
        console.warn('Failed to send invitation email:', emailError)
      }

      return { ...data, emailSent }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', currentTeam?.id] })
    },
  })
}

/**
 * Hook to revoke an invitation
 */
export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!currentTeam) {
        throw new Error('No team selected')
      }

      const { error } = await supabase
        .from('team_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId)
        .eq('team_id', currentTeam.id)

      if (error) {
        throw new Error(error.message)
      }

      // Log the action
      await supabase.from('team_audit_logs').insert({
        team_id: currentTeam.id,
        action: 'invitation.revoked',
        metadata: { invitation_id: invitationId },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', currentTeam?.id] })
    },
  })
}

/**
 * Hook to resend an invitation (creates new token and sends email)
 */
export function useResendInvitation() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!currentTeam || !user) {
        throw new Error('No team selected')
      }

      // First, get the invitation to know the email and role
      const { data: invitation, error: fetchError } = await supabase
        .from('team_invitations')
        .select('email, role')
        .eq('id', invitationId)
        .eq('team_id', currentTeam.id)
        .single()

      if (fetchError || !invitation) {
        throw new Error('Invitation not found')
      }

      const token = generateToken()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await supabase
        .from('team_invitations')
        .update({
          token,
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', invitationId)
        .eq('team_id', currentTeam.id)

      if (error) {
        throw new Error(error.message)
      }

      // Send the email with the new token
      const inviteUrl = `${window.location.origin}/invite/${token}`
      let emailSent = false

      try {
        const { error: emailError } = await supabase.functions.invoke('send-team-invite', {
          body: {
            email: invitation.email,
            teamName: currentTeam.name,
            inviterName: user.user_metadata?.full_name || user.email || 'A team member',
            role: invitation.role,
            inviteUrl,
          },
        })

        if (emailError) {
          console.warn('Failed to resend invitation email:', emailError)
        } else {
          emailSent = true
        }
      } catch (emailError) {
        console.warn('Failed to resend invitation email:', emailError)
      }

      return { emailSent }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', currentTeam?.id] })
    },
  })
}

/**
 * Hook to accept an invitation (used on the accept-invitation page)
 * Uses atomic RPC function for race-condition-free acceptance
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { refreshTeams } = useTeam()

  return useMutation({
    mutationFn: async (token: string) => {
      if (!user || !user.email) {
        throw new Error('Must be logged in to accept invitation')
      }

      const { data, error } = await supabase.rpc('accept_team_invitation', {
        p_token: token,
        p_user_id: user.id,
        p_user_email: user.email,
      })

      if (error) {
        throw new Error(error.message)
      }

      const result = data as { success?: boolean; error?: string } | null
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to accept invitation')
      }

      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      refreshTeams()
    },
  })
}

/**
 * Hook to fetch invitation by token (for accept-invitation page)
 */
export function useInvitationByToken(token: string | null) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      if (!token) return null

      const { data, error } = await supabase
        .from('team_invitations')
        .select(`
          *,
          team:teams (
            id,
            name,
            avatar_url
          )
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .single()

      if (error) {
        throw new Error('Invalid invitation')
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        throw new Error('Invitation has expired')
      }

      return data
    },
    enabled: !!token,
    retry: false,
  })
}
