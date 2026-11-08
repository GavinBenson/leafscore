import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb } from '@/db/testDb'
import { addReview, addTea, addUser, type TestDb } from './testKit'
import {
  assembleTasteProfile,
  buildPassport,
  evaluateBadges,
  getTasteProfile,
  topFlavors,
} from './tasteProfile'

describe('evaluateBadges', () => {
  it('earns nothing for a new user and lists progress', () => {
    const r = evaluateBadges({ reviewCount: 0, originsTried: 0, maxOfOneType: 0 })
    expect(r.earned).toEqual([])
    expect(r.nextUp).toHaveLength(5)
    expect(r.nextUp.every((b) => b.progress === 0)).toBe(true)
  })

  it('earns at exact thresholds and not one below', () => {
    const below = evaluateBadges({ reviewCount: 9, originsTried: 4, maxOfOneType: 9 })
    expect(below.earned.map((b) => b.id)).toEqual(['first-review'])
    const at = evaluateBadges({ reviewCount: 10, originsTried: 5, maxOfOneType: 10 })
    expect(at.earned.map((b) => b.id)).toEqual(['first-review', 'reviews-10', 'origins-5', 'one-type-10'])
    expect(at.nextUp.map((b) => b.id)).toEqual(['reviews-25'])
    expect(at.nextUp[0]).toMatchObject({ progress: 10, target: 25, earned: false })
  })

  it('orders next-up by closeness and caps progress', () => {
    const r = evaluateBadges({ reviewCount: 30, originsTried: 4, maxOfOneType: 2 })
    expect(r.earned.map((b) => b.id)).toContain('reviews-25')
    expect(r.earned.find((b) => b.id === 'reviews-25')?.progress).toBe(25)
    expect(r.nextUp.map((b) => b.id)).toEqual(['origins-5', 'one-type-10'])
  })

  it('tolerates junk numbers', () => {
    const r = evaluateBadges({ reviewCount: Number.NaN, originsTried: -3, maxOfOneType: 1.9 })
    expect(r.earned).toEqual([])
  })
})

describe('pure aggregation', () => {
  it('topFlavors sorts by count then name and limits to 8', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `t${String(i).padStart(2, '0')}`, count: i < 2 ? 5 : 1 }))
    const top = topFlavors(rows)
    expect(top).toHaveLength(8)
    expect(top.slice(0, 2).map((r) => r.name)).toEqual(['t00', 't01'])
    expect(topFlavors([{ name: 'x', count: 0 }])).toEqual([])
  })

  it('buildPassport counts tried vs total and ignores blanks', () => {
    const p = buildPassport(
      [
        { value: 'Anxi', count: 2 },
        { value: ' Anxi ', count: 1 },
        { value: null, count: 4 },
        { value: 'Uji', count: 1 },
      ],
      ['Anxi', 'Uji', 'Assam', null, ''],
    )
    expect(p.tried).toEqual([
      { name: 'Anxi', count: 3 },
      { name: 'Uji', count: 1 },
    ])
    expect(p.total).toBe(3)
  })

  it('assembleTasteProfile wires badges from the passport', () => {
    const data = assembleTasteProfile({
      reviewCount: 12,
      flavorRows: [{ name: 'floral', count: 3 }],
      byOrigin: ['A', 'B', 'C', 'D', 'E'].map((value) => ({ value, count: 1 })),
      byType: [{ value: 'Oolong', count: 10 }, { value: 'Green', count: 2 }],
      catalogueOrigins: ['A', 'B', 'C', 'D', 'E', 'F'],
      catalogueTypes: ['Oolong', 'Green', 'Black'],
    })
    expect(data.origins.total).toBe(6)
    expect(data.types).toMatchObject({ total: 3 })
    expect(data.badges.earned.map((b) => b.id)).toEqual(['first-review', 'reviews-10', 'origins-5', 'one-type-10'])
  })
})

describe('getTasteProfile', () => {
  let db: TestDb
  let userId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await addUser(db)).id
  })

  it('is empty for a user with no reviews', async () => {
    await addTea(db, { origin: 'Anxi' })
    const p = await getTasteProfile(db, userId)
    expect(p.reviewCount).toBe(0)
    expect(p.flavors).toEqual([])
    expect(p.origins).toEqual({ tried: [], total: 1 })
    expect(p.badges.earned).toEqual([])
  })

  it('aggregates tags, origins and types, excluding hidden and other users', async () => {
    const t1 = await addTea(db, { name: 'A', type: 'Oolong', origin: 'Anxi' })
    const t2 = await addTea(db, { name: 'B', type: 'Oolong', origin: 'Anxi' })
    const t3 = await addTea(db, { name: 'C', type: 'Green', origin: 'Uji' })
    await addTea(db, { name: 'D', type: 'Black', origin: 'Assam' })
    await addTea(db, { name: 'E', type: 'Black', origin: null })
    await addReview(db, t1.id, { userId, tags: ['floral', 'creamy'] })
    await addReview(db, t2.id, { userId, tags: ['floral'] })
    const hidden = await addReview(db, t3.id, { userId, tags: ['smoky'] })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden.id))
    await addReview(db, t3.id, { tags: ['smoky', 'smoky2'] }) // someone else

    const p = await getTasteProfile(db, userId)
    expect(p.reviewCount).toBe(2)
    expect(p.flavors).toEqual([
      { name: 'floral', count: 2 },
      { name: 'creamy', count: 1 },
    ])
    expect(p.origins).toEqual({ tried: [{ name: 'Anxi', count: 2 }], total: 3 })
    expect(p.types).toEqual({ tried: [{ name: 'Oolong', count: 2 }], total: 3 })
    expect(p.badges.earned.map((b) => b.id)).toEqual(['first-review'])
  })
})
