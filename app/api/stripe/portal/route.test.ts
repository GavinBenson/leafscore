import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createTestDb } from '@/db/testDb'
import { updateUserPremium } from '@/lib/data/users'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number } | null,
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
  portal: vi.fn(async (...args: unknown[]) => { void args; return { url: 'https://stripe.test/portal' } }),
}))
vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/rateLimitGuard', () => ({ enforceRateLimit: async () => mocks.limit }))
vi.mock('@/lib/siteUrl', () => ({ siteUrl: () => 'http://localhost:3000' }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ billingPortal: { sessions: { create: mocks.portal } } }) }))

const { POST } = await import('./route')
const { createTestDb: boot, seedTestUser } = await import('@/db/testDb')

describe('POST /api/stripe/portal', () => {
  let userId: number
  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db)).id
    mocks.user = { id: userId }
    mocks.limit = { ok: true }
    mocks.portal.mockClear()
  })

  it('redirects a signed-out user to sign in', async () => {
    mocks.user = null
    const res = await POST()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/signin')
  })

  it('redirects to billing with error=rate when limited', async () => {
    mocks.limit = { ok: false, message: 'x', retryAfterSeconds: 5 }
    const res = await POST()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/settings/billing?error=rate')
    expect(mocks.portal).not.toHaveBeenCalled()
  })

  it('goes back to billing when there is no Stripe customer', async () => {
    const res = await POST()
    expect(res.headers.get('location')).toBe('http://localhost:3000/settings/billing')
    expect(mocks.portal).not.toHaveBeenCalled()
  })

  it('redirects to the portal for a linked customer, and to error=portal on failure', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    expect((await POST()).headers.get('location')).toBe('https://stripe.test/portal')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.portal.mockRejectedValueOnce(new Error('boom'))
    expect((await POST()).headers.get('location')).toContain('error=portal')
  })
})
