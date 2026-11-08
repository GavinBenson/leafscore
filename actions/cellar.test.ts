import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { FREE_WISHLIST_LIMIT } from '@/lib/premium'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean; isAdmin: boolean } | null,
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))

const { saveCellarItemAction, deleteCellarItemAction, addLowStockToWishlistAction } = await import('./cellar')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')
const { addToWishlistWithinCap } = await import('@/lib/data/wishlist')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('cellar actions', () => {
  let userId: number
  let otherId: number
  let teaId: number

  const as = (id: number, isPremium: boolean) => {
    mocks.user = { id, isPremium, isAdmin: false }
  }
  const items = () => mocks.db.select().from(schema.cellarItems)

  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db, 'a@example.com')).id
    otherId = (await seedTestUser(mocks.db, 'b@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    as(userId, true)
  })

  describe('the Premium gate', () => {
    it('rejects a free user on every action, server-side', async () => {
      as(userId, false)
      const saved = await saveCellarItemAction({}, form({ teaId: String(teaId), amount: '50' }))
      expect(saved.message).toContain('Premium')
      expect(await items()).toEqual([])

      await mocks.db.insert(schema.cellarItems).values({ userId, teaId, grams: 10, lowStockGrams: 20 })
      const [item] = await items()
      expect((await deleteCellarItemAction(item.id)).message).toContain('Premium')
      expect((await addLowStockToWishlistAction(teaId)).message).toContain('Premium')
      expect(await items()).toHaveLength(1)
      expect(await mocks.db.select().from(schema.wishlist)).toEqual([])
    })

    it('requires sign-in and blocks banned users', async () => {
      mocks.user = null
      expect((await saveCellarItemAction({}, form({ teaId: String(teaId), amount: '5' }))).message).toContain('Sign in')
      as(userId, true)
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect((await saveCellarItemAction({}, form({ teaId: String(teaId), amount: '5' }))).message).toContain('restricted')
      expect(await items()).toEqual([])
    })
  })

  describe('saving', () => {
    it('stores grams as typed when the unit is grams, then replaces on a second add', async () => {
      await expect(
        saveCellarItemAction({}, form({ teaId: String(teaId), amount: '50', price: '12.5', currency: 'usd', notes: ' good ' })),
      ).rejects.toThrow('REDIRECT:/cellar?saved=1')
      expect(await items()).toMatchObject([{ grams: 50, priceCents: 1250, currency: 'USD', notes: 'good', userId }])

      await expect(saveCellarItemAction({}, form({ teaId: String(teaId), amount: '30' }))).rejects.toThrow('REDIRECT')
      expect(await items()).toMatchObject([{ grams: 30, priceCents: null, currency: null }])
    })

    it('converts ounces to grams for a user with the oz preference', async () => {
      await mocks.db.update(schema.users).set({ weightUnit: 'oz' }).where(eq(schema.users.id, userId))
      await expect(
        saveCellarItemAction({}, form({ teaId: String(teaId), amount: '2', lowStock: '0.5' })),
      ).rejects.toThrow('REDIRECT')
      // 2 oz = 56.699 g, 0.5 oz = 14.17 g
      expect(await items()).toMatchObject([{ grams: 57, lowStockGrams: 14 }])
    })

    it('echoes input with field errors for bad values', async () => {
      const bad = await saveCellarItemAction({}, form({ teaId: String(teaId), amount: 'lots', notes: 'keep' }))
      expect(bad.fieldErrors).toHaveProperty('amount')
      expect(bad.values?.notes).toBe('keep')
      const badPrice = await saveCellarItemAction({}, form({ teaId: String(teaId), amount: '5', price: '-3' }))
      expect(badPrice.fieldErrors).toHaveProperty('price')
      const badNotes = await saveCellarItemAction({}, form({ teaId: String(teaId), amount: '5', notes: 'x'.repeat(501) }))
      expect(badNotes.fieldErrors).toHaveProperty('notes')
      const missingTea = await saveCellarItemAction({}, form({ teaId: '9999', amount: '5' }))
      expect(missingTea.message).toContain('no longer available')
      expect(await items()).toEqual([])
    })
  })

  describe('ownership', () => {
    it('another user cannot edit or delete an item', async () => {
      const [item] = await mocks.db.insert(schema.cellarItems).values({ userId, teaId, grams: 40 }).returning()
      as(otherId, true)
      const edit = await saveCellarItemAction({}, form({ itemId: String(item.id), amount: '1' }))
      expect(edit.message).toContain("couldn't find")
      expect((await deleteCellarItemAction(item.id)).ok).toBe(false)
      expect(await items()).toMatchObject([{ grams: 40, userId }])

      as(userId, true)
      await expect(saveCellarItemAction({}, form({ itemId: String(item.id), amount: '45' }))).rejects.toThrow('REDIRECT')
      expect((await items())[0].grams).toBe(45)
      expect((await deleteCellarItemAction(item.id)).ok).toBe(true)
      expect(await items()).toEqual([])
    })
  })

  describe('low stock to wishlist', () => {
    it('adds a low-stock tea to the wishlist, idempotently, and refuses one that is not low', async () => {
      await mocks.db.insert(schema.cellarItems).values({ userId, teaId, grams: 10, lowStockGrams: 20 })
      expect(await addLowStockToWishlistAction(teaId)).toMatchObject({ ok: true, message: 'Added to your wishlist.' })
      expect(await addLowStockToWishlistAction(teaId)).toMatchObject({ ok: true, message: 'Already on your wishlist.' })
      expect(await mocks.db.select().from(schema.wishlist)).toHaveLength(1)

      await mocks.db.update(schema.cellarItems).set({ grams: 100 })
      await mocks.db.delete(schema.wishlist)
      expect((await addLowStockToWishlistAction(teaId)).ok).toBe(false)
      expect(await mocks.db.select().from(schema.wishlist)).toEqual([])
    })

    it('uses the capped wishlist insert: a full free wishlist says limit', async () => {
      for (let i = 0; i < FREE_WISHLIST_LIMIT; i++) {
        const t = await seedTestTea(mocks.db, { name: `W${i}` })
        expect(await addToWishlistWithinCap(mocks.db, userId, t.id, FREE_WISHLIST_LIMIT)).toBe('added')
      }
      expect(await addToWishlistWithinCap(mocks.db, userId, teaId, FREE_WISHLIST_LIMIT)).toBe('limit')
      expect(await addToWishlistWithinCap(mocks.db, userId, teaId, null)).toBe('added')
    })
  })
})
