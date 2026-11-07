import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type Stripe from 'stripe'
import * as schema from '@/db/schema'
import { getUserByStripeCustomerId, updateUserPremium } from '@/lib/data/users'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type RetrieveSubscription = (id: string) => Promise<Stripe.Subscription>

// past_due keeps access while Stripe retries the card. If retries run out the
// subscription moves to canceled or unpaid, which fires another event.
const PREMIUM_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'active',
  'trialing',
  'past_due',
])

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null)

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end)
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null
}

// Reads the subscription from Stripe rather than from the event, because events
// can arrive out of order and an old payload must not overwrite newer state.
async function syncSubscription(
  db: Db,
  subscriptionId: string,
  retrieve: RetrieveSubscription,
  knownUserId?: number,
) {
  const subscription = await retrieve(subscriptionId)
  const customerId = idOf(subscription.customer)
  if (!customerId) return null

  const userId = knownUserId ?? (await getUserByStripeCustomerId(db, customerId))?.id
  if (!userId) {
    // Normal when this beats checkout.session.completed, which links the customer.
    console.warn(`Stripe subscription ${subscription.id}: no user for customer ${customerId}`)
    return null
  }

  const isPremium = PREMIUM_STATUSES.has(subscription.status)
  await updateUserPremium(db, userId, {
    isPremium,
    stripeCustomerId: customerId,
    premiumExpiresAt: isPremium ? periodEnd(subscription) : null,
    // Paid up (or gone): nothing left to warn about. past_due keeps the warning.
    ...(subscription.status === 'past_due' ? {} : { paymentFailedAt: null }),
  })

  return userId
}

async function applyEvent(db: Db, event: Stripe.Event, retrieve: RetrieveSubscription) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = Number(session.metadata?.userId)
      const subscriptionId = idOf(session.subscription)
      if (!Number.isSafeInteger(userId) || userId < 1 || !subscriptionId) {
        console.warn(`Stripe checkout ${session.id}: missing user or subscription`)
        return
      }
      await syncSubscription(db, subscriptionId, retrieve, userId)
      return
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscription(db, event.data.object.id, retrieve)
      return
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
      if (!subscriptionId) return
      const userId = await syncSubscription(db, subscriptionId, retrieve)
      if (userId) {
        await updateUserPremium(db, userId, { paymentFailedAt: new Date(event.created * 1000) })
      }
      return
    }
  }
}

export async function handleStripeEvent(
  db: Db,
  event: Stripe.Event,
  retrieve: RetrieveSubscription,
): Promise<'processed' | 'duplicate'> {
  const claimed = await db
    .insert(schema.stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: schema.stripeEvents.id })

  if (claimed.length === 0) return 'duplicate'

  try {
    await applyEvent(db, event, retrieve)
  } catch (error) {
    // Release the claim so Stripe's retry can run it again.
    await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id))
    throw error
  }

  return 'processed'
}
