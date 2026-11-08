import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { helpfulCountsForReviews, setHelpful, toggleHelpful, viewerVotes } from './helpful'
import { createReview, deleteReview, listReviewsForTea } from './reviews'
import { getTeaWithDetails } from './teas'
import { createReport, resolveReport } from './reports'

describe('review helpfulness', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let author: number
  let voterA: number
  let voterB: number
  let teaId: number
  let reviewId: number

  beforeEach(async () => {
    db = await createTestDb()
    author = (await seedTestUser(db, 'author@example.com')).id
    voterA = (await seedTestUser(db, 'a@example.com')).id
    voterB = (await seedTestUser(db, 'b@example.com')).id
    teaId = (await seedTestTea(db)).id
    reviewId = (await createReview(db, { userId: author, teaId, score: 80 })).id
  })

  it('toggles a vote on and off', async () => {
    expect(await toggleHelpful(db, voterA, reviewId)).toEqual({ ok: true, helpful: true, count: 1 })
    expect(await toggleHelpful(db, voterB, reviewId)).toEqual({ ok: true, helpful: true, count: 2 })
    expect(await toggleHelpful(db, voterA, reviewId)).toEqual({ ok: true, helpful: false, count: 1 })
  })

  it('set variants are idempotent', async () => {
    await setHelpful(db, voterA, reviewId, true)
    expect(await setHelpful(db, voterA, reviewId, true)).toEqual({ ok: true, helpful: true, count: 1 })
    await setHelpful(db, voterA, reviewId, false)
    expect(await setHelpful(db, voterA, reviewId, false)).toEqual({ ok: true, helpful: false, count: 0 })
  })

  it('refuses own, missing and hidden reviews', async () => {
    expect(await toggleHelpful(db, author, reviewId)).toEqual({ ok: false, reason: 'own_review' })
    expect(await setHelpful(db, author, reviewId, true)).toEqual({ ok: false, reason: 'own_review' })
    expect(await toggleHelpful(db, voterA, 99_999)).toEqual({ ok: false, reason: 'review_not_found' })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, reviewId))
    expect(await toggleHelpful(db, voterA, reviewId)).toEqual({ ok: false, reason: 'review_hidden' })
    expect(await db.$count(schema.reviewHelpfulVotes)).toBe(0)
  })

  it('the database enforces one vote per user per review', async () => {
    await db.insert(schema.reviewHelpfulVotes).values({ userId: voterA, reviewId })
    await expect(db.insert(schema.reviewHelpfulVotes).values({ userId: voterA, reviewId })).rejects.toThrow()
  })

  it('counts and viewer votes for a page of reviews', async () => {
    const second = await createReview(db, { userId: voterB, teaId, score: 50 })
    await toggleHelpful(db, voterA, reviewId)
    await toggleHelpful(db, voterB, reviewId)
    await toggleHelpful(db, voterA, second.id)

    expect(await helpfulCountsForReviews(db, [reviewId, second.id, 12345])).toEqual({
      [reviewId]: 2,
      [second.id]: 1,
      12345: 0,
    })
    expect(await helpfulCountsForReviews(db, [])).toEqual({})
    expect([...(await viewerVotes(db, voterA, [reviewId, second.id]))].sort()).toEqual([reviewId, second.id].sort())
    expect([...(await viewerVotes(db, voterB, [reviewId, second.id]))]).toEqual([reviewId])
    expect((await viewerVotes(db, voterB, [])).size).toBe(0)
  })

  it('sorts by helpful count, then newest, then id; and returns helpfulCount', async () => {
    const r2 = await createReview(db, { userId: voterA, teaId, score: 60 })
    const r3 = await createReview(db, { userId: voterB, teaId, score: 40 })
    // Identical timestamps force the id tiebreak.
    const same = new Date('2026-01-01T00:00:00Z')
    await db.update(schema.reviews).set({ createdAt: same })
    const extra = (await seedTestUser(db, 'c@example.com')).id
    await toggleHelpful(db, extra, r2.id)
    await toggleHelpful(db, voterB, r2.id)
    await toggleHelpful(db, extra, reviewId)

    const helpful = await listReviewsForTea(db, teaId, { sort: 'helpful' })
    expect(helpful.map((r) => [r.review.id, r.helpfulCount])).toEqual([
      [r2.id, 2],
      [reviewId, 1],
      [r3.id, 0],
    ])
    const recent = await listReviewsForTea(db, teaId)
    expect(recent.map((r) => r.review.id)).toEqual([r3.id, r2.id, reviewId])

    const details = await getTeaWithDetails(db, teaId, { sort: 'helpful', reviewLimit: 2 })
    expect(details?.reviews.map((r) => [r.id, r.helpfulCount])).toEqual([
      [r2.id, 2],
      [reviewId, 1],
    ])
    expect(details?.hasMoreReviews).toBe(true)
    const page2 = await getTeaWithDetails(db, teaId, { sort: 'helpful', reviewLimit: 2, reviewOffset: 2 })
    expect(page2?.reviews.map((r) => r.id)).toEqual([r3.id])
    expect((await getTeaWithDetails(db, teaId))?.reviews.map((r) => r.id)).toEqual([r3.id, r2.id, reviewId])
  })

  it('hidden reviews drop out of the helpful sort and their votes are cleared', async () => {
    await toggleHelpful(db, voterA, reviewId)
    const admin = (await seedTestUser(db, 'admin@example.com')).id
    const report = await createReport(db, { reviewId, reporterUserId: voterB, reason: 'spam' })
    if (!report.ok) throw new Error('failed')
    await resolveReport(db, report.report.id, 'hide', admin)
    expect(await listReviewsForTea(db, teaId, { sort: 'helpful' })).toEqual([])
    expect(await db.$count(schema.reviewHelpfulVotes)).toBe(0)
  })

  it('deleting the review clears its votes', async () => {
    await toggleHelpful(db, voterA, reviewId)
    await deleteReview(db, reviewId, author)
    expect(await db.$count(schema.reviewHelpfulVotes)).toBe(0)
  })
})
