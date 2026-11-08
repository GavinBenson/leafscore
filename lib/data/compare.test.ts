import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb } from '@/db/testDb'
import { addReview, addTea, type TestDb } from './testKit'
import { recalcLeafScore } from './teas'
import { getComparison, pickTopTags } from './compare'

describe('pickTopTags', () => {
  it('sorts by count then name and limits per tea', () => {
    const m = pickTopTags(
      [
        { teaId: 1, name: 'b', count: 2 },
        { teaId: 1, name: 'a', count: 2 },
        { teaId: 1, name: 'c', count: 5 },
        { teaId: 2, name: 'z', count: 1 },
      ],
      2,
    )
    expect(m.get(1)).toEqual(['c', 'a'])
    expect(m.get(2)).toEqual(['z'])
  })
})

describe('getComparison', () => {
  let db: TestDb
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('returns nothing for no ids and reports unknown ids', async () => {
    expect(await getComparison(db, [])).toEqual({ teas: [], missingIds: [] })
    expect(await getComparison(db, [404, 405])).toEqual({ teas: [], missingIds: [404, 405] })
  })

  it('assembles score gating, tags, brew guide and cheapest price in id order', async () => {
    const [brand] = await db.insert(schema.brands).values({ name: 'Brand' }).returning()
    const a = await addTea(db, { name: 'A', type: 'Oolong', origin: 'Anxi', brandId: brand.id })
    const b = await addTea(db, { name: 'B', type: 'Green' })
    for (let i = 0; i < 3; i++) {
      await addReview(db, a.id, { score: 90, brewTemp: 95, steepTime: 180, brewMethod: 'gongfu', tags: i === 0 ? ['floral', 'creamy'] : ['floral'] })
    }
    await addReview(db, b.id, { score: 50, tags: ['grassy'] })
    const hidden = await addReview(db, a.id, { score: 1, tags: ['hiddenonly'] })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden.id))
    await recalcLeafScore(db, a.id)
    await db.insert(schema.affiliateLinks).values([
      { teaId: a.id, provider: 'Pricey', url: 'https://x.test/1', priceCents: 2000, currency: 'USD', pricePer100gCents: 2000 },
      { teaId: a.id, provider: 'Cheap', url: 'https://x.test/2', priceCents: 500, currency: 'USD', pricePer100gCents: 1000 },
      { teaId: a.id, provider: 'Bad', url: 'http://x.test/3', priceCents: 1, currency: 'USD', pricePer100gCents: 1 },
    ])

    const result = await getComparison(db, [b.id, a.id, 9999])
    expect(result.missingIds).toEqual([9999])
    expect(result.teas.map((t) => t.name)).toEqual(['B', 'A'])

    const [tb, ta] = result.teas
    expect(tb.leafScore).toBeNull() // 1 review: no public score
    expect(tb.reviewCount).toBe(1)
    expect(tb.brand).toBeNull()
    expect(tb.cheapest).toBeNull()
    expect(tb.brewGuide).toEqual({ temperature: null, time: null, method: null })

    expect(ta.leafScore).toBe(90)
    expect(ta.reviewCount).toBe(3)
    expect(ta.brand).toEqual({ id: brand.id, name: 'Brand' })
    expect(ta.topTags).toEqual(['floral', 'creamy'])
    expect(ta.brewGuide.temperature?.median).toBe(95)
    expect(ta.brewGuide.time?.median).toBe(180)
    expect(ta.cheapest).toMatchObject({ provider: 'Cheap', perHundredGrams: '$10.00' })
  })

  it('compares at most 3 teas and ignores duplicates', async () => {
    const ids: number[] = []
    for (let i = 0; i < 4; i++) ids.push((await addTea(db, { name: `T${i}` })).id)
    const result = await getComparison(db, [ids[0], ids[0], ids[1], ids[2], ids[3]])
    expect(result.teas.map((t) => t.id)).toEqual([ids[0], ids[1], ids[2]])
  })
})
