import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createTestDb, seedTestUser } from '@/db/testDb'
import { getUserById, updateUserPremium } from '@/lib/data/users'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { handleStripeEvent, RetryableWebhookError, type RetrieveSubscription } from './stripeWebhook'

const PERIOD_END = 1_900_000_000

function subscription(status: Stripe.Subscription.Status, customer = 'cus_1', end = PERIOD_END) {
  return {
    id: 'sub_1',
    customer,
    status,
    items: { data: [{ current_period_end: end }] },
  } as unknown as Stripe.Subscription
}

let nextEvent = 1
function event(type: string, object: unknown, id = `evt_${nextEvent++}`) {
  return { id, type, created: 1_800_000_000, data: { object } } as unknown as Stripe.Event
}

const checkout = (userId: number) =>
  event('checkout.session.completed', {
    id: 'cs_1',
    metadata: { userId: String(userId) },
    subscription: 'sub_1',
  })

describe('handleStripeEvent', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
  })

  const returning = (sub: Stripe.Subscription): RetrieveSubscription =>
    vi.fn(async () => sub)

  it('checkout turns premium on, links the customer and sets the expiry', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))

    const user = await getUserById(db, userId)
    expect(user?.isPremium).toBe(true)
    expect(user?.stripeCustomerId).toBe('cus_1')
    expect(user?.premiumExpiresAt).toEqual(new Date(PERIOD_END * 1000))
  })

  it('subscription.updated moves the expiry on renewal', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))
    const renewed = PERIOD_END + 86_400 * 30
    await handleStripeEvent(
      db,
      event('customer.subscription.updated', { id: 'sub_1' }),
      returning(subscription('active', 'cus_1', renewed)),
    )

    expect((await getUserById(db, userId))?.premiumExpiresAt).toEqual(new Date(renewed * 1000))
  })

  it('uses current state from Stripe, so a late event cannot revive a canceled plan', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))
    await handleStripeEvent(
      db,
      event('customer.subscription.updated', { id: 'sub_1', status: 'active' }),
      returning(subscription('canceled')),
    )

    const user = await getUserById(db, userId)
    expect(user?.isPremium).toBe(false)
    expect(user?.premiumExpiresAt).toBeNull()
  })

  it('subscription.deleted removes premium', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))
    await handleStripeEvent(
      db,
      event('customer.subscription.deleted', { id: 'sub_1' }),
      returning(subscription('canceled')),
    )

    expect((await getUserById(db, userId))?.isPremium).toBe(false)
  })

  it('payment_failed keeps access, records the failure, and recovery clears it', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))
    await handleStripeEvent(
      db,
      event('invoice.payment_failed', { parent: { subscription_details: { subscription: 'sub_1' } } }),
      returning(subscription('past_due')),
    )

    let user = await getUserById(db, userId)
    expect(user?.isPremium).toBe(true)
    expect(user?.paymentFailedAt).toEqual(new Date(1_800_000_000 * 1000))

    await handleStripeEvent(
      db,
      event('customer.subscription.updated', { id: 'sub_1' }),
      returning(subscription('active')),
    )
    user = await getUserById(db, userId)
    expect(user?.isPremium).toBe(true)
    expect(user?.paymentFailedAt).toBeNull()
  })

  it('acknowledges events for a deleted customer instead of retrying forever', async () => {
    const gone = { ...subscription('canceled', 'cus_gone'), customer: { id: 'cus_gone', object: 'customer', deleted: true } }
    const ev = event('customer.subscription.deleted', { id: 'sub_1' })
    expect(await handleStripeEvent(db, ev, returning(gone as unknown as Stripe.Subscription))).toBe('processed')
    const [row] = await db.select().from(schema.stripeEvents).where(eq(schema.stripeEvents.id, ev.id))
    expect(row.processedAt).toBeInstanceOf(Date)
  })

  it('acknowledges events whose customer metadata points at a deleted user', async () => {
    const orphan = {
      ...subscription('canceled', 'cus_orphan'),
      customer: { id: 'cus_orphan', object: 'customer', metadata: { userId: '999999' } },
    }
    expect(
      await handleStripeEvent(db, event('customer.subscription.deleted', { id: 'sub_1' }), returning(orphan as unknown as Stripe.Subscription)),
    ).toBe('processed')
  })

  it('still retries when the customer belongs to an existing user that is not linked yet', async () => {
    const racing = {
      ...subscription('active', 'cus_race'),
      customer: { id: 'cus_race', object: 'customer', metadata: { userId: String(userId) } },
    }
    await expect(
      handleStripeEvent(db, event('customer.subscription.updated', { id: 'sub_1' }), returning(racing as unknown as Stripe.Subscription)),
    ).rejects.toBeInstanceOf(RetryableWebhookError)
  })

  it('a late payment_failed event does not re-flag a recovered subscription', async () => {
    await handleStripeEvent(db, checkout(userId), returning(subscription('active')))
    await handleStripeEvent(
      db,
      event('invoice.payment_failed', { parent: { subscription_details: { subscription: 'sub_1' } } }),
      returning(subscription('active')),
    )
    expect((await getUserById(db, userId))?.paymentFailedAt).toBeNull()
  })

  it('ignores a repeated event', async () => {
    const retrieve = returning(subscription('active'))
    const repeated = checkout(userId)

    expect(await handleStripeEvent(db, repeated, retrieve)).toBe('processed')
    expect(await handleStripeEvent(db, repeated, retrieve)).toBe('duplicate')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })

  it('keeps an unprocessed claim on failure so a retry runs again', async () => {
    const repeated = checkout(userId)
    await expect(
      handleStripeEvent(db, repeated, vi.fn(async () => { throw new Error('Stripe down') })),
    ).rejects.toThrow('Stripe down')
    expect((await getUserById(db, userId))?.isPremium).toBe(false)
    const [claim] = await db.select().from(schema.stripeEvents).where(eq(schema.stripeEvents.id, repeated.id))
    expect(claim.processedAt).toBeNull()

    expect(await handleStripeEvent(db, repeated, returning(subscription('active')))).toBe('processed')
    expect((await getUserById(db, userId))?.isPremium).toBe(true)
    const [done] = await db.select().from(schema.stripeEvents).where(eq(schema.stripeEvents.id, repeated.id))
    expect(done.processedAt).toBeInstanceOf(Date)
  })

  it('throws a retryable error for an unlinked customer and processes it once linked', async () => {
    const failed = event('invoice.payment_failed', { parent: { subscription_details: { subscription: 'sub_1' } } })
    await expect(handleStripeEvent(db, failed, returning(subscription('past_due')))).rejects.toBeInstanceOf(
      RetryableWebhookError,
    )
    const [claim] = await db.select().from(schema.stripeEvents).where(eq(schema.stripeEvents.id, failed.id))
    expect(claim.processedAt).toBeNull()

    await updateUserPremium(db, userId, { stripeCustomerId: 'cus_1' })
    expect(await handleStripeEvent(db, failed, returning(subscription('past_due')))).toBe('processed')
    expect((await getUserById(db, userId))?.paymentFailedAt).toEqual(new Date(1_800_000_000 * 1000))
  })

  it('subscription.updated for an unlinked customer is also retryable', async () => {
    await expect(
      handleStripeEvent(db, event('customer.subscription.updated', { id: 'sub_1' }), returning(subscription('active', 'cus_unknown'))),
    ).rejects.toBeInstanceOf(RetryableWebhookError)
  })

  it('does not fail on an unhandled event type', async () => {
    await expect(
      handleStripeEvent(db, event('customer.created', { id: 'cus_2' }), returning(subscription('active'))),
    ).resolves.toBe('processed')
  })

  it('stores cancel_at_period_end and clears it on renewal or cancellation', async () => {
    const canceling = { ...subscription('active'), cancel_at_period_end: true } as Stripe.Subscription
    await handleStripeEvent(db, checkout(userId), returning(canceling))
    expect((await getUserById(db, userId))?.cancelAtPeriodEnd).toBe(true)

    await handleStripeEvent(
      db,
      event('customer.subscription.updated', { id: 'sub_1' }),
      returning({ ...subscription('active'), cancel_at_period_end: false } as Stripe.Subscription),
    )
    expect((await getUserById(db, userId))?.cancelAtPeriodEnd).toBe(false)

    await handleStripeEvent(
      db,
      event('customer.subscription.updated', { id: 'sub_1' }),
      returning({ ...subscription('active'), cancel_at: 1_900_000_000 } as unknown as Stripe.Subscription),
    )
    expect((await getUserById(db, userId))?.cancelAtPeriodEnd).toBe(true)

    await handleStripeEvent(
      db,
      event('customer.subscription.deleted', { id: 'sub_1' }),
      returning({ ...subscription('canceled'), cancel_at_period_end: true } as Stripe.Subscription),
    )
    expect((await getUserById(db, userId))?.cancelAtPeriodEnd).toBe(false)
  })

  it('leaves other users alone', async () => {
    await updateUserPremium(db, userId, { stripeCustomerId: 'cus_other', isPremium: true })
    const other = await seedTestUser(db, 'linked@example.com')
    await updateUserPremium(db, other.id, { stripeCustomerId: 'cus_1' })
    await handleStripeEvent(
      db,
      event('customer.subscription.deleted', { id: 'sub_1' }),
      returning(subscription('canceled', 'cus_1')),
    )
    expect((await getUserById(db, userId))?.isPremium).toBe(true)
  })
})
