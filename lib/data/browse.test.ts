import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { countTeas, listTeas, searchTeas } from './teas'
import { addFavorite, listFavorites } from './favorites'
import { addToWishlist, listWishlist } from './wishlist'
import { listReviewsForUser, listReviewsForTea } from './reviews'

describe('browse ordering and paging', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>

  beforeEach(async () => {
    db = await createTestDb()
  })

  const names = (rows: { name: string }[]) => rows.map((r) => r.name)

  it('ranks scored teas first, then unscored by review count, then newest id', async () => {
    await seedTestTea(db, { name: 'Low', leafScore: 60, reviewCount: 3 })
    await seedTestTea(db, { name: 'High', leafScore: 90, reviewCount: 3 })
    await seedTestTea(db, { name: 'TooFew', leafScore: 99, reviewCount: 2 })
    await seedTestTea(db, { name: 'NoReviewsA', leafScore: null, reviewCount: 0 })
    await seedTestTea(db, { name: 'NoReviewsB', leafScore: null, reviewCount: 0 })
    await seedTestTea(db, { name: 'NullScoreWithCount', leafScore: null, reviewCount: 5 })

    expect(names(await listTeas(db, { sort: 'score' }))).toEqual([
      'High',
      'Low',
      'NullScoreWithCount',
      'TooFew',
      'NoReviewsB',
      'NoReviewsA',
    ])
  })

  it('home-style listing only returns teas with a public score', async () => {
    await seedTestTea(db, { name: 'Scored', leafScore: 80, reviewCount: 3 })
    await seedTestTea(db, { name: 'Unscored', leafScore: 95, reviewCount: 1 })
    expect(names(await listTeas(db, { minReviews: 3 }))).toEqual(['Scored'])
  })

  it('pages stably with tied scores', async () => {
    for (let i = 0; i < 7; i++) {
      await seedTestTea(db, { name: `Tie ${i}`, leafScore: 70, reviewCount: 4 })
    }
    const seen: string[] = []
    for (let offset = 0; offset < 8; offset += 3) {
      seen.push(...names(await listTeas(db, { limit: 3, offset })))
    }
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
    expect(await countTeas(db)).toBe(7)
  })

  it('joins the brand and searches brand names and filters', async () => {
    const [brand] = await db.insert(schema.brands).values({ name: 'Zen_Leaf' }).returning()
    await seedTestTea(db, { name: 'Sencha', brandId: brand.id, subtype: 'steamed', origin: 'Japan' })
    await seedTestTea(db, { name: 'Assam', type: 'black', origin: 'India' })

    const byBrand = await listTeas(db, { search: 'zen_' })
    expect(names(byBrand)).toEqual(['Sencha'])
    expect(byBrand[0].brand?.name).toBe('Zen_Leaf')
    expect(names(await listTeas(db, { search: 'zen%' }))).toEqual([])
    expect(names(await searchTeas(db, 'ZEN'))).toEqual(['Sencha'])
    expect(names(await listTeas(db, { brandId: brand.id }))).toEqual(['Sencha'])
    expect(names(await listTeas(db, { subtype: 'steamed' }))).toEqual(['Sencha'])
    expect(names(await listTeas(db, { origin: 'India' }))).toEqual(['Assam'])
    expect(await countTeas(db, { search: 'zen' })).toBe(1)
  })

  it('orders and pages favorites, wishlist and reviews newest first', async () => {
    const user = await seedTestUser(db)
    const teas = []
    for (let i = 0; i < 5; i++) teas.push(await seedTestTea(db, { name: `T${i}` }))
    const same = new Date('2026-01-01T00:00:00Z')
    for (const t of teas) {
      await addFavorite(db, user.id, t.id)
      await addToWishlist(db, user.id, t.id)
      await db.insert(schema.reviews).values({ userId: user.id, teaId: t.id, score: 80, createdAt: same })
    }
    await db.update(schema.favorites).set({ createdAt: same })
    await db.update(schema.wishlist).set({ createdAt: same })

    const expected = [...teas].reverse().map((t) => t.name)
    const page = async (fn: (o: { limit: number; offset: number }) => Promise<{ tea: { name: string } }[]>) => [
      ...(await fn({ limit: 2, offset: 0 })),
      ...(await fn({ limit: 2, offset: 2 })),
      ...(await fn({ limit: 2, offset: 4 })),
    ].map((r) => r.tea.name)

    expect(await page((o) => listFavorites(db, user.id, o))).toEqual(expected)
    expect(await page((o) => listWishlist(db, user.id, o))).toEqual(expected)
    expect(await page((o) => listReviewsForUser(db, user.id, o))).toEqual(expected)

    const forTea = await listReviewsForTea(db, teas[0].id, { limit: 1, offset: 0 })
    expect(forTea).toHaveLength(1)
  })

  it('does not cap the 21st review of a user', async () => {
    const user = await seedTestUser(db)
    for (let i = 0; i < 25; i++) {
      const tea = await seedTestTea(db, { name: `Tea ${i}` })
      await db.insert(schema.reviews).values({ userId: user.id, teaId: tea.id, score: 70 })
    }
    const second = await listReviewsForUser(db, user.id, { limit: 10, offset: 20 })
    expect(second).toHaveLength(5)
  })
})
