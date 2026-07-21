import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
})

export const PLANS = {
  monthly: {
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? 'price_monthly',
    name: 'Monthly',
    price: 5,
    interval: 'month' as const,
  },
  yearly: {
    priceId: process.env.STRIPE_YEARLY_PRICE_ID ?? 'price_yearly',
    name: 'Yearly',
    price: 40,
    interval: 'year' as const,
  },
}
