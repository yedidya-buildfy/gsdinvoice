export const STRIPE_CONFIG = {
  publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,

  plans: {
    free: {
      id: 'free',
      name: 'Free',
      description: 'For individuals getting started',
      features: [
        '20 invoices/month',
        '1 team member',
        '1 bank connection',
        'Manual CC matching',
        'Basic reports',
      ],
      limits: {
        invoicesPerMonth: 20,
        teamMembers: 1,
        bankConnections: 1,
      },
      prices: {
        monthly: null,
        yearly: null,
      },
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      description: 'For growing businesses',
      features: [
        '200 invoices/month',
        '3 team members',
        '3 bank connections',
        'Auto CC matching suggestions',
        'Advanced reports & exports',
        'Email support',
      ],
      limits: {
        invoicesPerMonth: 200,
        teamMembers: 3,
        bankConnections: 3,
      },
      prices: {
        monthly: {
          id: 'price_1Sv5Q0AL5a3GKiPQ067swNb1',
          amount: 2900,
          currency: 'usd',
        },
        yearly: {
          id: 'price_1Sv5Q1AL5a3GKiPQDNZwX68D',
          amount: 29000,
          currency: 'usd',
        },
      },
    },
    business: {
      id: 'business',
      name: 'Business',
      description: 'For teams and enterprises',
      features: [
        'Unlimited invoices',
        '10 team members',
        'Unlimited bank connections',
        'AI-powered matching',
        'Custom rules & workflows',
        'Priority support',
        'API access',
      ],
      limits: {
        invoicesPerMonth: null, // unlimited
        teamMembers: 10,
        bankConnections: null, // unlimited
      },
      prices: {
        monthly: {
          id: 'price_1Sv5Q1AL5a3GKiPQEZDH02dT',
          amount: 7900,
          currency: 'usd',
        },
        yearly: {
          id: 'price_1Sv5Q2AL5a3GKiPQBGd52tp8',
          amount: 79000,
          currency: 'usd',
        },
      },
    },
  },
} as const

export type PlanId = keyof typeof STRIPE_CONFIG.plans
export type BillingInterval = 'monthly' | 'yearly'

