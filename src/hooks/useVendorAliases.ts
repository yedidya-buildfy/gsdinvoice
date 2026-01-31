import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import type {
  VendorAlias,
  VendorAliasInsert,
  VendorAliasUpdate,
} from '@/types/database'

/**
 * Return type for the useVendorAliases hook
 */
export interface UseVendorAliasesReturn {
  /** List of vendor aliases for the current user/team */
  aliases: VendorAlias[]
  /** Loading state for the initial fetch */
  isLoading: boolean
  /** Error state if fetch fails */
  error: Error | null
  /** Create a new vendor alias */
  createAlias: (data: Omit<VendorAliasInsert, 'user_id'>) => Promise<VendorAlias>
  /** Update an existing vendor alias */
  updateAlias: (id: string, data: VendorAliasUpdate) => Promise<VendorAlias>
  /** Delete a vendor alias */
  deleteAlias: (id: string) => Promise<void>
  /** Seed default vendor aliases for the user */
  seedDefaults: () => Promise<void>
  /** Refetch aliases from the database */
  refetch: () => void
}

/**
 * Fetch vendor aliases for a user, optionally filtered by team
 */
async function fetchVendorAliases(
  userId: string,
  teamId: string | null
): Promise<VendorAlias[]> {
  let query = supabase
    .from('vendor_aliases')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .order('canonical_name', { ascending: true })

  // Filter by team if provided, otherwise get personal aliases (no team)
  if (teamId) {
    query = query.eq('team_id', teamId)
  } else {
    query = query.is('team_id', null)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch vendor aliases: ${error.message}`)
  }

  return data || []
}

/**
 * Hook for managing vendor aliases
 *
 * Provides CRUD operations for vendor aliases with support for team context.
 * Aliases can be personal (no team) or team-specific.
 *
 * @example
 * ```tsx
 * const {
 *   aliases,
 *   isLoading,
 *   createAlias,
 *   updateAlias,
 *   deleteAlias,
 *   seedDefaults
 * } = useVendorAliases()
 *
 * // Create a new alias
 * await createAlias({
 *   alias_pattern: 'AMZN',
 *   canonical_name: 'Amazon',
 *   match_type: 'contains',
 *   source: 'user'
 * })
 * ```
 */
export function useVendorAliases(): UseVendorAliasesReturn {
  const { user } = useAuth()
  const { currentTeam } = useTeam()
  const queryClient = useQueryClient()

  const queryKey = ['vendor-aliases', user?.id, currentTeam?.id]

  // Fetch aliases query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchVendorAliases(user!.id, currentTeam?.id ?? null),
    enabled: !!user,
    staleTime: 30000, // 30 seconds - consistent with project pattern
  })

  // Create alias mutation
  const createMutation = useMutation({
    mutationFn: async (
      insertData: Omit<VendorAliasInsert, 'user_id'>
    ): Promise<VendorAlias> => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const aliasData: VendorAliasInsert = {
        ...insertData,
        user_id: user.id,
        team_id: currentTeam?.id ?? null,
      }

      const { data, error } = await supabase
        .from('vendor_aliases')
        .insert(aliasData)
        .select()
        .single()

      if (error) {
        // Handle specific error cases
        if (error.code === '23505') {
          throw new Error('An alias with this pattern already exists')
        }
        if (error.message.includes('Maximum vendor alias limit')) {
          throw new Error(error.message)
        }
        throw new Error(`Failed to create alias: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Update alias mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updateData,
    }: {
      id: string
      updateData: VendorAliasUpdate
    }): Promise<VendorAlias> => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await supabase
        .from('vendor_aliases')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id) // Ensure user owns the alias
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('An alias with this pattern already exists')
        }
        throw new Error(`Failed to update alias: ${error.message}`)
      }

      if (!data) {
        throw new Error('Alias not found or you do not have permission to update it')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Delete alias mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { error } = await supabase
        .from('vendor_aliases')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id) // Ensure user owns the alias

      if (error) {
        throw new Error(`Failed to delete alias: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Seed defaults mutation - calls the database function
  const seedDefaultsMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { error } = await supabase.rpc('seed_default_vendor_aliases', {
        p_user_id: user.id,
        p_team_id: currentTeam?.id ?? null,
      })

      if (error) {
        throw new Error(`Failed to seed default aliases: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Wrapper functions that return promises for mutations
  const createAlias = async (
    insertData: Omit<VendorAliasInsert, 'user_id'>
  ): Promise<VendorAlias> => {
    return createMutation.mutateAsync(insertData)
  }

  const updateAlias = async (
    id: string,
    updateData: VendorAliasUpdate
  ): Promise<VendorAlias> => {
    return updateMutation.mutateAsync({ id, updateData })
  }

  const deleteAlias = async (id: string): Promise<void> => {
    return deleteMutation.mutateAsync(id)
  }

  const seedDefaults = async (): Promise<void> => {
    return seedDefaultsMutation.mutateAsync()
  }

  return {
    aliases: data || [],
    isLoading,
    error: error as Error | null,
    createAlias,
    updateAlias,
    deleteAlias,
    seedDefaults,
    refetch: () => void refetch(),
  }
}

/**
 * Hook to check if user has any vendor aliases
 * Useful for determining if defaults should be seeded
 */
export function useHasVendorAliases(): {
  hasAliases: boolean
  isLoading: boolean
} {
  const { aliases, isLoading } = useVendorAliases()

  return {
    hasAliases: aliases.length > 0,
    isLoading,
  }
}
