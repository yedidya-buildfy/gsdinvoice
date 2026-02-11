import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getStripe } from '@/lib/stripe/client'
import { STRIPE_CONFIG, type PlanId, type BillingInterval } from '@/lib/stripe/config'
import type { Subscription, PlanLimits, UsageRecord } from '@/types/subscription'

export function useSubscription() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Tables not in generated types - using any cast for subscription features
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single() as { data: Subscription | null; error: { code: string } | null }

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return data
    },
    enabled: !!user,
  })
}

export function usePlanLimits(planTier?: string) {
  return useQuery({
    queryKey: ['plan_limits', planTier],
    queryFn: async () => {
      // Tables not in generated types - using any cast for subscription features
      const query = (supabase as any).from('plan_limits').select('*')

      if (planTier) {
        const { data, error } = await query.eq('plan_tier', planTier).single() as { data: PlanLimits | null; error: { code: string } | null }
        if (error && error.code !== 'PGRST116') {
          throw error
        }
        return data
      }

      const { data, error } = await query as { data: PlanLimits[] | null; error: { code: string } | null }

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return data
    },
  })
}

export function useCurrentUsage() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['usage', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Get current period start (beginning of month or subscription period)
      const periodStart = new Date()
      periodStart.setDate(1)
      periodStart.setHours(0, 0, 0, 0)

      // Tables not in generated types - using any cast for subscription features
      const { data, error } = await (supabase as any)
        .from('usage_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('period_start', periodStart.toISOString())
        .order('period_start', { ascending: false })
        .limit(1)
        .single() as { data: UsageRecord | null; error: { code: string } | null }

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return data ?? {
        invoices_processed: 0,
        team_members_count: 0,
        bank_connections_count: 0,
      } as UsageRecord
    },
    enabled: !!user,
  })
}

export function useCheckout() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      planId,
      interval,
    }: {
      planId: PlanId
      interval: BillingInterval
    }) => {
      if (!user) throw new Error('User not authenticated')

      const plan = STRIPE_CONFIG.plans[planId]
      const price = plan.prices[interval]

      if (!price) throw new Error('Invalid plan or interval')

      // Call Supabase Edge Function to create checkout session
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: price.id,
          userId: user.id,
          userEmail: user.email,
          planTier: planId,
        },
      })

      if (error) throw error

      // Redirect to Stripe Checkout
      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe not loaded')

      // Use type assertion for redirectToCheckout which exists at runtime
      const { error: stripeError } = await (stripe as unknown as { redirectToCheckout: (opts: { sessionId: string }) => Promise<{ error?: Error }> }).redirectToCheckout({
        sessionId: data.sessionId,
      })

      if (stripeError) throw stripeError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

export function useManageSubscription() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated')

      // Call Supabase Edge Function to create portal session
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: {
          userId: user.id,
        },
      })

      if (error) throw error

      // Redirect to Stripe Customer Portal
      window.location.href = data.url
    },
  })
}

export function useUpdateSubscription() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      planId,
      interval,
    }: {
      planId: PlanId
      interval: BillingInterval
    }) => {
      if (!user) throw new Error('User not authenticated')

      const plan = STRIPE_CONFIG.plans[planId]
      const price = plan.prices[interval]

      if (!price) throw new Error('Invalid plan or interval')

      // Call Supabase Edge Function to update subscription
      const { data, error } = await supabase.functions.invoke('update-subscription', {
        body: {
          userId: user.id,
          priceId: price.id,
          planTier: planId,
        },
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

export function useCanUploadInvoice() {
  const { data: subscription } = useSubscription()
  const { data: usage } = useCurrentUsage()
  const { data: limits } = usePlanLimits(subscription?.plan_tier)

  const planLimits = limits as PlanLimits | null

  if (!planLimits) {
    return { canUpload: true, remaining: null, limit: null }
  }

  const limit = planLimits.max_invoices_per_month
  const used = usage?.invoices_processed ?? 0

  // null means unlimited
  if (limit === null) {
    return { canUpload: true, remaining: null, limit: null }
  }

  const remaining = Math.max(0, limit - used)

  return {
    canUpload: remaining > 0,
    remaining,
    limit,
    used,
  }
}
