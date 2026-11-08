import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { FREE_SESSION_LIMIT } from '@/lib/premium'
import {
  countSessionsForUser,
  createSession,
  deleteSession,
  getSession,
  linkSessionToReview,
  listSessionsForUser,
} from './brewSessions'
import { createReview } from './reviews'
import { getTea } from './teas'

describe('brew sessions', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherId: number
  let teaA: number
  let teaB: number

  const infusions = [
    { seconds: 15, rating: 80, note: 'sweet' },
    { seconds: 20 },
    { seconds: 30, rating: 0 },
  ]

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherId = (await seedTestUser(db, 'other@example.com')).id
    teaA = (await seedTestTea(db, { name: 'A' })).id
    teaB = (await seedTestTea(db, { name: 'B' })).id
  })

  it('saves a session with numbered infusions in one go', async () => {
    const result = await createSession(db, userId, { teaId: teaA, method: 'gongfu', tempC: 95, gramsUsed: 5, infusions }, false)
    if (!result.ok) throw new Error('failed')
    expect(result.infusions.map((i) => [i.step, i.seconds, i.rating, i.note])).toEqual([
      [1, 15, 80, 'sweet'],
      [2, 20, null, null],
      [3, 30, 0, null],
    ])
    const loaded = await getSession(db, result.session.id, userId)
    expect(loaded?.tea.name).toBe('A')
    expect(loaded?.infusions).toHaveLength(3)
    expect(await getSession(db, result.session.id, otherId)).toBeNull()
  })

  it('validates input and writes nothing on failure', async () => {
    const bad = (input: Record<string, unknown>) =>
      createSession(db, userId, { teaId: teaA, infusions, ...input } as never, false)
    expect(await bad({ infusions: [] })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await bad({ infusions: [{ seconds: 0 }] })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ infusions: [{ seconds: 3601 }] })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ infusions: [{ seconds: 5, rating: 101 }] })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ infusions: [{ seconds: 5, note: 'x'.repeat(301) }] })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ method: 'steam' })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ tempC: 101 })).toMatchObject({ reason: 'invalid' })
    expect(await bad({ teaId: 99_999 })).toEqual({ ok: false, reason: 'tea_not_found' })
    expect(await db.$count(schema.brewSessions)).toBe(0)
    expect(await db.$count(schema.brewInfusions)).toBe(0)
  })

  it('caps free accounts, even concurrently, and leaves premium unlimited', async () => {
    const results = await Promise.all(
      Array.from({ length: FREE_SESSION_LIMIT + 3 }, () => createSession(db, userId, { teaId: teaA, infusions }, false)),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(FREE_SESSION_LIMIT)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'limit_reached', limit: FREE_SESSION_LIMIT })
    expect((await createSession(db, userId, { teaId: teaA, infusions }, true)).ok).toBe(true)
    expect(await countSessionsForUser(db, userId)).toBe(FREE_SESSION_LIMIT + 1)
    expect((await createSession(db, otherId, { teaId: teaA, infusions }, false)).ok).toBe(true)
  })

  it('lists newest first with paging and deletes only your own', async () => {
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const r = await createSession(db, userId, { teaId: teaA, infusions: [{ seconds: 10 + i }] }, true)
      if (r.ok) ids.push(r.session.id)
    }
    const page1 = await listSessionsForUser(db, userId, { limit: 2 })
    const page2 = await listSessionsForUser(db, userId, { limit: 2, offset: 2 })
    expect([...page1, ...page2].map((r) => r.session.id)).toEqual([...ids].reverse())
    expect(page1[0].infusionCount).toBe(1)

    expect(await deleteSession(db, ids[0], otherId)).toBe(false)
    expect(await deleteSession(db, ids[0], userId)).toBe(true)
    expect(await db.$count(schema.brewInfusions)).toBe(2)
  })

  it('links only to your own review of the same tea, and never changes the LeafScore', async () => {
    const mine = await createReview(db, { userId, teaId: teaA, score: 70 })
    const theirs = await createReview(db, { userId: otherId, teaId: teaA, score: 20 })
    const wrongTea = await createReview(db, { userId, teaId: teaB, score: 90 })
    const before = (await getTea(db, teaA))!.tea

    const s = await createSession(db, userId, { teaId: teaA, infusions }, true)
    if (!s.ok) throw new Error('failed')
    const id = s.session.id

    expect(await linkSessionToReview(db, id, userId, theirs.id)).toEqual({ ok: false, reason: 'review_not_found' })
    expect(await linkSessionToReview(db, id, userId, wrongTea.id)).toEqual({ ok: false, reason: 'tea_mismatch' })
    expect(await linkSessionToReview(db, id, userId, 99_999)).toEqual({ ok: false, reason: 'review_not_found' })
    expect(await linkSessionToReview(db, id, otherId, mine.id)).toEqual({ ok: false, reason: 'session_not_found' })
    expect(await linkSessionToReview(db, id, userId, mine.id)).toEqual({ ok: true })
    expect((await getSession(db, id, userId))?.session.reviewId).toBe(mine.id)

    const after = (await getTea(db, teaA))!.tea
    expect([after.leafScore, after.reviewCount]).toEqual([before.leafScore, before.reviewCount])

    expect(await linkSessionToReview(db, id, userId, null)).toEqual({ ok: true })
    expect((await getSession(db, id, userId))?.session.reviewId).toBeNull()
  })

  it('deleting the review unlinks the session; deleting the user removes it', async () => {
    const review = await createReview(db, { userId, teaId: teaA, score: 70 })
    const s = await createSession(db, userId, { teaId: teaA, infusions }, true)
    if (!s.ok) throw new Error('failed')
    await linkSessionToReview(db, s.session.id, userId, review.id)
    await db.delete(schema.reviews).where(eq(schema.reviews.id, review.id))
    expect((await getSession(db, s.session.id, userId))?.session.reviewId).toBeNull()

    await db.delete(schema.users).where(eq(schema.users.id, userId))
    expect(await db.$count(schema.brewSessions)).toBe(0)
    expect(await db.$count(schema.brewInfusions)).toBe(0)
  })

  it('the DB refuses duplicate steps and out-of-range values', async () => {
    const s = await createSession(db, userId, { teaId: teaA, infusions: [{ seconds: 5 }] }, true)
    if (!s.ok) throw new Error('failed')
    const sessionId = s.session.id
    await expect(db.insert(schema.brewInfusions).values({ sessionId, step: 1, seconds: 5 })).rejects.toThrow()
    await expect(db.insert(schema.brewInfusions).values({ sessionId, step: 2, seconds: 0 })).rejects.toThrow()
    await expect(db.insert(schema.brewInfusions).values({ sessionId, step: 2, seconds: 3601 })).rejects.toThrow()
    await expect(db.insert(schema.brewInfusions).values({ sessionId, step: 2, seconds: 5, rating: 101 })).rejects.toThrow()
  })
})
