import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import type { createTestDb } from '@/db/testDb'
import { createReview, getReview, listReviewsForTea } from '@/lib/data/reviews'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number; isPremium: boolean } | null,
  upload: vi.fn(async (): Promise<string> => 'https://blob/new.png'),
  remove: vi.fn(async () => {}),
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/photos', () => ({ uploadReviewPhoto: mocks.upload, deleteReviewPhoto: mocks.remove }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
    userId = (await seedTestUser(mocks.db)).id
    otherUserId = (await seedTestUser(mocks.db, 'other@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    mocks.user = { id: userId, isPremium: false }
  })

  const reviews = () => listReviewsForTea(mocks.db, teaId)

  describe('submitReview', () => {
    it('saves a valid review and redirects to the tea', async () => {
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow(`REDIRECT:/browse/${teaId}`)
      expect((await reviews())[0].review.userId).toBe(userId)
    })

    it('refreshes the prerendered home page, which shows tea scores', async () => {
      vi.mocked(revalidatePath).mockClear()
      await expect(submitReview({}, form({ teaId: String(teaId), score: '85' }))).rejects.toThrow('REDIRECT')
      expect(revalidatePath).toHaveBeenCalledWith('/')
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

  describe('saveReviewEdit', () => {
    const seed = (photoUrl: string | null = null) =>
      createReview(mocks.db, { userId, teaId, score: 80, notes: 'old', photoUrl })
    const edit = (id: number, extra: Record<string, string | File> = {}) =>
      saveReviewEdit({}, form({ reviewId: String(id), teaId: String(teaId), score: '40', notes: 'new', ...extra }))

    it('saves changes and redirects', async () => {
      const review = await seed()
      await expect(edit(review.id)).rejects.toThrow(`REDIRECT:/browse/${teaId}`)
      expect((await getReview(mocks.db, review.id))?.notes).toBe('new')
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
      await expect(removeReview(review.id, teaId)).rejects.toThrow('REDIRECT')
      expect(await getReview(mocks.db, review.id)).toBeNull()
      expect(mocks.remove).toHaveBeenCalledWith('https://blob/p.png')
    })

    it("leaves someone else's review and photo alone", async () => {
      const review = await createReview(mocks.db, { userId, teaId, score: 80, photoUrl: 'https://blob/p.png' })
      mocks.user = { id: otherUserId, isPremium: false }
      await expect(removeReview(review.id, teaId)).rejects.toThrow('REDIRECT')
      expect(await getReview(mocks.db, review.id)).not.toBeNull()
      expect(mocks.remove).toHaveBeenCalledWith(undefined)
    })

    it('requires sign-in', async () => {
      mocks.user = null
      await expect(removeReview(1, teaId)).rejects.toThrow('Unauthorized')
    })
  })
})
