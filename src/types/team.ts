// Team role types
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'

// Team types
export interface Team {
  id: string
  name: string
  slug: string
  owner_id: string
  avatar_url: string | null
  created_at: string | null
  updated_at: string | null
}

export interface TeamUpdate {
  name?: string
  avatar_url?: string | null
}

// Team member types
export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: TeamRole
  invited_by: string | null
  joined_at: string | null
  removed_at: string | null
}

// Team member with user profile info (joined query result)
export interface TeamMemberWithProfile extends TeamMember {
  user: {
    email: string
    profile?: {
      full_name: string | null
      avatar_url: string | null
    } | null
  }
}

// Team invitation types
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface TeamInvitation {
  id: string
  team_id: string
  email: string
  role: Exclude<TeamRole, 'owner'>
  token: string
  invited_by: string | null
  expires_at: string
  status: InvitationStatus
  created_at: string
}

// Team with member info (for team list)
export interface TeamWithRole extends Team {
  role: TeamRole
  memberCount?: number
}

// Context type for current team
export interface TeamContextType {
  currentTeam: TeamWithRole | null
  teams: TeamWithRole[]
  isLoading: boolean
  error: Error | null
  switchTeam: (teamId: string) => void
  refreshTeams: () => Promise<void>
}
