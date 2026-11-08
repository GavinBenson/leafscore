import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { createReview } from '@/lib/data/reviews'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean } | null,
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/rateLimitGuard', () => ({ enforceRateLimit: async () => mocks.limit }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const { setReviewHelpful } = await import('./helpful')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('setReviewHelpful', () => {
  let voterId: number
  let authorId: number
  let teaId: number
  let reviewId: number

  beforeEach(async () => {
    mocks.db = await boot()
    mocks.limit = { ok: true }
    voterId = (await seedTestUser(mocks.db, 'voter@example.com')).id
    authorId = (await seedTestUser(mocks.db, 'author@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    reviewId = (await createReview(mocks.db, { userId: authorId, teaId, score: 80 })).id
    mocks.user = { id: voterId, isPremium: false }
    vi.mocked(updateTag).mockClear()
  })

  const votes = () => mocks.db.select().from(schema.reviewHelpfulVotes)

  it('sets and unsets a vote idempotently', async () => {
    const on = form({ reviewId: String(reviewId), on: '1' })
    expect(await setReviewHelpful({}, on)).toEqual({ helpful: true, count: 1 })
    expect(await setReviewHelpful({}, on)).toEqual({ helpful: true, count: 1 })
    expect(await votes()).toHaveLength(1)
    expect(updateTag).toHaveBeenCalledWith(`tea:${teaId}`)

    const off = form({ reviewId: String(reviewId), on: '0' })
    expect(await setReviewHelpful({}, off)).toEqual({ helpful: false, count: 0 })
    expect(await setReviewHelpful({}, off)).toEqual({ helpful: false, count: 0 })
    expect(await votes()).toHaveLength(0)
  })

  it('rejects your own review', async () => {
    mocks.user = { id: authorId, isPremium: false }
    const state = await setReviewHelpful({}, form({ reviewId: String(reviewId), on: '1' }))
    expect(state.error).toMatch(/own review/)
    expect(await votes()).toHaveLength(0)
  })

  it('rejects a hidden or missing review', async () => {
    await mocks.db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, reviewId))
    expect((await setReviewHelpful({}, form({ reviewId: String(reviewId), on: '1' }))).error).toBeTruthy()
    expect((await setReviewHelpful({}, form({ reviewId: '99999', on: '1' }))).error).toBeTruthy()
    expect((await setReviewHelpful({}, form({ reviewId: 'abc', on: '1' }))).error).toBeTruthy()
    expect(await votes()).toHaveLength(0)
  })

  it('rejects signed-out viewers', async () => {
    mocks.user = null
    const state = await setReviewHelpful({}, form({ reviewId: String(reviewId), on: '1' }))
    expect(state.error).toMatch(/Sign in/)
    expect(await votes()).toHaveLength(0)
  })

  it('blocks banned users', async () => {
    await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, voterId))
    const state = await setReviewHelpful({}, form({ reviewId: String(reviewId), on: '1' }))
    expect(state.error).toMatch(/restricted/)
    expect(await votes()).toHaveLength(0)
  })

  it('returns the rate limit message', async () => {
    mocks.limit = { ok: false, message: 'Too many requests.', retryAfterSeconds: 30 }
    const state = await setReviewHelpful({}, form({ reviewId: String(reviewId), on: '1' }))
    expect(state.error).toBe('Too many requests.')
    expect(await votes()).toHaveLength(0)
  })

  it('keeps the previous state on an error', async () => {
    const state = await setReviewHelpful({ helpful: true, count: 4 }, form({ reviewId: 'x', on: '1' }))
    expect(state).toMatchObject({ helpful: true, count: 4 })
  })

  it('rejects an invalid on value', async () => {
    expect((await setReviewHelpful({}, form({ reviewId: String(reviewId), on: 'maybe' }))).error).toBeTruthy()
  })
})
