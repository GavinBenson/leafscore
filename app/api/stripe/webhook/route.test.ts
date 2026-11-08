import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createTestDb } from '@/db/testDb'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  secret: 'whsec_test' as string | null,
  construct: vi.fn(),
  retrieve: vi.fn(),
}))
vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/env', () => ({
  getStripeWebhookSecret: () => {
    if (mocks.secret === null) throw new Error('Invalid environment configuration: STRIPE_WEBHOOK_SECRET is required')
    return mocks.secret
  },
}))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mocks.construct },
    subscriptions: { retrieve: mocks.retrieve },
  }),
}))

const { POST } = await import('./route')
const { createTestDb: boot, seedTestUser } = await import('@/db/testDb')

function req(signature: string | null = 'sig') {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers: signature ? { 'stripe-signature': signature } : {},
  }) as unknown as import('next/server').NextRequest
}

const sub = (customer: string) => ({
  id: 'sub_1',
  customer,
  status: 'active',
  items: { data: [{ current_period_end: 1_900_000_000 }] },
})

describe('POST /api/stripe/webhook', () => {
  beforeEach(async () => {
    mocks.db = await boot()
    mocks.secret = 'whsec_test'
    mocks.construct.mockReset()
    mocks.retrieve.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns a generic 500 when the secret is not configured', async () => {
    mocks.secret = null
    const res = await POST(req())
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('STRIPE_WEBHOOK_SECRET')
    expect(mocks.construct).not.toHaveBeenCalled()
  })

  it('returns 400 without a signature header', async () => {
    expect((await POST(req(null))).status).toBe(400)
  })

  it('returns 400 for a bad signature and passes the configured secret', async () => {
    mocks.construct.mockImplementation(() => {
      throw new Error('bad sig')
    })
    expect((await POST(req('nope'))).status).toBe(400)
    expect(mocks.construct).toHaveBeenCalledWith('{}', 'nope', 'whsec_test')
  })

  it('returns 500 for an unlinked customer so Stripe retries (retryable error)', async () => {
    mocks.construct.mockReturnValue({
      id: 'evt_u', type: 'customer.subscription.updated', created: 1, data: { object: { id: 'sub_1' } },
    })
    mocks.retrieve.mockResolvedValue(sub('cus_unknown'))
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Webhook handler failed' })
  })

  it('returns 500 on any other throw', async () => {
    mocks.construct.mockReturnValue({
      id: 'evt_x', type: 'customer.subscription.updated', created: 1, data: { object: { id: 'sub_1' } },
    })
    mocks.retrieve.mockRejectedValue(new Error('stripe down'))
    expect((await POST(req())).status).toBe(500)
  })

  it('processes once, then answers 200 duplicate', async () => {
    const user = await seedTestUser(mocks.db)
    mocks.construct.mockReturnValue({
      id: 'evt_ok',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: { id: 'cs_1', metadata: { userId: String(user.id) }, subscription: 'sub_1' } },
    })
    mocks.retrieve.mockResolvedValue(sub('cus_1'))
    const first = await POST(req())
    expect(first.status).toBe(200)
    expect((await first.json()).result).toBe('processed')
    const second = await POST(req())
    expect(second.status).toBe(200)
    expect((await second.json()).result).toBe('duplicate')
  })
})
