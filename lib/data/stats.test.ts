import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import { createReview } from './reviews'
import { getReviewStats } from './stats'

describe('getReviewStats', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherId: number

  beforeAll(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db, 'a@example.com')).id
    otherId = (await seedTestUser(db, 'b@example.com')).id
    const green1 = (await seedTestTea(db, { name: 'G1', type: 'Green' })).id
    const green2 = (await seedTestTea(db, { name: 'G2', type: 'Green' })).id
    const black = (await seedTestTea(db, { name: 'B1', type: 'Black' })).id
    const hiddenTea = (await seedTestTea(db, { name: 'H1', type: 'Oolong' })).id
    const [tag] = await db.insert(schema.flavorTags).values({ name: 'floral', category: 'floral' }).returning()

    await createReview(db, { userId, teaId: green1, score: 80, brewMethod: 'gongfu', wouldDrinkAgain: true }, [tag.id])
    await createReview(db, { userId, teaId: green2, score: 60, brewMethod: 'gongfu', wouldDrinkAgain: false })
    await createReview(db, { userId, teaId: black, score: 70, wouldDrinkAgain: null })
    const hidden = await createReview(db, { userId, teaId: hiddenTea, score: 100, brewMethod: 'western', wouldDrinkAgain: true }, [tag.id])
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden.id))
    await createReview(db, { userId: otherId, teaId: green1, score: 10 })
  })

  it('aggregates only the user\'s visible reviews', async () => {
    const stats = await getReviewStats(db, userId)
    expect(stats.count).toBe(3)
    expect(stats.avgScore).toBe(70)
    expect(stats.drinkAgainPercent).toBe(50)
    expect(stats.byType).toEqual([
      { type: 'Green', count: 2, avgScore: 70 },
      { type: 'Black', count: 1, avgScore: 70 },
    ])
    expect(stats.byMethod).toEqual([{ method: 'gongfu', count: 2, avgScore: 70 }])
    expect(stats.topFlavors).toEqual([{ name: 'floral', count: 1 }])
  })

  it('is empty for a user with no reviews', async () => {
    const empty = await getReviewStats(db, (await seedTestUser(db, 'c@example.com')).id)
    expect(empty).toMatchObject({ count: 0, avgScore: null, drinkAgainPercent: null, byType: [], byMethod: [], topFlavors: [] })
  })
})
