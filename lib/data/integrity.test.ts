import { beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import {
  DuplicateReviewError,
  createReview,
  deleteReview,
  findReviewByUserAndTea,
  listReviewsForTea,
  listReviewsForUser,
  updateReview,
} from './reviews'
import { getTea, recalcLeafScore } from './teas'
import { hasPublicScore, MIN_REVIEWS_FOR_SCORE, displayScore } from '@/lib/scoring'
import { parseReviewForm } from '@/lib/validation/review'

describe('review integrity and atomic writes', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherUserId: number
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherUserId = (await seedTestUser(db, 'other@example.com')).id
    teaId = (await seedTestTea(db)).id
  })

  const tea = async () => (await getTea(db, teaId))!.tea

  it('a second review of the same tea by the same user fails with a typed error', async () => {
    await createReview(db, { userId, teaId, score: 80 })

    await expect(createReview(db, { userId, teaId, score: 10 })).rejects.toBeInstanceOf(DuplicateReviewError)

    const t = await tea()
    expect(t.reviewCount).toBe(1)
    expect(t.leafScore).toBe(80)
    expect((await findReviewByUserAndTea(db, userId, teaId))?.score).toBe(80)
    expect(await findReviewByUserAndTea(db, otherUserId, teaId)).toBeNull()
  })

  it('the unique index itself rejects a raw duplicate insert', async () => {
    await createReview(db, { userId, teaId, score: 80 })
    await expect(db.insert(schema.reviews).values({ userId, teaId, score: 5 })).rejects.toThrow()
  })

  it('concurrent creates by the same user produce exactly one review', async () => {
    const results = await Promise.allSettled([
      createReview(db, { userId, teaId, score: 90 }),
      createReview(db, { userId, teaId, score: 20 }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(DuplicateReviewError)
    expect((await tea()).reviewCount).toBe(1)
  })

  it('concurrent reviews from many users leave the stored score and count correct', async () => {
    const users = [userId, otherUserId]
    for (let i = 0; i < 6; i++) users.push((await seedTestUser(db, `u${i}@example.com`)).id)
    await Promise.all(users.map((id, i) => createReview(db, { userId: id, teaId, score: 10 * (i + 1) })))

    const t = await tea()
    expect(t.reviewCount).toBe(8)
    expect(t.leafScore).toBe(45)
  })

  it('a failure midway (bad tag) rolls back the review and the score', async () => {
    await createReview(db, { userId: otherUserId, teaId, score: 60 })

    await expect(createReview(db, { userId, teaId, score: 100 }, [99999])).rejects.toThrow()

    expect(await findReviewByUserAndTea(db, userId, teaId)).toBeNull()
    const t = await tea()
    expect(t.reviewCount).toBe(1)
    expect(t.leafScore).toBe(60)
  })

  it('a failed update leaves the old tags, fields and score intact', async () => {
    const [tag] = await db.insert(schema.flavorTags).values({ name: 'floral', category: 'aroma' }).returning()
    const review = await createReview(db, { userId, teaId, score: 80, notes: 'old' }, [tag.id])

    await expect(updateReview(db, review.id, userId, { score: 10, notes: 'new' }, [99999])).rejects.toThrow()

    const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.id, review.id))
    expect(rows[0].score).toBe(80)
    expect(rows[0].notes).toBe('old')
    expect(await db.select().from(schema.reviewTags)).toHaveLength(1)
    expect((await tea()).leafScore).toBe(80)
  })

  it('the CHECK constraint matches the form validation range', async () => {
    await expect(createReview(db, { userId, teaId, score: 101 })).rejects.toThrow()
    await expect(createReview(db, { userId, teaId, score: -1 })).rejects.toThrow()
    await createReview(db, { userId, teaId, score: 0 })
    await createReview(db, { userId: otherUserId, teaId, score: 100 })

    const form = (score: string) => {
      const data = new FormData()
      data.set('teaId', '1')
      data.set('score', score)
      return parseReviewForm(data).ok
    }
    expect(form('100')).toBe(true)
    expect(form('101')).toBe(false)
  })

  it('recalcLeafScore is the plain average of visible reviews, null/0 when none', async () => {
    await recalcLeafScore(db, teaId)
    expect(await tea()).toMatchObject({ leafScore: null, reviewCount: 0 })

    const a = await createReview(db, { userId, teaId, score: 100 })
    await createReview(db, { userId: otherUserId, teaId, score: 51 })
    expect((await tea()).leafScore).toBe(75.5)

    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, a.id))
    await recalcLeafScore(db, teaId)
    expect(await tea()).toMatchObject({ leafScore: 51, reviewCount: 1 })

    await deleteReview(db, a.id, userId)
    expect((await tea()).reviewCount).toBe(1)
  })

  it('hidden reviews are excluded from public lists but available to the author on request', async () => {
    const review = await createReview(db, { userId, teaId, score: 80 })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, review.id))

    expect(await listReviewsForTea(db, teaId)).toHaveLength(0)
    expect(await listReviewsForUser(db, userId)).toHaveLength(0)
    const own = await listReviewsForUser(db, userId, { includeHidden: true })
    expect(own).toHaveLength(1)
    expect(own[0].review.hidden).toBe(true)
  })

  it('has a minimum review count before a score is public', () => {
    expect(MIN_REVIEWS_FOR_SCORE).toBe(3)
    expect(hasPublicScore(null)).toBe(false)
    expect(hasPublicScore(undefined)).toBe(false)
    expect(hasPublicScore(2)).toBe(false)
    expect(hasPublicScore(3)).toBe(true)
    expect(displayScore(90, 2)).toBeNull()
    expect(displayScore(90, 3)).toBe(90)
    expect(displayScore(null, 5)).toBeNull()
  })

  it('creates trigram-searchable indexes (pg_trgm loaded)', async () => {
    await seedTestTea(db, { name: 'Dragon Well' })
    const rows = await db.execute(sql`select name from teas where name % 'dragon wel' limit 5`)
    expect((Array.isArray(rows) ? rows : rows.rows).length).toBeGreaterThan(0)
  })
})
