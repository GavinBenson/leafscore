import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath, updateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { createReview, getReview, listReviewsForTea } from '@/lib/data/reviews'
import { getUserById } from '@/lib/data/users'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean } | null,
  upload: vi.fn(async (): Promise<string> => 'https://blob/new.png'),
  remove: vi.fn(async () => {}),
  failWrite: null as null | 'create' | 'updateNull',
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/data/reviews', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/reviews')>()
  return {
    ...actual,
    createReview: ((...args: Parameters<typeof actual.createReview>) => {
      if (mocks.failWrite === 'create') throw new Error('db down')
      return actual.createReview(...args)
    }) as typeof actual.createReview,
    updateReview: ((...args: Parameters<typeof actual.updateReview>) =>
      mocks.failWrite === 'updateNull' ? Promise.resolve(null) : actual.updateReview(...args)) as typeof actual.updateReview,
  }
})
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/photos', () => ({ uploadReviewPhoto: mocks.upload, deleteReviewPhoto: mocks.remove }))
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

const { removeReview, saveReviewEdit, submitReview } = await import('./reviews')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function form(values: Record<string, string | File>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('review actions', () => {
  let userId: number
  let otherUserId: number
  let teaId: number

  beforeEach(async () => {
    mocks.db = await boot()
    mocks.upload.mockClear()
    mocks.upload.mockImplementation(async () => 'https://blob/new.png')
    mocks.remove.mockClear()
    mocks.failWrite = null
    userId = (await seedTestUser(mocks.db)).id
    otherUserId = (await seedTestUser(mocks.db, 'other@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    mocks.user = { id: userId, isPremium: false }
  })

  const reviews = () => listReviewsForTea(mocks.db, teaId)

  describe('submitReview', () => {
    it('saves a valid review and redirects to the tea', async () => {
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow(`REDIRECT:/browse/${teaId}?reviewed=1`)
      expect((await reviews())[0].review.userId).toBe(userId)
    })

    it('refreshes the prerendered home page, which shows tea scores', async () => {
      vi.mocked(revalidatePath).mockClear()
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow('REDIRECT')
      expect(revalidatePath).toHaveBeenCalledWith('/')
    })

    it('invalidates the tea, listings, sitemap and author profile caches', async () => {
      vi.mocked(updateTag).mockClear()
      vi.mocked(revalidatePath).mockClear()
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow('REDIRECT')
      const tags = vi.mocked(updateTag).mock.calls.map((c) => c[0])
      expect(tags).toEqual(expect.arrayContaining(['teas', `tea:${teaId}`, 'sitemap', `profile:${userId}`, 'review-authors']))
      expect(revalidatePath).toHaveBeenCalledWith(`/u/${userId}`)
    })

    it('ignores any user id sent by the client', async () => {
      await expect(
        submitReview({}, form({ teaId: String(teaId), score: '85', userId: String(otherUserId) })),
      ).rejects.toThrow('REDIRECT')
      expect((await reviews())[0].review.userId).toBe(userId)
    })

    it('asks a signed-out visitor to sign in and saves nothing', async () => {
      mocks.user = null
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85' }))
      expect(state.message).toContain('Sign in')
      expect(await reviews()).toEqual([])
    })

    it('returns field errors for invalid input', async () => {
      const state = await submitReview({}, form({ teaId: String(teaId), score: '101', brewMethod: 'microwave' }))
      expect(state.fieldErrors).toHaveProperty('score')
      expect(state.fieldErrors).toHaveProperty('brewMethod')
      expect(await reviews()).toEqual([])
    })

    it('rejects a tea or flavor tag that does not exist', async () => {
      expect((await submitReview({}, form({ teaId: '9999', score: '85' }))).fieldErrors).toHaveProperty('teaId')
      expect(
        (await submitReview({}, form({ teaId: String(teaId), score: '85', tagIds: '9999' }))).fieldErrors,
      ).toHaveProperty('tagIds')
      expect(await reviews()).toEqual([])
    })

    it('saves one review from a double submit', async () => {
      const values = { teaId: String(teaId), score: '85', notes: 'same' }
      await expect(submitReview({}, form(values))).rejects.toThrow('REDIRECT')
      await expect(submitReview({}, form(values))).rejects.toThrow('REDIRECT')
      expect(await reviews()).toHaveLength(1)
    })

    it('turns a second review of the same tea into a friendly error with an edit target', async () => {
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85', notes: 'first' }))).rejects.toThrow('REDIRECT')
      const state = await submitReview({}, form({ teaId: String(teaId), score: '60', notes: 'second' }))
      expect(state.message).toBe("You've already reviewed this tea.")
      expect(state.existingReviewId).toBe((await reviews())[0].review.id)
      expect(await reviews()).toHaveLength(1)
    })

    it('blocks a banned user', async () => {
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85' }))
      expect(state.message).toContain('restricted')
      expect(await reviews()).toEqual([])
    })

    it('stops after the daily cap', async () => {
      await mocks.db.insert(schema.rateLimits).values({ key: `review:u:${userId}`, windowStart: new Date(), count: 20 })
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85' }))
      expect(state.message).toContain('Too many requests')
      expect(await reviews()).toEqual([])
    })

    it('uploads a valid photo and rejects a disguised one before uploading', async () => {
      const fake = new File(['<svg></svg>'], 'x.png', { type: 'image/png' })
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85', photo: fake }))
      expect(state.fieldErrors).toHaveProperty('photo')
      expect(mocks.upload).not.toHaveBeenCalled()

      const real = new File([PNG], 'x.png', { type: 'image/png' })
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85', photo: real }))).rejects.toThrow('REDIRECT')
      expect((await reviews())[0].review.photoUrl).toBe('https://blob/new.png')
    })

    it('keeps the form when an upload fails', async () => {
      mocks.upload.mockImplementation(async () => {
        throw new Error('Blob down')
      })
      const real = new File([PNG], 'x.png', { type: 'image/png' })
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85', photo: real }))
      expect(state.fieldErrors?.photo).toContain('upload')
      expect(await reviews()).toEqual([])
    })
  })

  describe('photo orphans', () => {
    const real = () => new File([PNG], 'x.png', { type: 'image/png' })

    it('deletes the new blob when the review cannot be created', async () => {
      mocks.failWrite = 'create'
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85', photo: real() }))
      expect(state.message).toContain("couldn't save")
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/new.png')
    })

    it('deletes the new blob when the edit finds no review to update', async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80, photoUrl: 'https://blob/old.png' })
      mocks.failWrite = 'updateNull'
      const state = await saveReviewEdit({}, form({ reviewId: String(review.id), teaId: String(teaId), score: '40', photo: real() }))
      expect(state.message).toContain("couldn't find")
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/new.png')
      expect(mocks.remove).not.toHaveBeenCalledWith('https://blob/old.png')
    })
  })

  describe('units, rubric and blind choice', () => {
    it('stores a Fahrenheit input as Celsius', async () => {
      await expect(
        submitReview({}, form({ teaId: String(teaId), score: '85', brewTemp: '203', brewTempUnit: 'f' })),
      ).rejects.toThrow('REDIRECT:')
      expect((await reviews())[0].review.brewTemp).toBe(95)
    })

    it('rejects an out-of-range Fahrenheit input without saving', async () => {
      const state = await submitReview({}, form({ teaId: String(teaId), score: '85', brewTemp: '300', brewTempUnit: 'f' }))
      expect(state.fieldErrors?.brewTemp).toBeTruthy()
      expect(await reviews()).toHaveLength(0)
    })

    it('saves sub-scores, and an edit can change and clear them', async () => {
      await expect(
        submitReview({}, form({ teaId: String(teaId), score: '85', aromaScore: '90', bodyScore: '40' })),
      ).rejects.toThrow('REDIRECT:')
      const created = (await reviews())[0].review
      expect(created).toMatchObject({ aromaScore: 90, bodyScore: 40, flavorScore: null })
      await expect(
        saveReviewEdit({}, form({ reviewId: String(created.id), teaId: String(teaId), score: '85', aromaScore: '', bodyScore: '55', brewTemp: '176', brewTempUnit: 'f' })),
      ).rejects.toThrow('REDIRECT:')
      expect(await getReview(mocks.db, created.id)).toMatchObject({ aromaScore: null, bodyScore: 55, brewTemp: 80, score: 85 })
    })

    it('remembers the blind toggle as the default preference', async () => {
      await expect(
        submitReview({}, form({ teaId: String(teaId), score: '85', blindTasting: 'true' })),
      ).rejects.toThrow('REDIRECT:')
      expect((await getUserById(mocks.db, userId))?.blindTasting).toBe(true)
    })

    it('leaves the preference alone without the toggle', async () => {
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow('REDIRECT:')
      expect((await getUserById(mocks.db, userId))?.blindTasting).toBe(false)
    })
  })

  describe('saveReviewEdit', () => {
    const seed = (photoUrl: string | null = null) =>
      createReview(mocks.db, { userId, teaId, score: 80, notes: 'old', photoUrl })
    const edit = (id: number, extra: Record<string, string | File> = {}) =>
      saveReviewEdit({}, form({ reviewId: String(id), teaId: String(teaId), score: '40', notes: 'new', ...extra }))

    it('saves changes and redirects', async () => {
      const review = await seed()
      vi.mocked(updateTag).mockClear()
      await expect(edit(review.id)).rejects.toThrow(`REDIRECT:/browse/${teaId}`)
      expect((await getReview(mocks.db, review.id))?.notes).toBe('new')
      expect(updateTag).toHaveBeenCalledWith(`tea:${teaId}`)
      expect(updateTag).toHaveBeenCalledWith('teas')
    })

    it("refuses someone else's review", async () => {
      const review = await seed()
      mocks.user = { id: otherUserId, isPremium: false }
      expect((await edit(review.id)).message).toContain("couldn't find")
      expect((await getReview(mocks.db, review.id))?.notes).toBe('old')
    })

    it('cannot move a review to another tea', async () => {
      const review = await seed()
      const other = await seedTestTea(mocks.db, { name: 'Other' })
      await expect(edit(review.id, { teaId: String(other.id) })).rejects.toThrow(`REDIRECT:/browse/${teaId}`)
      expect((await getReview(mocks.db, review.id))?.teaId).toBe(teaId)
    })

    it('keeps the photo by default', async () => {
      const review = await seed('https://blob/old.png')
      await expect(edit(review.id)).rejects.toThrow('REDIRECT')
      expect((await getReview(mocks.db, review.id))?.photoUrl).toBe('https://blob/old.png')
      expect(mocks.remove).toHaveBeenCalledWith(null)
    })

    it('replaces a photo and deletes the old blob', async () => {
      const review = await seed('https://blob/old.png')
      const real = new File([PNG], 'x.png', { type: 'image/png' })
      await expect(edit(review.id, { photo: real })).rejects.toThrow('REDIRECT')
      expect((await getReview(mocks.db, review.id))?.photoUrl).toBe('https://blob/new.png')
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/old.png')
    })

    it('removes a photo on request', async () => {
      const review = await seed('https://blob/old.png')
      await expect(edit(review.id, { removePhoto: 'true' })).rejects.toThrow('REDIRECT')
      expect((await getReview(mocks.db, review.id))?.photoUrl).toBeNull()
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/old.png')
    })
  })

  describe('removeReview', () => {
    it('deletes the review and its photo', async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80, photoUrl: 'https://blob/p.png' })
      vi.mocked(updateTag).mockClear()
      await expect(removeReview(review.id, teaId, {}, form({}))).rejects.toThrow('REDIRECT:/browse/' + teaId)
      expect(await getReview(mocks.db, review.id)).toBeNull()
      expect(updateTag).toHaveBeenCalledWith(`tea:${teaId}`)
      expect(updateTag).toHaveBeenCalledWith(`profile:${userId}`)
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/p.png')
    })

    it("leaves someone else's review and photo alone", async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80, photoUrl: 'https://blob/p.png' })
      mocks.user = { id: otherUserId, isPremium: false }
      await expect(removeReview(review.id, teaId, {}, form({}))).rejects.toThrow('REDIRECT:/browse/' + teaId)
      expect(await getReview(mocks.db, review.id)).not.toBeNull()
      expect(mocks.remove).toHaveBeenCalledWith(undefined)
    })

    it('requires sign-in', async () => {
      mocks.user = null
      await expect(removeReview(1, teaId, {}, form({}))).rejects.toThrow('Unauthorized')
    })

    it('redirects to a safe returnTo and ignores an off-site one', async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80 })
      await expect(removeReview(review.id, teaId, {}, form({ returnTo: '/journal' }))).rejects.toThrow(
        'REDIRECT:/journal',
      )
      await expect(
        removeReview(review.id, teaId, {}, form({ returnTo: 'https://evil.test' })),
      ).rejects.toThrow('REDIRECT:/browse/' + teaId)
    })

    it('returns an error state instead of throwing when the delete fails', async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80 })
      mocks.remove.mockRejectedValueOnce(new Error('blob down'))
      const result = await removeReview(review.id, teaId, {}, form({ returnTo: '/journal' }))
      expect(result.message).toMatch(/couldn't delete/i)
    })
  })
})
