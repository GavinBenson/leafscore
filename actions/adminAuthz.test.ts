import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { createReview } from '@/lib/data/reviews'
import { createReport } from '@/lib/data/reports'
import { createTeaRequest } from '@/lib/data/teaRequests'

type SessionUser = { id: string; email: string; isAdmin?: boolean; isBanned?: boolean } | null
const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  session: null as SessionUser,
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
// The real getCurrentUser runs on top of this fake session.
vi.mock('@/lib/auth', () => ({ auth: async () => (mocks.session ? { user: mocks.session } : null) }))
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

const { createTea, deleteTea } = await import('./admin')
const { handleTeaRequest, approveRequestWithTea } = await import('./teaRequests')
const { resolveReportAction } = await import('./reports')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('admin action authorization', () => {
  let adminId: number
  let userId: number
  let teaId: number
  let requestId: number
  let reportId: number

  const asAdmin = () => ({ id: String(adminId), email: 'admin@example.com', isAdmin: true })
  const teaCount = async () => (await mocks.db.select().from(schema.teas)).length

  const actions: Record<string, () => Promise<unknown>> = {
    createTea: () => createTea(form({ name: 'New', type: 'Green' })),
    deleteTea: () => deleteTea(teaId),
    handleTeaRequest: () => handleTeaRequest(requestId, 'rejected'),
    approveRequestWithTea: () =>
      approveRequestWithTea(form({ requestId: String(requestId), name: 'New', type: 'Green' })),
    resolveReportAction: () => resolveReportAction(reportId, 'dismiss'),
  }

  beforeEach(async () => {
    mocks.db = await boot()
    adminId = (await seedTestUser(mocks.db, 'admin@example.com')).id
    userId = (await seedTestUser(mocks.db, 'user@example.com')).id
    const author = (await seedTestUser(mocks.db, 'author@example.com')).id
    teaId = (await seedTestTea(mocks.db)).id
    const review = await createReview(mocks.db, { userId: author, teaId, score: 50 })
    expect((await createReport(mocks.db, { reviewId: review.id, reporterUserId: userId, reason: 'spam' })).ok).toBe(true)
    reportId = (await mocks.db.select().from(schema.reports))[0].id
    expect((await createTeaRequest(mocks.db, { userId, name: 'Wanted', type: 'Green' })).ok).toBe(true)
    requestId = (await mocks.db.select().from(schema.teaRequests))[0].id
    mocks.session = null
  })

  for (const [name, run] of Object.entries(actions)) {
    describe(name, () => {
      it('rejects a signed-out user', async () => {
        mocks.session = null
        await expect(run()).rejects.toThrow('Forbidden')
      })
      it('rejects a non-admin user', async () => {
        mocks.session = { id: String(userId), email: 'user@example.com', isAdmin: false }
        await expect(run()).rejects.toThrow('Forbidden')
      })
      it('rejects a banned admin (session flag)', async () => {
        mocks.session = { ...asAdmin(), isBanned: true }
        await expect(run()).rejects.toThrow('Forbidden')
      })
    })
  }

  it('a rejected call changes nothing', async () => {
    mocks.session = { id: String(userId), email: 'user@example.com' }
    const before = await teaCount()
    await expect(actions.createTea()).rejects.toThrow()
    await expect(actions.deleteTea()).rejects.toThrow()
    await expect(actions.handleTeaRequest()).rejects.toThrow()
    expect(await teaCount()).toBe(before)
    const [r] = await mocks.db.select().from(schema.teaRequests).where(eq(schema.teaRequests.id, requestId))
    expect(r.status).toBe('pending')
  })

  describe('admin banned in the database while the session is stale', () => {
    beforeEach(async () => {
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, adminId))
      mocks.session = asAdmin()
    })
    it.each(Object.keys(actions))('%s is rejected', async (name) => {
      await expect(actions[name]()).rejects.toThrow('Forbidden')
    })
  })

  describe('as a real admin', () => {
    beforeEach(() => {
      mocks.session = asAdmin()
    })

    it('createTea inserts and redirects; invalid input throws', async () => {
      vi.mocked(updateTag).mockClear()
      await expect(createTea(form({ name: 'New Tea', type: 'Green' }))).rejects.toThrow('REDIRECT:/admin/teas')
      expect(updateTag).toHaveBeenCalledWith('teas')
      expect(updateTag).toHaveBeenCalledWith('sitemap')
      expect((await mocks.db.select().from(schema.teas)).some((t) => t.name === 'New Tea')).toBe(true)
      await expect(createTea(form({ name: '  ', type: 'Green' }))).rejects.toThrow('Name')
    })

    it('deleteTea deletes an unreviewed tea and explains a reviewed one', async () => {
      const lonely = (await seedTestTea(mocks.db, { name: 'Lonely' })).id
      vi.mocked(updateTag).mockClear()
      await expect(deleteTea(lonely)).rejects.toThrow('REDIRECT:/admin/teas')
      expect(updateTag).toHaveBeenCalledWith('teas')
      expect(updateTag).toHaveBeenCalledWith('sitemap')
      expect(await mocks.db.select().from(schema.teas).where(eq(schema.teas.id, lonely))).toHaveLength(0)
      expect(await deleteTea(teaId)).toEqual({ ok: false, message: 'This tea has 1 review and cannot be deleted.' })
      expect(await deleteTea(-1)).toEqual({ ok: false, message: 'Invalid tea.' })
    })

    it('handleTeaRequest validates status', async () => {
      expect((await handleTeaRequest(requestId, 'bogus')).ok).toBe(false)
      expect((await handleTeaRequest(requestId, 'approved')).ok).toBe(false)
      expect((await mocks.db.select().from(schema.teaRequests))[0].status).toBe('pending')
      expect(await handleTeaRequest(requestId, 'rejected')).toEqual({ ok: true })
      expect((await mocks.db.select().from(schema.teaRequests))[0].status).toBe('rejected')
    })

    it('approveRequestWithTea creates the tea and approves', async () => {
      await expect(actions.approveRequestWithTea()).rejects.toThrow('REDIRECT:/admin/requests')
      const [r] = await mocks.db.select().from(schema.teaRequests)
      expect(r.status).toBe('approved')
      expect(r.createdTeaId).not.toBeNull()
    })

    it('resolveReportAction resolves and rejects a bad resolution', async () => {
      await expect(resolveReportAction(reportId, 'nope' as never)).rejects.toThrow('Bad resolution')
      await resolveReportAction(reportId, 'hide')
      expect((await mocks.db.select().from(schema.reports))[0].status).toBe('actioned')
    })
  })
})
