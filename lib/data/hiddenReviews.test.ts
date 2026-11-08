import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import { createReview } from './reviews'
import { getTeaWithDetails } from './teas'
import { getReviewStats, listReviewsForExport } from './stats'

describe('hidden reviews', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let tea2Id: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    const other = (await seedTestUser(db, 'o@example.com')).id
    const teaId = (await seedTestTea(db)).id
    tea2Id = (await seedTestTea(db, { name: 'Second' })).id
    await createReview(db, { userId, teaId, score: 100 })
    const hidden = await createReview(db, { userId, teaId: tea2Id, score: 20, brewMethod: 'western' })
    await createReview(db, { userId: other, teaId: tea2Id, score: 80 })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden.id))
  })

  it('getTeaWithDetails omits hidden reviews and reports no phantom next page', async () => {
    const result = await getTeaWithDetails(db, tea2Id, { reviewLimit: 1 })
    expect(result?.reviews).toHaveLength(1)
    expect(result?.reviews[0].hidden).toBe(false)
    expect(result?.hasMoreReviews).toBe(false)
  })

  it('stats exclude hidden reviews', async () => {
    const stats = await getReviewStats(db, userId)
    expect(stats.count).toBe(1)
    expect(stats.avgScore).toBe(100)
    expect(stats.byMethod).toEqual([])
  })

  it('export keeps the author hidden review but flags it', async () => {
    const rows = await listReviewsForExport(db, userId)
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.hidden)).toHaveLength(1)
  })
})
