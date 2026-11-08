import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { addFavorite, isFavorited } from '@/lib/data/favorites'
import { addToWishlist, isInWishlist } from '@/lib/data/wishlist'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean } | null,
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

const { removeFavorite } = await import('./favorites')
const { removeFromWishlist } = await import('./wishlist')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

describe('idempotent list removal', () => {
  let userId: number
  let teaId: number

  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db)).id
    teaId = (await seedTestTea(mocks.db)).id
    mocks.user = { id: userId, isPremium: false }
  })

  describe('removeFavorite', () => {
    it('removes, and a second call does not re-add', async () => {
      await addFavorite(mocks.db, userId, teaId)
      expect(await removeFavorite(teaId)).toEqual({})
      expect(await isFavorited(mocks.db, userId, teaId)).toBe(false)
      expect(await removeFavorite(teaId)).toEqual({})
      expect(await isFavorited(mocks.db, userId, teaId)).toBe(false)
    })

    it('requires sign-in', async () => {
      mocks.user = null
      await expect(removeFavorite(teaId)).rejects.toThrow('Unauthorized')
    })

    it('rejects a bad id', async () => {
      await expect(removeFavorite(-1)).rejects.toThrow('Invalid tea')
      await expect(removeFavorite(Number.NaN)).rejects.toThrow('Invalid tea')
    })

    it('returns the rate-limit message and keeps the favorite', async () => {
      await addFavorite(mocks.db, userId, teaId)
      await mocks.db
        .insert(schema.rateLimits)
        .values({ key: `favorite:u:${userId}`, windowStart: new Date(), count: 120 })
      const result = await removeFavorite(teaId)
      expect(result.error).toMatch(/too many/i)
      expect(await isFavorited(mocks.db, userId, teaId)).toBe(true)
    })
  })

  describe('removeFromWishlist', () => {
    it('removes, and a second call does not re-add', async () => {
      await addToWishlist(mocks.db, userId, teaId)
      expect(await removeFromWishlist(teaId)).toEqual({})
      expect(await isInWishlist(mocks.db, userId, teaId)).toBe(false)
      expect(await removeFromWishlist(teaId)).toEqual({})
      expect(await isInWishlist(mocks.db, userId, teaId)).toBe(false)
    })

    it('requires sign-in', async () => {
      mocks.user = null
      await expect(removeFromWishlist(teaId)).rejects.toThrow('Unauthorized')
    })

    it('rejects a bad id', async () => {
      await expect(removeFromWishlist(0)).rejects.toThrow('Invalid tea')
    })

    it('returns the rate-limit message and keeps the item', async () => {
      await addToWishlist(mocks.db, userId, teaId)
      await mocks.db
        .insert(schema.rateLimits)
        .values({ key: `wishlist:u:${userId}`, windowStart: new Date(), count: 120 })
      const result = await removeFromWishlist(teaId)
      expect(result.error).toMatch(/too many/i)
      expect(await isInWishlist(mocks.db, userId, teaId)).toBe(true)
    })
  })
})
