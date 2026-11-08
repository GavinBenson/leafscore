import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { createReview } from '@/lib/data/reviews'

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

const { submitTeaRequest, declineTeaRequest, approveRequestWithTea } = await import('./teaRequests')
const { submitReport, resolveReportAction } = await import('./reports')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('tea request and report actions', () => {
  let userId: number
  let authorId: number
  let adminId: number
  let reviewId: number

  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db, 'a@example.com')).id
    authorId = (await seedTestUser(mocks.db, 'b@example.com')).id
    adminId = (await seedTestUser(mocks.db, 'admin@example.com')).id
    const teaId = (await seedTestTea(mocks.db)).id
    reviewId = (await createReview(mocks.db, { userId: authorId, teaId, score: 50 })).id
    mocks.user = { id: userId, isPremium: false, isAdmin: false }
  })

  describe('submitTeaRequest', () => {
    it('validates input and echoes it back', async () => {
      const state = await submitTeaRequest({}, form({ name: '   ', brand: 'x', type: 'Nope' }))
      expect(state.fieldErrors).toHaveProperty('name')
      expect(state.fieldErrors).toHaveProperty('type')
      expect(state.values?.brand).toBe('x')
      const long = await submitTeaRequest({}, form({ name: 'a'.repeat(121) }))
      expect(long.fieldErrors).toHaveProperty('name')
    })

    it('saves a request and redirects', async () => {
      await expect(submitTeaRequest({}, form({ name: ' Sencha ', type: 'Green' }))).rejects.toThrow(
        'REDIRECT:/requests?sent=1',
      )
      const rows = await mocks.db.select().from(schema.teaRequests)
      expect(rows).toMatchObject([{ name: 'Sencha', userId, type: 'Green' }])
    })

    it('maps duplicate and cap failures to messages', async () => {
      await expect(submitTeaRequest({}, form({ name: 'Sencha' }))).rejects.toThrow('REDIRECT')
      expect((await submitTeaRequest({}, form({ name: 'sencha' }))).message).toContain('already asked')
      for (let i = 0; i < 4; i++) {
        await expect(submitTeaRequest({}, form({ name: `Tea ${i}` }))).rejects.toThrow('REDIRECT')
      }
      expect((await submitTeaRequest({}, form({ name: 'One more' }))).message).toContain('requests waiting')
    })

    it('requires sign-in and blocks banned users', async () => {
      mocks.user = null
      expect((await submitTeaRequest({}, form({ name: 'Sencha' }))).message).toContain('Sign in')
      mocks.user = { id: userId, isPremium: false, isAdmin: false }
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect((await submitTeaRequest({}, form({ name: 'Sencha' }))).message).toContain('restricted')
      expect(await mocks.db.select().from(schema.teaRequests)).toEqual([])
    })
  })

  describe('admin request handling', () => {
    async function seedRequest() {
      const [r] = await mocks.db
        .insert(schema.teaRequests)
        .values({ userId, name: 'Sencha', type: 'Green' })
        .returning()
      return r
    }

    it('rejects non-admins', async () => {
      const r = await seedRequest()
      await expect(declineTeaRequest(r.id)).rejects.toThrow('Forbidden')
      await expect(
        approveRequestWithTea(form({ requestId: String(r.id), name: 'Sencha', type: 'Green' })),
      ).rejects.toThrow('Forbidden')
    })

    it('creates the tea and marks the request approved in one step', async () => {
      mocks.user = { id: adminId, isPremium: false, isAdmin: true }
      const r = await seedRequest()
      await expect(
        approveRequestWithTea(form({ requestId: String(r.id), name: 'Sencha', type: 'Green' })),
      ).rejects.toThrow('REDIRECT:/admin/requests')
      const [updated] = await mocks.db.select().from(schema.teaRequests).where(eq(schema.teaRequests.id, r.id))
      expect(updated.status).toBe('approved')
      expect(updated.createdTeaId).not.toBeNull()
      expect(updateTag).toHaveBeenCalledWith('teas')
      expect(updateTag).toHaveBeenCalledWith('sitemap')
    })

    it('double approve from two tabs creates one tea', async () => {
      mocks.user = { id: adminId, isPremium: false, isAdmin: true }
      const r = await seedRequest()
      const approve = (name: string) =>
        approveRequestWithTea(form({ requestId: String(r.id), name, type: 'Green' })).catch((e: Error) => e.message)
      const outcomes = await Promise.all([approve('Sencha A'), approve('Sencha B')])
      expect(outcomes).toEqual(['REDIRECT:/admin/requests', 'REDIRECT:/admin/requests'])
      const teaNames = (await mocks.db.select().from(schema.teas)).map((t) => t.name)
      expect(teaNames.filter((n) => n.startsWith('Sencha '))).toHaveLength(1)
    })

    it('declines a pending request', async () => {
      mocks.user = { id: adminId, isPremium: false, isAdmin: true }
      const r = await seedRequest()
      await declineTeaRequest(r.id)
      const [updated] = await mocks.db.select().from(schema.teaRequests).where(eq(schema.teaRequests.id, r.id))
      expect(updated.status).toBe('rejected')
    })
  })

  describe('reports', () => {
    it('files a report, handles duplicates and own reviews', async () => {
      const ok = await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam', details: 'ads' }))
      expect(ok.done).toBe(true)
      const dup = await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))
      expect(dup.done).toBe(true)
      expect(dup.message).toContain('already reported')
      expect(await mocks.db.select().from(schema.reports)).toHaveLength(1)

      mocks.user = { id: authorId, isPremium: false, isAdmin: false }
      expect((await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))).message).toContain(
        'own review',
      )
    })

    it('rejects bad reasons, long details, banned and signed-out reporters', async () => {
      expect((await submitReport({}, form({ reviewId: String(reviewId), reason: 'bogus' }))).message).toContain(
        'reason',
      )
      expect(
        (await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam', details: 'x'.repeat(501) })))
          .message,
      ).toContain('500')
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect((await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))).message).toContain(
        'restricted',
      )
      mocks.user = null
      expect((await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))).message).toContain(
        'Sign in',
      )
      expect(await mocks.db.select().from(schema.reports)).toEqual([])
    })

    it('refuses to ban an admin author and changes nothing', async () => {
      await mocks.db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, authorId))
      await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))
      const [report] = await mocks.db.select().from(schema.reports)
      mocks.user = { id: adminId, isPremium: false, isAdmin: true }
      await expect(resolveReportAction(report.id, 'hide_and_ban')).rejects.toThrow(
        'REDIRECT:/admin/reports?error=admin_author',
      )
      const [review] = await mocks.db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId))
      const [author] = await mocks.db.select().from(schema.users).where(eq(schema.users.id, authorId))
      expect(review.hidden).toBe(false)
      expect(author.bannedAt).toBeNull()
      const [still] = await mocks.db.select().from(schema.reports)
      expect(still.status).toBe('pending')
    })

    it('only admins resolve reports; hide and ban takes effect', async () => {
      await submitReport({}, form({ reviewId: String(reviewId), reason: 'spam' }))
      const [report] = await mocks.db.select().from(schema.reports)
      await expect(resolveReportAction(report.id, 'hide_and_ban')).rejects.toThrow('Forbidden')

      mocks.user = { id: adminId, isPremium: false, isAdmin: true }
      vi.mocked(updateTag).mockClear()
      await resolveReportAction(report.id, 'hide_and_ban')
      const teaIdOfReview = (await mocks.db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId)))[0].teaId
      const tags = vi.mocked(updateTag).mock.calls.map((c) => c[0])
      expect(tags).toEqual(
        expect.arrayContaining(['teas', `tea:${teaIdOfReview}`, `profile:${authorId}`, 'review-authors', 'tea-pages']),
      )
      const [review] = await mocks.db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId))
      const [author] = await mocks.db.select().from(schema.users).where(eq(schema.users.id, authorId))
      expect(review.hidden).toBe(true)
      expect(author.bannedAt).not.toBeNull()
    })
  })
})
