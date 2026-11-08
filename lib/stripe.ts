import 'server-only'
import Stripe from 'stripe'
import { PLAN_PRICES } from '@/lib/billing'
import { getStripePriceId, getStripeSecretKey, getStripeTrialDays } from '@/lib/env'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(getStripeSecretKey())
  }
  return _stripe
}

export type PlanKey = keyof typeof PLAN_PRICES

// priceId is a getter so env is validated at request time, never at import
// (and never at build), and production has no placeholder fallbacks.
export const PLANS = {
  monthly: {
    get priceId() {
      return getStripePriceId('monthly')
    },
    name: 'Monthly',
    price: PLAN_PRICES.monthly,
    interval: 'month' as const,
  },
  yearly: {
    get priceId() {
      return getStripePriceId('yearly')
    },
    name: 'Yearly',
    price: PLAN_PRICES.yearly,
    interval: 'year' as const,
  },
}

// Null when the price id is missing or env validation fails, so the checkout
// route can return a clear config error instead of sending a made-up price.
export function priceIdFor(plan: PlanKey): string | null {
  try {
    return PLANS[plan].priceId || null
  } catch (error) {
    console.error('Stripe price configuration error', error)
    return null
  }
}

/** Free trial length from STRIPE_TRIAL_DAYS (0 = none, including on config errors). */
export function trialDays(): number {
  try {
    return getStripeTrialDays()
  } catch {
    return 0
  }
}
