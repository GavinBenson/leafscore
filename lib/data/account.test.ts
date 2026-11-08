import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { addFavorite, isFavorited, listFavorites, removeFavorite } from './favorites'
import { createReview } from './reviews'
import { getReviewStats, listReviewsForExport } from './stats'
import { createTeaRequest, listPendingRequests, updateRequestStatus } from './teaRequests'
import {
  createOrUpdateUser,
  getUserByEmail,
  getUserById,
  getPublicProfile,
  getUserByStripeCustomerId,
  setProfilePublic,
  updateUserPremium,
  updateUserProfile,
} from './users'
import {
  addToWishlist,
  countWishlist,
  isInWishlist,
  listWishlist,
  removeFromWishlist,
} from './wishlist'

describe('account data', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherUserId: number
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherUserId = (await seedTestUser(db, 'other@example.com')).id
    teaId = (await seedTestTea(db)).id
  })

  describe('users', () => {
    it('finds users by email, id and Stripe customer', async () => {
      await updateUserPremium(db, userId, { stripeCustomerId: 'cus_1' })

      expect((await getUserByEmail(db, 'test@example.com'))?.id).toBe(userId)
      expect((await getUserById(db, userId))?.email).toBe('test@example.com')
      expect((await getUserByStripeCustomerId(db, 'cus_1'))?.id).toBe(userId)
      expect(await getUserByEmail(db, 'nobody@example.com')).toBeNull()
      expect(await getUserByStripeCustomerId(db, 'cus_none')).toBeNull()
    })

    it('public profiles expose no private fields and honor the privacy setting', async () => {
      const profile = await getPublicProfile(db, userId)
      expect(Object.keys(profile ?? {}).sort()).toEqual(['avatarUrl', 'createdAt', 'id', 'name', 'profilePublic'])

      await setProfilePublic(db, userId, false)
      expect(await getPublicProfile(db, userId)).toBeNull()
      expect(await getPublicProfile(db, userId, otherUserId)).toBeNull()
      expect((await getPublicProfile(db, userId, userId))?.id).toBe(userId)

      await setProfilePublic(db, userId, true)
      expect((await getPublicProfile(db, userId))?.id).toBe(userId)
      expect(await getPublicProfile(db, 9999)).toBeNull()
    })

    it('updates only the given profile fields', async () => {
      await updateUserProfile(db, userId, { avatarUrl: 'https://x/a.png' })
      await updateUserProfile(db, userId, {})
      await updateUserProfile(db, userId, { name: 'Renamed' })

      const user = await getUserById(db, userId)
      expect(user?.name).toBe('Renamed')
      expect(user?.avatarUrl).toBe('https://x/a.png')
    })

    it('upserts on email and keeps the avatar when none is given', async () => {
      const first = await createOrUpdateUser(db, { email: 'a@example.com', name: 'A', avatarUrl: 'https://x/a.png' })
      const second = await createOrUpdateUser(db, { email: 'a@example.com', name: 'A2' })

      expect(second.id).toBe(first.id)
      expect(second.name).toBe('A2')
      expect(second.avatarUrl).toBe('https://x/a.png')
    })

    it('leaves undefined premium fields alone and clears them with null', async () => {
      const expires = new Date('2030-01-01T00:00:00Z')
      await updateUserPremium(db, userId, { isPremium: true, stripeCustomerId: 'cus_1', premiumExpiresAt: expires })

      let user = await updateUserPremium(db, userId, { paymentFailedAt: new Date() })
      expect(user?.isPremium).toBe(true)
      expect(user?.stripeCustomerId).toBe('cus_1')
      expect(user?.premiumExpiresAt).toEqual(expires)

      user = await updateUserPremium(db, userId, { premiumExpiresAt: null, paymentFailedAt: null })
      expect(user?.premiumExpiresAt).toBeNull()
      expect(user?.paymentFailedAt).toBeNull()
    })
  })

  it('favorites add once, stay per-user, and remove', async () => {
    await addFavorite(db, userId, teaId)
    await addFavorite(db, userId, teaId)

    expect(await listFavorites(db, userId)).toHaveLength(1)
    expect(await isFavorited(db, userId, teaId)).toBe(true)
    expect(await isFavorited(db, otherUserId, teaId)).toBe(false)

    await removeFavorite(db, userId, teaId)
    expect(await isFavorited(db, userId, teaId)).toBe(false)
  })

  it('wishlist adds once, counts per user, and removes', async () => {
    await addToWishlist(db, userId, teaId)
    await addToWishlist(db, userId, teaId)

    expect(await listWishlist(db, userId)).toHaveLength(1)
    expect(await countWishlist(db, userId)).toBe(1)
    expect(await countWishlist(db, otherUserId)).toBe(0)
    expect(await isInWishlist(db, userId, teaId)).toBe(true)

    await removeFromWishlist(db, userId, teaId)
    expect(await countWishlist(db, userId)).toBe(0)
  })

  it('tea requests start pending and leave the queue once handled', async () => {
    const created = await createTeaRequest(db, { userId, name: 'New Tea' })
    if (!created.ok) throw new Error('expected request to be created')
    const request = created.request
    expect((await listPendingRequests(db)).map((row) => row.id)).toEqual([request.id])

    expect((await updateRequestStatus(db, request.id, 'approved'))?.status).toBe('approved')
    expect(await listPendingRequests(db)).toEqual([])
    expect(await updateRequestStatus(db, 9999, 'approved')).toBeNull()
  })

  describe('stats', () => {
    it('handles a user with no reviews', async () => {
      expect(await getReviewStats(db, userId)).toEqual({
        count: 0,
        avgScore: null,
        drinkAgainPercent: null,
        byType: [],
        byMethod: [],
        topFlavors: [],
      })
    })

    it('aggregates only that user, by type, method and flavor', async () => {
      const black = await seedTestTea(db, { name: 'Black', type: 'black' })
      const green2 = await seedTestTea(db, { name: 'Green 2' })
      const [floral, smoky] = await db
        .insert(schema.flavorTags)
        .values([
          { name: 'floral', category: 'aroma' },
          { name: 'smoky', category: 'aroma' },
        ])
        .returning()
      await createReview(db, { userId, teaId, score: 80, brewMethod: 'gongfu', wouldDrinkAgain: true }, [floral.id, smoky.id])
      await createReview(db, { userId, teaId: green2.id, score: 60, brewMethod: 'gongfu', wouldDrinkAgain: false }, [floral.id])
      await createReview(db, { userId, teaId: black.id, score: 91 })
      await createReview(db, { userId: otherUserId, teaId, score: 1, brewMethod: 'western', wouldDrinkAgain: false })

      expect(await getReviewStats(db, userId)).toEqual({
        count: 3,
        avgScore: 77,
        drinkAgainPercent: 50,
        byType: [
          { type: 'green', count: 2, avgScore: 70 },
          { type: 'black', count: 1, avgScore: 91 },
        ],
        byMethod: [{ method: 'gongfu', count: 2, avgScore: 70 }],
        topFlavors: [
          { name: 'floral', count: 2 },
          { name: 'smoky', count: 1 },
        ],
      })
    })

    it('export has one row per review, with flavors joined and no other users', async () => {
      const [floral, smoky] = await db
        .insert(schema.flavorTags)
        .values([
          { name: 'floral', category: 'aroma' },
          { name: 'smoky', category: 'aroma' },
        ])
        .returning()
      const green2 = await seedTestTea(db, { name: 'Green 2' })
      await createReview(db, { userId, teaId, score: 80 }, [smoky.id, floral.id])
      await createReview(db, { userId, teaId: green2.id, score: 70 })
      await createReview(db, { userId: otherUserId, teaId, score: 1 })

      const rows = await listReviewsForExport(db, userId)

      expect(rows).toHaveLength(2)
      expect(rows.find((row) => row.score === 80)?.flavors).toBe('floral; smoky')
      expect(rows.find((row) => row.score === 70)?.flavors).toBeNull()
    })
  })
})
