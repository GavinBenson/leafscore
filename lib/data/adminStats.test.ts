import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { getAdminStats } from './adminStats'
import { addToWishlistWithinCap } from './wishlist'

describe('getAdminStats', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('returns zeros on an empty database', async () => {
    expect(await getAdminStats(db)).toEqual({
      totalTeas: 0, totalReviews: 0, totalUsers: 0, signupsLast7Days: 0,
      reviewsLast7Days: 0, premiumUsers: 0, pendingTeaRequests: 0, pendingReports: 0,
    })
  })

  it('counts users, recent windows, premium and pending items', async () => {
    const a = await seedTestUser(db, 'a@x.com')
    const b = await seedTestUser(db, 'b@x.com')
    await db.update(schema.users).set({ createdAt: sql`now() - interval '30 days'` }).where(sql`id = ${b.id}`)
    await db.update(schema.users).set({ isPremium: true }).where(sql`id = ${a.id}`)
    const tea = await seedTestTea(db)
    const [r1] = await db.insert(schema.reviews).values({ userId: a.id, teaId: tea.id, score: 80 }).returning()
    await db.insert(schema.reviews).values({ userId: b.id, teaId: tea.id, score: 70, createdAt: sql`now() - interval '20 days'` as unknown as Date })
    await db.insert(schema.teaRequests).values([
      { userId: a.id, name: 'p' },
      { userId: a.id, name: 'done', status: 'approved' },
    ])
    await db.insert(schema.reports).values({ reviewId: r1.id, reporterUserId: b.id, reason: 'spam' })

    expect(await getAdminStats(db)).toEqual({
      totalTeas: 1, totalReviews: 2, totalUsers: 2, signupsLast7Days: 1,
      reviewsLast7Days: 1, premiumUsers: 1, pendingTeaRequests: 1, pendingReports: 1,
    })
  })
})

describe('addToWishlistWithinCap', () => {
  it('enforces the cap atomically and reports exists/limit', async () => {
    const db = await createTestDb()
    const u = await seedTestUser(db)
    const t1 = await seedTestTea(db, { name: 'one' })
    const t2 = await seedTestTea(db, { name: 'two' })
    const t3 = await seedTestTea(db, { name: 'three' })
    expect(await addToWishlistWithinCap(db, u.id, t1.id, 2)).toBe('added')
    expect(await addToWishlistWithinCap(db, u.id, t1.id, 2)).toBe('exists')
    expect(await addToWishlistWithinCap(db, u.id, t2.id, 2)).toBe('added')
    expect(await addToWishlistWithinCap(db, u.id, t3.id, 2)).toBe('limit')
    expect(await addToWishlistWithinCap(db, u.id, t3.id, null)).toBe('added')
  })
})
