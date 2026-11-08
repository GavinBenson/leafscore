import { eq, isNull, and } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type Stripe from 'stripe'
import * as schema from '@/db/schema'
import { getUserById, getUserByStripeCustomerId, updateUserPremium } from '@/lib/data/users'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type RetrieveSubscription = (id: string) => Promise<Stripe.Subscription>

// past_due keeps access while Stripe retries the card. If retries run out the
// subscription moves to canceled or unpaid, which fires another event.
const PREMIUM_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'active',
  'trialing',
  'past_due',
])

// The event can't be handled yet but may succeed later (e.g. the customer isn't
// linked to a user). The webhook route turns any thrown error into a 500, so Stripe retries.
export class RetryableWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableWebhookError'
  }
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null)

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end)
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null
}

// True when no user holds this customer id and none ever will: the customer was
// deleted in Stripe (account deletion removes it), or it was created for a user
// that no longer exists. Needs the customer expanded on the subscription; with a
// bare id we can't tell, so the event stays retryable.
async function customerIsGone(db: Db, customer: Stripe.Subscription['customer']): Promise<boolean> {
  if (typeof customer === 'string') return false
  if ('deleted' in customer && customer.deleted) return true
  const userId = Number(customer.metadata?.userId)
  if (!Number.isSafeInteger(userId) || userId < 1) return false
  return (await getUserById(db, userId)) === null
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
  if (!userId && (await customerIsGone(db, subscription.customer))) {
    console.warn(`Stripe subscription ${subscription.id}: customer ${customerId} has no user (deleted account); ignoring`)
    return null
  }
  if (!userId) {
    // Normal when this beats checkout.session.completed, which links the customer.
    // Fail so the event isn't marked processed and Stripe retries it later.
    throw new RetryableWebhookError(
      `Stripe subscription ${subscription.id}: no user for customer ${customerId} yet`,
    )
  }

  const isPremium = PREMIUM_STATUSES.has(subscription.status)
  await updateUserPremium(db, userId, {
    isPremium,
    stripeCustomerId: customerId,
    premiumExpiresAt: isPremium ? periodEnd(subscription) : null,
    // Either flag means access ends at the period end rather than renewing.
    cancelAtPeriodEnd: isPremium && (subscription.cancel_at_period_end || subscription.cancel_at != null),
    // Paid up (or gone): nothing left to warn about. past_due keeps the warning.
    ...(subscription.status === 'past_due' ? {} : { paymentFailedAt: null }),
  })

  return { userId, status: subscription.status }
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
      const synced = await syncSubscription(db, subscriptionId, retrieve)
      // Only warn while Stripe still says the payment is outstanding: a late or
      // retried event for a subscription that has since recovered must not.
      if (synced && (synced.status === 'past_due' || synced.status === 'unpaid')) {
        await updateUserPremium(db, synced.userId, { paymentFailedAt: new Date(event.created * 1000) })
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
  // The claim row is created unprocessed. processed_at is set only after the
  // event was handled, so a crash in between leaves a claim that the retry
  // picks up again instead of reporting it as a duplicate.
  await db
    .insert(schema.stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()

  const [claim] = await db
    .select({ processedAt: schema.stripeEvents.processedAt })
    .from(schema.stripeEvents)
    .where(eq(schema.stripeEvents.id, event.id))
  if (claim?.processedAt) return 'duplicate'

  // Handlers are idempotent (they re-read the subscription from Stripe), so a
  // rare concurrent redelivery running twice is harmless.
  await applyEvent(db, event, retrieve)

  await db
    .update(schema.stripeEvents)
    .set({ processedAt: new Date() })
    .where(and(eq(schema.stripeEvents.id, event.id), isNull(schema.stripeEvents.processedAt)))

  return 'processed'
}
