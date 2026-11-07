import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createTestDb, seedTestUser } from '@/db/testDb'
import { getUserById, updateUserPremium } from '@/lib/data/users'
import { handleStripeEvent, type RetrieveSubscription } from './stripeWebhook'

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

  it('ignores a repeated event', async () => {
    const retrieve = returning(subscription('active'))
    const repeated = checkout(userId)

    expect(await handleStripeEvent(db, repeated, retrieve)).toBe('processed')
    expect(await handleStripeEvent(db, repeated, retrieve)).toBe('duplicate')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })

  it('releases the claim on failure so a retry can succeed', async () => {
    const repeated = checkout(userId)
    await expect(
      handleStripeEvent(db, repeated, vi.fn(async () => { throw new Error('Stripe down') })),
    ).rejects.toThrow('Stripe down')
    expect((await getUserById(db, userId))?.isPremium).toBe(false)

    expect(await handleStripeEvent(db, repeated, returning(subscription('active')))).toBe('processed')
    expect((await getUserById(db, userId))?.isPremium).toBe(true)
  })

  it('does not fail on an unknown customer or an unhandled event type', async () => {
    const retrieve = returning(subscription('active', 'cus_unknown'))
    await expect(
      handleStripeEvent(db, event('customer.subscription.updated', { id: 'sub_1' }), retrieve),
    ).resolves.toBe('processed')
    await expect(
      handleStripeEvent(db, event('customer.created', { id: 'cus_2' }), retrieve),
    ).resolves.toBe('processed')
    expect((await getUserById(db, userId))?.isPremium).toBe(false)
  })

  it('leaves other users alone', async () => {
    await updateUserPremium(db, userId, { stripeCustomerId: 'cus_other', isPremium: true })
    await handleStripeEvent(
      db,
      event('customer.subscription.deleted', { id: 'sub_1' }),
      returning(subscription('canceled', 'cus_1')),
    )
    expect((await getUserById(db, userId))?.isPremium).toBe(true)
  })
})
