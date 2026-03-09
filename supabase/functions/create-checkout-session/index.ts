import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)
const appUrl = Deno.env.get('APP_URL')?.trim() || 'https://bill-sync.com'

const ALLOWED_ORIGINS = ["https://bill-sync.com", "https://www.bill-sync.com", "http://localhost:5173"];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const PRICE_IDS = {
  pro: {
    monthly: 'price_1Sv5Q0AL5a3GKiPQ067swNb1',
    yearly: 'price_1Sv5Q1AL5a3GKiPQDNZwX68D',
  },
  business: {
    monthly: 'price_1Sv5Q1AL5a3GKiPQEZDH02dT',
    yearly: 'price_1Sv5Q2AL5a3GKiPQBGd52tp8',
  },
} as const

type PlanId = keyof typeof PRICE_IDS
type BillingInterval = keyof typeof PRICE_IDS.pro

function getPriceId(planId: string, interval: string): string | null {
  if (!(planId in PRICE_IDS)) return null
  const prices = PRICE_IDS[planId as PlanId]
  if (!(interval in prices)) return null
  return prices[interval as BillingInterval]
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId, planId, interval } = await req.json()

    if (!userId || !planId || !interval) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const priceId = getPriceId(planId, interval)
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan or billing interval' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify userId matches the authenticated user
    if (userId !== authUser.id) {
      return new Response(
        JSON.stringify({ error: 'User ID does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userEmail = authUser.email
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'Authenticated user has no email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user already has a Stripe customer ID
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    let customerId = subscription?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId,
        },
      })
      customerId = customer.id

      // Save customer ID to subscription
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          plan_tier: 'free',
          status: 'active',
        })
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings?tab=billing&success=true`,
      cancel_url: `${appUrl}/settings?tab=billing&canceled=true`,
      metadata: {
        userId,
        planTier: planId,
      },
      subscription_data: {
        metadata: {
          userId,
          planTier: planId,
        },
        trial_period_days: 14, // 14-day trial
      },
      allow_promotion_codes: true,
    })

    return new Response(
      JSON.stringify({ sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
