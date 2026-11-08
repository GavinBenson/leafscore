import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createTestDb } from '@/db/testDb'
import { getUserById, updateUserPremium } from '@/lib/data/users'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean; email: string } | null,
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
  subs: [] as { status: string }[],
  trial: 0,
  customersCreate: vi.fn(async () => ({ id: 'cus_new' })),
  sessionsCreate: vi.fn(async (...args: unknown[]) => ({ url: 'https://stripe.test/pay', args })),
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/rateLimitGuard', () => ({ enforceRateLimit: async () => mocks.limit }))
vi.mock('@/lib/stripe', () => ({
  trialDays: () => mocks.trial,
  priceIdFor: (plan: string) => (process.env[`TEST_PRICE_${plan}`] ?? null),
  getStripe: () => ({
    customers: { create: mocks.customersCreate },
    subscriptions: { list: async () => ({ data: mocks.subs }) },
    checkout: { sessions: { create: mocks.sessionsCreate } },
  }),
}))

const { POST } = await import('./route')
const { createTestDb: boot, seedTestUser } = await import('@/db/testDb')

function req(body: unknown, raw = false) {
  return new Request('http://localhost/api/stripe/checkout', {
    method: 'POST',
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/stripe/checkout', () => {
  let userId: number

  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db)).id
    mocks.user = { id: userId, isPremium: false, email: 'test@example.com' }
    mocks.limit = { ok: true }
    mocks.subs = []
    mocks.trial = 0
    mocks.customersCreate.mockClear()
    mocks.sessionsCreate.mockClear()
    process.env.TEST_PRICE_monthly = 'price_m'
    process.env.TEST_PRICE_yearly = 'price_y'
  })

  it('requires sign-in', async () => {
    mocks.user = null
    expect((await POST(req({ plan: 'monthly' }))).status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mocks.limit = { ok: false, message: 'Too many requests.', retryAfterSeconds: 30 }
    expect((await POST(req({ plan: 'monthly' }))).status).toBe(429)
  })

  it('returns 400 for a malformed body or plan', async () => {
    expect((await POST(req('{not json', true))).status).toBe(400)
    expect((await POST(req({ plan: 'weekly' }))).status).toBe(400)
  })

  it('returns a 500 config error when the price id is missing', async () => {
    delete process.env.TEST_PRICE_monthly
    const res = await POST(req({ plan: 'monthly' }))
    expect(res.status).toBe(500)
    expect(mocks.sessionsCreate).not.toHaveBeenCalled()
  })

  it('creates and persists one customer, then a session with an idempotency key', async () => {
    const res = await POST(req({ plan: 'yearly' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://stripe.test/pay')
    expect(mocks.customersCreate).toHaveBeenCalledTimes(1)
    expect((await getUserById(mocks.db, userId))?.stripeCustomerId).toBe('cus_new')

    const [params, options] = mocks.sessionsCreate.mock.calls[0] as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ]
    expect(params.customer).toBe('cus_new')
    expect(options.idempotencyKey).toContain('checkout-')
    expect(String(params.success_url)).toContain('/settings/billing?success=true')
  })

  it('reuses an existing customer', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_old' })
    await POST(req({ plan: 'monthly' }))
    expect(mocks.customersCreate).not.toHaveBeenCalled()
    expect((mocks.sessionsCreate.mock.calls[0][0] as { customer: string }).customer).toBe('cus_old')
  })

  it('refuses with a billing url when Stripe has an active subscription', async () => {
    mocks.subs = [{ status: 'active' }]
    const res = await POST(req({ plan: 'monthly' }))
    expect(res.status).toBe(409)
    expect((await res.json()).url).toContain('/settings/billing')
    expect(mocks.sessionsCreate).not.toHaveBeenCalled()
  })

  it('allows checkout when only canceled subscriptions exist', async () => {
    mocks.subs = [{ status: 'canceled' }]
    expect((await POST(req({ plan: 'monthly' }))).status).toBe(200)
  })

  it('applies the trial to a first-time subscriber only', async () => {
    mocks.trial = 7
    await POST(req({ plan: 'monthly' }))
    expect(
      (mocks.sessionsCreate.mock.calls[0][0] as { subscription_data?: { trial_period_days: number } })
        .subscription_data,
    ).toEqual({ trial_period_days: 7 })
  })

  it('gives no trial when the customer had any earlier subscription', async () => {
    mocks.trial = 7
    mocks.subs = [{ status: 'canceled' }]
    expect((await POST(req({ plan: 'monthly' }))).status).toBe(200)
    expect(
      (mocks.sessionsCreate.mock.calls[0][0] as { subscription_data?: unknown }).subscription_data,
    ).toBeUndefined()
  })
})
