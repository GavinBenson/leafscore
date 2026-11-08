import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { createReview } from './reviews'
import { countTeaDependents, deleteTea } from './teaAdmin'
import { createReport } from './reports'
import { getTea } from './teas'
import { addFavorite } from './favorites'
import { addToWishlist } from './wishlist'
import { deleteUserAccount, exportUserData, getUserById, updateDisplayName, updateUserPremium } from './users'
import {
  MAX_PENDING_REQUESTS_PER_USER,
  createTeaRequest,
  listPendingRequestsWithUser,
  listRequestsForUser,
  markRequestApproved,
} from './teaRequests'
import { parseDisplayName, neutralDisplayName } from '@/lib/validation/displayName'

describe('account lifecycle', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherId: number
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherId = (await seedTestUser(db, 'other@example.com')).id
    teaId = (await seedTestTea(db)).id
  })

  describe('display names', () => {
    it('validates length, trims and rejects control characters', () => {
      expect(parseDisplayName('  Ann  ')).toEqual({ ok: true, name: 'Ann' })
      expect(parseDisplayName('A').ok).toBe(false)
      expect(parseDisplayName('x'.repeat(41)).ok).toBe(false)
      expect(parseDisplayName('x'.repeat(40)).ok).toBe(true)
      expect(parseDisplayName('bad\u0000name').ok).toBe(false)
      expect(parseDisplayName('two\nlines').ok).toBe(false)
      expect(parseDisplayName(null).ok).toBe(false)
    })

    it('generates a neutral default', () => {
      expect(neutralDisplayName(() => 0.0427)).toBe('Tea drinker 0427')
      expect(neutralDisplayName()).toMatch(/^Tea drinker \d{4}$/)
    })

    it('updateDisplayName saves a valid name and rejects an invalid one', async () => {
      expect(await updateDisplayName(db, userId, ' Mei ')).toEqual({ ok: true, name: 'Mei' })
      expect((await getUserById(db, userId))?.name).toBe('Mei')
      expect((await updateDisplayName(db, userId, 'x')).ok).toBe(false)
      expect((await getUserById(db, userId))?.name).toBe('Mei')
      expect((await updateDisplayName(db, 9999, 'Valid')).ok).toBe(false)
    })
  })

  describe('deleteUserAccount', () => {
    it('removes the user and dependents, recomputes scores, and returns blobs and customer id', async () => {
      const tea2 = await seedTestTea(db, { name: 'Tea 2' })
      await updateUserPremium(db, userId, { stripeCustomerId: 'cus_9' })
      await createReview(db, { userId, teaId, score: 100, photoUrl: 'https://blob/1.png' })
      await createReview(db, { userId, teaId: tea2.id, score: 80 })
      const keep = await createReview(db, { userId: otherId, teaId, score: 40 })
      await addFavorite(db, userId, teaId)
      await addToWishlist(db, userId, teaId)
      await createTeaRequest(db, { userId, name: 'Wanted' })
      await db.insert(schema.accounts).values({ provider: 'google', providerAccountId: 'g1', userId, type: 'oauth' })
      await createReport(db, { reviewId: keep.id, reporterUserId: userId, reason: 'spam' })

      const result = await deleteUserAccount(db, userId)

      expect(result).toEqual({ photoUrls: ['https://blob/1.png'], stripeCustomerId: 'cus_9' })
      expect(await getUserById(db, userId)).toBeNull()
      for (const table of [schema.favorites, schema.wishlist, schema.teaRequests, schema.accounts, schema.reports]) {
        expect(await db.select().from(table)).toHaveLength(0)
      }
      expect(await db.select().from(schema.reviews)).toHaveLength(1)
      expect((await getTea(db, teaId))!.tea).toMatchObject({ leafScore: 40, reviewCount: 1 })
      expect((await getTea(db, tea2.id))!.tea).toMatchObject({ leafScore: null, reviewCount: 0 })
      expect(await getUserById(db, otherId)).not.toBeNull()
    })

    it('returns null for an unknown user', async () => {
      expect(await deleteUserAccount(db, 9999)).toBeNull()
    })
  })

  it('exportUserData returns the user reviews, favorites and wishlist as plain data', async () => {
    const [tag] = await db.insert(schema.flavorTags).values({ name: 'floral', category: 'aroma' }).returning()
    await createReview(db, { userId, teaId, score: 77, notes: 'nice' }, [tag.id])
    await createReview(db, { userId: otherId, teaId, score: 1 })
    await addFavorite(db, userId, teaId)
    await addToWishlist(db, otherId, teaId)

    const data = await exportUserData(db, userId)

    expect(data?.reviews).toHaveLength(1)
    expect(data?.reviews[0]).toMatchObject({ tea: 'Test Tea', score: 77, notes: 'nice', flavors: ['floral'] })
    expect(data?.favorites).toHaveLength(1)
    expect(data?.wishlist).toEqual([])
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    expect(await exportUserData(db, 9999)).toBeNull()
  })

  describe('tea requests', () => {
    it('caps pending requests per user', async () => {
      for (let i = 0; i < MAX_PENDING_REQUESTS_PER_USER; i++) {
        expect((await createTeaRequest(db, { userId, name: `Tea ${i}` })).ok).toBe(true)
      }
      expect(await createTeaRequest(db, { userId, name: 'One more' })).toEqual({ ok: false, reason: 'too_many_pending' })
      expect((await createTeaRequest(db, { userId: otherId, name: 'One more' })).ok).toBe(true)
    })

    it('keeps the cap under concurrent submits', async () => {
      const results = await Promise.all(
        Array.from({ length: MAX_PENDING_REQUESTS_PER_USER + 4 }, (_, i) =>
          createTeaRequest(db, { userId, name: `Parallel ${i}` }),
        ),
      )
      expect(results.filter((r) => r.ok)).toHaveLength(MAX_PENDING_REQUESTS_PER_USER)
    })

    it('rejects a pending duplicate of the same name and brand, ignoring case', async () => {
      await createTeaRequest(db, { userId, name: 'Silver Needle', brand: 'TWG' })
      expect(await createTeaRequest(db, { userId: otherId, name: 'silver needle', brand: 'twg' })).toEqual({
        ok: false,
        reason: 'duplicate',
      })
      expect((await createTeaRequest(db, { userId: otherId, name: 'Silver Needle', brand: 'Other' })).ok).toBe(true)
      expect((await createTeaRequest(db, { userId: otherId, name: 'Silver Needle' })).ok).toBe(true)
    })

    it('lists the admin queue with requester names in one query and tracks approval', async () => {
      const first = await createTeaRequest(db, { userId, name: 'A' })
      await createTeaRequest(db, { userId: otherId, name: 'B' })
      if (!first.ok) throw new Error('unexpected')

      const queue = await listPendingRequestsWithUser(db)
      expect(queue.map((r) => [r.request.name, r.user.name])).toEqual([
        ['B', 'Test User'],
        ['A', 'Test User'],
      ])

      const approved = await markRequestApproved(db, first.request.id, teaId)
      expect(approved).toMatchObject({ status: 'approved', createdTeaId: teaId })
      expect(approved?.resolvedAt).toBeInstanceOf(Date)
      expect(await listPendingRequestsWithUser(db)).toHaveLength(1)
      expect((await listRequestsForUser(db, userId))[0].status).toBe('approved')
      expect(await markRequestApproved(db, 9999, teaId)).toBeNull()

      await db.delete(schema.teas).where(eq(schema.teas.id, teaId))
      expect((await listRequestsForUser(db, userId))[0].createdTeaId).toBeNull()
    })

    it('does not count approved requests toward the cap', async () => {
      for (let i = 0; i < MAX_PENDING_REQUESTS_PER_USER; i++) {
        const r = await createTeaRequest(db, { userId, name: `Tea ${i}` })
        if (r.ok && i === 0) await markRequestApproved(db, r.request.id, teaId)
      }
      expect((await createTeaRequest(db, { userId, name: 'Next' })).ok).toBe(true)
    })
  })

  it('refuses to delete a tea that still has reviews, but deletes an unused one', async () => {
    await createReview(db, { userId, teaId, score: 80 })
    await addFavorite(db, userId, teaId)
    expect(await countTeaDependents(db, teaId)).toEqual({
      reviews: 1,
      favorites: 1,
      wishlist: 0,
      listItems: 0,
      cellarItems: 0,
      sessions: 0,
    })
    expect(await deleteTea(db, teaId)).toEqual({ ok: false, reason: 'has_reviews', reviewCount: 1 })
    await expect(db.delete(schema.teas).where(eq(schema.teas.id, teaId))).rejects.toThrow()

    const unused = await seedTestTea(db, { name: 'Unused' })
    await addToWishlist(db, userId, unused.id)
    expect(await deleteTea(db, unused.id)).toEqual({ ok: true })
    expect(await deleteTea(db, unused.id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await db.select().from(schema.wishlist)).toHaveLength(0)
  })
})
