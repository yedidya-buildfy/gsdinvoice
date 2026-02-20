import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import type { EmailConnection } from '@/types/database'

// ============================================================================
// Query hook: fetch all email connections for current team
// ============================================================================

export function useEmailConnections() {
  const { user } = useAuth()
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['email-connections', currentTeam?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_connections')
        .select('*')
        .eq('team_id', currentTeam!.id)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return data as EmailConnection[]
    },
    enabled: !!user?.id && !!currentTeam,
    staleTime: 30 * 1000,
  })
}

// ============================================================================
// Mutation: initiate Gmail OAuth connection
// ============================================================================

export function useConnectGmail() {
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await supabase.functions.invoke('gmail-auth', {
        body: { team_id: currentTeam!.id, redirect_origin: window.location.origin },
      })

      if (response.error) throw new Error(response.error.message)
      const { url } = response.data as { url: string }
      if (!url) throw new Error('No OAuth URL returned')

      // Redirect to Google OAuth
      window.location.href = url
    },
  })
}

// ============================================================================
// Mutation: disconnect a Gmail account
// ============================================================================

export function useDisconnectGmail() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from('email_connections')
        .delete()
        .eq('id', connectionId)
        .eq('team_id', currentTeam!.id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connections', currentTeam?.id] })
    },
  })
}

// ============================================================================
// Mutation: start email sync (historical scan)
// ============================================================================

export function useStartEmailSync() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async ({
      connectionId,
      dateFrom,
      dateTo,
    }: {
      connectionId: string
      dateFrom?: string
      dateTo?: string
    }) => {
      const response = await supabase.functions.invoke('gmail-sync', {
        body: {
          mode: 'start',
          team_id: currentTeam!.id,
          connection_id: connectionId,
          date_from: dateFrom,
          date_to: dateTo,
        },
      })

      if (response.error) throw new Error(response.error.message)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connections', currentTeam?.id] })
    },
  })
}

// ============================================================================
// Mutation: update sender rules for a connection
// ============================================================================

export function useUpdateSenderRules() {
  const queryClient = useQueryClient()
  const { currentTeam } = useTeam()

  return useMutation({
    mutationFn: async ({
      connectionId,
      senderRules,
    }: {
      connectionId: string
      senderRules: { domain: string; rule: 'always_trust' | 'always_ignore' }[]
    }) => {
      const { error } = await supabase
        .from('email_connections')
        .update({ sender_rules: senderRules })
        .eq('id', connectionId)
        .eq('team_id', currentTeam!.id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connections', currentTeam?.id] })
    },
  })
}

// ============================================================================
// Hook: email sync progress (uses polling for active syncs)
// ============================================================================

export function useEmailSyncProgress() {
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['email-sync-progress', currentTeam?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_connections')
        .select('id, email_address, status, sync_state')
        .eq('team_id', currentTeam!.id)
        .in('status', ['syncing'])

      if (error) throw new Error(error.message)
      return data as Pick<EmailConnection, 'id' | 'email_address' | 'status' | 'sync_state'>[]
    },
    enabled: !!currentTeam,
    refetchInterval: (query) => {
      // Poll every 3 seconds while there are active syncs
      const data = query.state.data
      return data && data.length > 0 ? 3000 : false
    },
    staleTime: 2000,
  })
}

// ============================================================================
// Hook: count of unapproved email-sourced receipts
// ============================================================================

export function useUnreviewedEmailReceiptCount() {
  const { currentTeam } = useTeam()

  return useQuery({
    queryKey: ['unreviewed-email-receipts', currentTeam?.id],
    queryFn: async () => {
      const { data: emailFiles } = await supabase
        .from('files')
        .select('id')
        .eq('team_id', currentTeam!.id)
        .eq('source', 'email')

      if (!emailFiles || emailFiles.length === 0) return 0

      const fileIds = emailFiles.map(f => f.id)
      const { count, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', currentTeam!.id)
        .eq('is_approved', false)
        .in('file_id', fileIds)

      if (error) throw new Error(error.message)
      return count ?? 0
    },
    enabled: !!currentTeam,
    staleTime: 30 * 1000,
  })
}
