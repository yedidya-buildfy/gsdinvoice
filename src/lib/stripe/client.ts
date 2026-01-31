import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { STRIPE_CONFIG } from './config'

let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise && STRIPE_CONFIG.publishableKey) {
    stripePromise = loadStripe(STRIPE_CONFIG.publishableKey)
  }
  return stripePromise ?? Promise.resolve(null)
}
