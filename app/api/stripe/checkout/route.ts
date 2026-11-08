import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getStripe, priceIdFor, trialDays, type PlanKey } from '@/lib/stripe'
import { getUserById, updateUserPremium } from '@/lib/data/users'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { siteUrl } from '@/lib/siteUrl'
import { db } from '@/db/client'

const BLOCKING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])
// Same user + plan + customer inside one window share a key, so a double click
// or a second tab gets the same Checkout session back instead of a new one.
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = await enforceRateLimit('stripe-checkout', {
    limit: 10,
    windowSeconds: 3600,
    userId: user.id,
  })
  if (!limited.ok) {
    return NextResponse.json(
      { error: limited.message },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  let plan: unknown
  try {
    plan = ((await request.json()) as { plan?: unknown } | null)?.plan
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (plan !== 'monthly' && plan !== 'yearly') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }
  const planKey: PlanKey = plan

  const priceId = priceIdFor(planKey)
  if (!priceId) {
    console.error(`Stripe price id for the ${planKey} plan is not configured`)
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 500 })
  }

  const baseUrl = siteUrl()
  const billingUrl = `${baseUrl}/settings/billing`
  const stripe = getStripe()

  try {
    const account = await getUserById(db, user.id)
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // One Stripe customer per user, saved before the session exists so a second
    // tab or a retry can't create another.
    let customerId = account.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: account.email, metadata: { userId: String(user.id) } },
        { idempotencyKey: `customer-user-${user.id}` },
      )
      customerId = customer.id
      await updateUserPremium(db, user.id, { stripeCustomerId: customerId })
    }

    // Ask Stripe rather than trusting isPremium, which lags the webhook.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    })
    if (subscriptions.data.some((s) => BLOCKING_STATUSES.has(s.status))) {
      return NextResponse.json(
        { error: 'You already have a Premium subscription.', url: billingUrl },
        { status: 409 },
      )
    }

    // A trial is for first-time subscribers only: any earlier subscription (even
    // canceled) means the customer already had their chance.
    const trial = subscriptions.data.length > 0 ? 0 : trialDays()
    const bucket =Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        metadata: { userId: String(user.id) },
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        ...(trial > 0 ? { subscription_data: { trial_period_days: trial } } : {}),
        success_url: `${billingUrl}?success=true`,
        cancel_url: billingUrl,
      },
      { idempotencyKey: `checkout-${user.id}-${planKey}-${customerId}-${bucket}` },
    )

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('checkout failed', error)
    return NextResponse.json({ error: "We couldn't start checkout." }, { status: 502 })
  }
}
