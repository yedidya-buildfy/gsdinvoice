export type PlanTier = 'free' | 'pro' | 'business'

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan_tier: PlanTier
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_end: string | null
  created_at: string
  updated_at: string
}

export interface PlanLimits {
  plan_tier: PlanTier
  name: string
  max_invoices_per_month: number | null
  max_team_members: number | null
  max_bank_connections: number | null
  max_businesses: number | null
  has_auto_matching: boolean
  has_ai_matching: boolean
  has_api_access: boolean
  overage_price_cents: number
}

export interface UsageRecord {
  id: string
  user_id: string
  period_start: string
  period_end: string
  invoices_processed: number
  team_members_count: number
  bank_connections_count: number
  created_at: string
  updated_at: string
}

export interface SubscriptionWithLimits extends Subscription {
  plan_limits: PlanLimits
}
