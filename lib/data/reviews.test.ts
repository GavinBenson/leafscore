import { beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import {
  createReview,
  deleteReview,
  findRecentDuplicateReview,
  getReview,
  listReviewsForTea,
  listReviewsForUser,
  updateReview,
} from './reviews'
import { getTea } from './teas'

describe('reviews', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherUserId: number
  let teaId: number
  let tagIds: number[]

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherUserId = (await seedTestUser(db, 'other@example.com')).id
    teaId = (await seedTestTea(db)).id
    const tags = await db
      .insert(schema.flavorTags)
      .values([
        { name: 'floral', category: 'aroma' },
        { name: 'smoky', category: 'aroma' },
      ])
      .returning()
    tagIds = tags.map((tag) => tag.id)
  })

  const score = async () => (await getTea(db, teaId))?.tea

  it('creating reviews saves tags and recomputes the tea score and count', async () => {
    const first = await createReview(db, { userId, teaId, score: 80 }, tagIds)
    await createReview(db, { userId: otherUserId, teaId, score: 60 })

    expect((await getReview(db, first.id))?.tags.map((tag) => tag.name).sort()).toEqual(['floral', 'smoky'])
    const tea = await score()
    expect(tea?.leafScore).toBe(70)
    expect(tea?.reviewCount).toBe(2)
  })

  it('updating changes fields, replaces tags and recomputes the score', async () => {
    const review = await createReview(db, { userId, teaId, score: 80, notes: 'old' }, [tagIds[0]])

    const updated = await updateReview(db, review.id, userId, { score: 40, notes: 'new' }, [tagIds[1]])

    expect(updated?.notes).toBe('new')
    expect((await getReview(db, review.id))?.tags.map((tag) => tag.name)).toEqual(['smoky'])
    expect((await score())?.leafScore).toBe(40)
  })

  it("updating someone else's review changes nothing", async () => {
    const review = await createReview(db, { userId, teaId, score: 80 }, [tagIds[0]])

    expect(await updateReview(db, review.id, otherUserId, { score: 1 }, [])).toBeNull()

    const unchanged = await getReview(db, review.id)
    expect(unchanged?.score).toBe(80)
    expect(unchanged?.tags).toHaveLength(1)
  })

  it('deleting removes tags, recomputes, and returns the review', async () => {
    const review = await createReview(db, { userId, teaId, score: 80, photoUrl: 'https://x/p.png' }, tagIds)

    const deleted = await deleteReview(db, review.id, userId)

    expect(deleted?.photoUrl).toBe('https://x/p.png')
    expect(await getReview(db, review.id)).toBeNull()
    expect(await db.select().from(schema.reviewTags).where(eq(schema.reviewTags.reviewId, review.id))).toEqual([])
    const tea = await score()
    expect(tea?.leafScore).toBeNull()
    expect(tea?.reviewCount).toBe(0)
  })

  it("deleting someone else's review does nothing", async () => {
    const review = await createReview(db, { userId, teaId, score: 80 })

    expect(await deleteReview(db, review.id, otherUserId)).toBeNull()
    expect(await getReview(db, review.id)).not.toBeNull()
  })

  it('lists by tea with the author, and by user with the tea and a limit', async () => {
    await createReview(db, { userId, teaId, score: 80 })
    await createReview(db, { userId, teaId, score: 70 })
    await createReview(db, { userId: otherUserId, teaId, score: 60 })

    const forTea = await listReviewsForTea(db, teaId)
    expect(forTea).toHaveLength(3)
    expect(forTea[0].user.name).toBe('Test User')

    const forUser = await listReviewsForUser(db, userId, { limit: 1 })
    expect(forUser).toHaveLength(1)
    expect(forUser[0].tea.id).toBe(teaId)
  })

  describe('findRecentDuplicateReview', () => {
    const lookup = (overrides = {}) =>
      findRecentDuplicateReview(db, { userId, teaId, score: 80, notes: 'same', ...overrides })

    it('matches an identical recent review, including null notes', async () => {
      await createReview(db, { userId, teaId, score: 80, notes: 'same' })
      await createReview(db, { userId, teaId, score: 81, notes: null })

      expect(await lookup()).not.toBeNull()
      expect(await lookup({ score: 81, notes: null })).not.toBeNull()
    })

    it('does not match different notes, score or user', async () => {
      await createReview(db, { userId, teaId, score: 80, notes: 'same' })

      expect(await lookup({ notes: 'different' })).toBeNull()
      expect(await lookup({ score: 79 })).toBeNull()
      expect(await lookup({ userId: otherUserId })).toBeNull()
    })

    it('ignores a tasting logged outside the window', async () => {
      const review = await createReview(db, { userId, teaId, score: 80, notes: 'same' })
      await db
        .update(schema.reviews)
        // Through the database clock, the same way real rows get created_at.
        .set({ createdAt: sql`now() - interval '1 hour'` })
        .where(eq(schema.reviews.id, review.id))

      expect(await lookup()).toBeNull()
    })
  })
})
