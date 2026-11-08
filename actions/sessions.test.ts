import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
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
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))

const { deleteSessionAction, hasReviewForTea, saveSession, setSessionReviewLink } = await import('./sessions')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

const infusions = (n = 2) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ seconds: 20 + i * 5, rating: 70, note: `step ${i + 1}` })))

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('session actions', () => {
  let userId: number
  let otherId: number
  let teaId: number
  let otherTeaId: number

  beforeEach(async () => {
    mocks.db = await boot()
    mocks.limit = { ok: true }
    userId = (await seedTestUser(mocks.db, 'a@example.com')).id
    otherId = (await seedTestUser(mocks.db, 'b@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    otherTeaId = (await seedTestTea(mocks.db, { name: 'Other' })).id
    mocks.user = { id: userId, isPremium: false }
  })

  const sessions = () => mocks.db.select().from(schema.brewSessions)
  const save = (extra: Record<string, string> = {}) =>
    saveSession({}, form({ teaId: String(teaId), infusions: infusions(), ...extra }))

  describe('saveSession', () => {
    it('saves a session with infusions and redirects to it', async () => {
      await expect(save({ method: 'gongfu', temp: '95', weight: '5' })).rejects.toThrow(/^REDIRECT:\/sessions\/\d+$/)
      const [row] = await sessions()
      expect(row).toMatchObject({ userId, teaId, method: 'gongfu', tempC: 95, gramsUsed: 5, reviewId: null })
      const infs = await mocks.db.select().from(schema.brewInfusions)
      expect(infs.map((i) => i.step).sort()).toEqual([1, 2])
    })

    it('converts Fahrenheit and ounces from the saved preference to celsius and grams', async () => {
      await mocks.db.update(schema.users).set({ tempUnit: 'f', weightUnit: 'oz' }).where(eq(schema.users.id, userId))
      await expect(save({ temp: '203', weight: '0.2' })).rejects.toThrow(/REDIRECT/)
      const [row] = await sessions()
      expect(row.tempC).toBe(95)
      expect(row.gramsUsed).toBe(6)
    })

    it('rejects an out of range temperature and bad infusions as state', async () => {
      expect((await save({ temp: '150' })).message).toMatch(/Temperature/)
      expect((await save({ temp: 'hot' })).message).toMatch(/Temperature/)
      expect((await save({ infusions: 'nope' })).message).toMatch(/infusion/)
      expect((await save({ infusions: JSON.stringify([{ seconds: 0 }]) })).message).toMatch(/seconds/)
      expect(await sessions()).toHaveLength(0)
    })

    it('caps free accounts at 3 with an upgrade hint, Premium is unlimited', async () => {
      for (let i = 0; i < 3; i++) await expect(save()).rejects.toThrow(/REDIRECT/)
      const state = await save()
      expect(state.upgrade).toBe(true)
      expect(state.message).toMatch(/3 saved sessions/)
      expect(await sessions()).toHaveLength(3)

      mocks.user = { id: userId, isPremium: true }
      await expect(save()).rejects.toThrow(/REDIRECT/)
      expect(await sessions()).toHaveLength(4)
    })

    it('does not touch the LeafScore or review count', async () => {
      await createReview(mocks.db, { userId: otherId, teaId, score: 90 })
      const read = async () => (await mocks.db.select().from(schema.teas).where(eq(schema.teas.id, teaId)))[0]
      const before = await read()
      await expect(save()).rejects.toThrow(/REDIRECT/)
      const after = await read()
      expect(after.reviewCount).toBe(before.reviewCount)
      expect(after.leafScore).toBe(before.leafScore)
    })

    it('links only the owner\'s own review of the same tea', async () => {
      const mine = await createReview(mocks.db, { userId, teaId, score: 80 })
      await createReview(mocks.db, { userId: otherId, teaId: otherTeaId, score: 60 })
      await expect(save({ linkReview: '1' })).rejects.toThrow(/REDIRECT/)
      expect((await sessions())[0].reviewId).toBe(mine.id)
      // No review of this tea: the checkbox is ignored, the session still saves.
      await expect(
        saveSession({}, form({ teaId: String(otherTeaId), infusions: infusions(), linkReview: '1' })),
      ).rejects.toThrow(/REDIRECT/)
      expect((await sessions())[1].reviewId).toBeNull()
    })

    it('rejects signed-out, banned and rate limited requests', async () => {
      mocks.user = null
      expect((await save()).message).toMatch(/Sign in/)
      mocks.user = { id: userId, isPremium: false }
      mocks.limit = { ok: false, message: 'Too many requests.', retryAfterSeconds: 5 }
      expect((await save()).message).toBe('Too many requests.')
      mocks.limit = { ok: true }
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect((await save()).message).toMatch(/restricted/)
      expect(await sessions()).toHaveLength(0)
    })

    it('reports an unknown tea', async () => {
      expect((await saveSession({}, form({ teaId: '99999', infusions: infusions() }))).message).toMatch(/tea/)
      expect((await saveSession({}, form({ infusions: infusions() }))).message).toBe('Choose a tea.')
    })
  })

  describe('deleteSessionAction', () => {
    async function seedSession(owner: number) {
      const [s] = await mocks.db.insert(schema.brewSessions).values({ userId: owner, teaId }).returning()
      await mocks.db.insert(schema.brewInfusions).values({ sessionId: s.id, step: 1, seconds: 20 })
      return s.id
    }

    it('deletes the owner\'s session and its infusions', async () => {
      const id = await seedSession(userId)
      await expect(deleteSessionAction({}, form({ sessionId: String(id) }))).rejects.toThrow('REDIRECT:/sessions?deleted=1')
      expect(await sessions()).toHaveLength(0)
      expect(await mocks.db.select().from(schema.brewInfusions)).toHaveLength(0)
    })

    it('refuses someone else\'s session', async () => {
      const id = await seedSession(otherId)
      expect((await deleteSessionAction({}, form({ sessionId: String(id) }))).message).toMatch(/couldn't find/)
      expect(await sessions()).toHaveLength(1)
    })

    it('requires sign in', async () => {
      mocks.user = null
      expect((await deleteSessionAction({}, form({ sessionId: '1' }))).message).toMatch(/Sign in/)
    })
  })

  describe('setSessionReviewLink and hasReviewForTea', () => {
    it('links and unlinks the owner\'s review, refusing others', async () => {
      const mine = await createReview(mocks.db, { userId, teaId, score: 80 })
      const theirs = await createReview(mocks.db, { userId: otherId, teaId, score: 60 })
      const [s] = await mocks.db.insert(schema.brewSessions).values({ userId, teaId }).returning()
      const link = (reviewId: number, on: string) =>
        setSessionReviewLink({}, form({ sessionId: String(s.id), reviewId: String(reviewId), link: on }))

      expect(await link(mine.id, '1')).toEqual({})
      expect((await sessions())[0].reviewId).toBe(mine.id)
      expect((await link(theirs.id, '1')).message).toMatch(/own review/)
      expect((await sessions())[0].reviewId).toBe(mine.id)
      expect(await link(mine.id, '0')).toEqual({})
      expect((await sessions())[0].reviewId).toBeNull()

      mocks.user = { id: otherId, isPremium: false }
      expect((await link(theirs.id, '1')).message).toMatch(/couldn't find/)
    })

    it('hasReviewForTea reflects the signed-in user\'s own review', async () => {
      expect(await hasReviewForTea(teaId)).toBe(false)
      await createReview(mocks.db, { userId, teaId, score: 80 })
      expect(await hasReviewForTea(teaId)).toBe(true)
      expect(await hasReviewForTea(otherTeaId)).toBe(false)
      expect(await hasReviewForTea(-1)).toBe(false)
    })
  })
})
