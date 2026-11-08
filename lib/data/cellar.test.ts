import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { canUseCellar } from '@/lib/premium'
import {
  deleteCellarItem,
  getCellarItemForTea,
  listCellar,
  listLowStock,
  updateCellarItem,
  upsertCellarItem,
} from './cellar'

describe('cellar', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherId: number
  let teaA: number
  let teaB: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherId = (await seedTestUser(db, 'other@example.com')).id
    const brand = (await db.insert(schema.brands).values({ name: 'Brand' }).returning())[0]
    teaA = (await seedTestTea(db, { name: 'Alpha', brandId: brand.id })).id
    teaB = (await seedTestTea(db, { name: 'Beta' })).id
  })

  it('the Premium helper only allows premium', () => {
    expect(canUseCellar(true)).toBe(true)
    expect(canUseCellar(false)).toBe(false)
  })

  it('upserts one row per user and tea', async () => {
    const first = await upsertCellarItem(db, userId, teaA, { grams: 100, notes: ' good ' })
    expect(first.ok && first.item).toMatchObject({ grams: 100, notes: 'good', priceCents: null })
    const second = await upsertCellarItem(db, userId, teaA, {
      grams: 80,
      purchasedAt: '2026-01-31',
      priceCents: 2500,
      currency: 'usd',
      lowStockGrams: 50,
    })
    expect(second.ok && second.item).toMatchObject({ grams: 80, purchasedAt: '2026-01-31', currency: 'USD', priceCents: 2500 })
    expect(await db.$count(schema.cellarItems)).toBe(1)
    expect(await upsertCellarItem(db, userId, 99_999, { grams: 1 })).toEqual({ ok: false, reason: 'tea_not_found' })
    expect((await getCellarItemForTea(db, userId, teaA))?.grams).toBe(80)
    expect(await getCellarItemForTea(db, otherId, teaA)).toBeNull()
  })

  it('rejects bad values', async () => {
    const bad = async (input: Record<string, unknown>) => upsertCellarItem(db, userId, teaA, input)
    expect(await bad({ grams: -1 })).toMatchObject({ ok: false, reason: 'invalid', field: 'grams' })
    expect(await bad({ grams: 1.5 })).toMatchObject({ field: 'grams' })
    expect(await bad({ grams: '5' })).toMatchObject({ field: 'grams' })
    expect(await bad({ grams: 5, purchasedAt: '2026-02-30' })).toMatchObject({ field: 'purchasedAt' })
    expect(await bad({ grams: 5, priceCents: 100 })).toMatchObject({ field: 'currency' })
    expect(await bad({ grams: 5, priceCents: -1, currency: 'USD' })).toMatchObject({ field: 'priceCents' })
    expect(await bad({ grams: 5, lowStockGrams: -2 })).toMatchObject({ field: 'lowStockGrams' })
    expect(await bad({ grams: 5, notes: 'x'.repeat(501) })).toMatchObject({ field: 'notes' })
    expect(await db.$count(schema.cellarItems)).toBe(0)
  })

  it('updates and deletes only your own rows', async () => {
    const created = await upsertCellarItem(db, userId, teaA, { grams: 100 })
    if (!created.ok) throw new Error('failed')
    const id = created.item.id
    expect(await updateCellarItem(db, otherId, id, { grams: 1 })).toEqual({ ok: false, reason: 'not_found' })
    expect(await deleteCellarItem(db, otherId, id)).toBe(false)
    const updated = await updateCellarItem(db, userId, id, { grams: 20, notes: 'low' })
    expect(updated.ok && updated.item.grams).toBe(20)
    expect(await deleteCellarItem(db, userId, id)).toBe(true)
  })

  it('lists with tea and brand and finds low stock', async () => {
    await upsertCellarItem(db, userId, teaA, { grams: 30, lowStockGrams: 30 })
    await upsertCellarItem(db, userId, teaB, { grams: 10 }) // no threshold: never low
    await upsertCellarItem(db, otherId, teaB, { grams: 0, lowStockGrams: 5 })

    const all = await listCellar(db, userId)
    expect(all.map((r) => r.tea.name)).toEqual(['Alpha', 'Beta'])
    expect(all[0].brand?.name).toBe('Brand')
    expect(all[1].brand?.name).toBeUndefined()

    const low = await listLowStock(db, userId)
    expect(low.map((r) => r.tea.name)).toEqual(['Alpha'])
    await upsertCellarItem(db, userId, teaA, { grams: 31, lowStockGrams: 30 })
    expect(await listLowStock(db, userId)).toEqual([])
  })

  it('the DB refuses negative grams and duplicates', async () => {
    await expect(db.insert(schema.cellarItems).values({ userId, teaId: teaA, grams: -1 })).rejects.toThrow()
    await db.insert(schema.cellarItems).values({ userId, teaId: teaA, grams: 1 })
    await expect(db.insert(schema.cellarItems).values({ userId, teaId: teaA, grams: 2 })).rejects.toThrow()
    await db.delete(schema.users).where(eq(schema.users.id, userId))
    expect(await db.$count(schema.cellarItems)).toBe(0)
  })
})
