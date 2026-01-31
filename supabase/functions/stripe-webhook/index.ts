import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

// Map Stripe price IDs to plan tiers
const PRICE_TO_PLAN: Record<string, string> = {
  'price_1Sv5Q0AL5a3GKiPQ067swNb1': 'pro',
  'price_1Sv5Q1AL5a3GKiPQDNZwX68D': 'pro',
  'price_1Sv5Q1AL5a3GKiPQEZDH02dT': 'business',
  'price_1Sv5Q2AL5a3GKiPQBGd52tp8': 'business',
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature ?? '', webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log('Received Stripe webhook:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planTier = session.metadata?.planTier

        if (userId && session.subscription) {
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            plan_tier: planTier || 'pro',
            status: subscription.status === 'trialing' ? 'trialing' : 'active',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            trial_end: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })

          console.log(`Subscription created for user ${userId}: ${planTier}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId

        // Get plan tier from price ID
        const priceId = subscription.items.data[0]?.price.id
        const planTier = PRICE_TO_PLAN[priceId] || subscription.metadata?.planTier || 'pro'

        if (userId) {
          await supabase
            .from('subscriptions')
            .update({
              plan_tier: planTier,
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              trial_end: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id)

          console.log(`Subscription updated for user ${userId}: ${planTier}, status: ${subscription.status}`)
        } else {
          // Try to find by stripe_subscription_id
          await supabase
            .from('subscriptions')
            .update({
              plan_tier: planTier,
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              trial_end: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        // Downgrade to free plan
        await supabase
          .from('subscriptions')
          .update({
            plan_tier: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)

        console.log(`Subscription canceled: ${subscription.id}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice

        if (invoice.subscription) {
          // Reset usage for new billing period
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('user_id, current_period_start, current_period_end')
            .eq('stripe_subscription_id', invoice.subscription)
            .single()

          if (sub) {
            // Create new usage record for the new period
            await supabase.from('usage_records').upsert({
              user_id: sub.user_id,
              period_start: sub.current_period_start,
              period_end: sub.current_period_end,
              invoices_processed: 0,
              team_members_count: 0,
              bank_connections_count: 0,
            })
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        if (invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription)

          console.log(`Payment failed for subscription: ${invoice.subscription}`)
        }
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
