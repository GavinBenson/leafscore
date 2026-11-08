import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { revalidatePath, updateTag } from 'next/cache'
import * as schema from '@/db/schema'
import type { createTestDb } from '@/db/testDb'
import { getListWithTeas, listPublicLists } from '@/lib/data/lists'

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

const {
  createListAction,
  updateListAction,
  deleteListAction,
  setTeaInListAction,
  createListWithTeaAction,
  moveTeaInListAction,
  removeTeaFromListAction,
} = await import('./lists')
const { submitReport, resolveReportAction } = await import('./reports')
const { createTestDb: boot, seedTestTea, seedTestUser } = await import('@/db/testDb')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('list actions', () => {
  let userId: number
  let otherId: number
  let adminId: number
  let teaA: number
  let teaB: number
  let teaC: number

  const as = (id: number, opts: { isPremium?: boolean; isAdmin?: boolean } = {}) => {
    mocks.user = { id, isPremium: opts.isPremium ?? false, isAdmin: opts.isAdmin ?? false }
  }
  const newList = async (owner: number, over: Partial<typeof schema.lists.$inferInsert> = {}) =>
    (await mocks.db.insert(schema.lists).values({ userId: owner, title: 'L', ...over }).returning())[0]

  beforeEach(async () => {
    vi.mocked(updateTag).mockClear()
    vi.mocked(revalidatePath).mockClear()
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db, 'a@example.com')).id
    otherId = (await seedTestUser(mocks.db, 'b@example.com')).id
    adminId = (await seedTestUser(mocks.db, 'admin@example.com')).id
    teaA = (await seedTestTea(mocks.db, { name: 'A' })).id
    teaB = (await seedTestTea(mocks.db, { name: 'B' })).id
    teaC = (await seedTestTea(mocks.db, { name: 'C' })).id
    as(userId)
  })

  describe('createListAction', () => {
    it('creates a list, refreshes caches and redirects to the editor', async () => {
      const outcome = await createListAction({}, form({ title: ' Morning ', description: 'x', isPublic: 'on' })).catch(
        (e: Error) => e.message,
      )
      const [row] = await mocks.db.select().from(schema.lists)
      expect(outcome).toBe(`REDIRECT:/lists/${row.id}/edit`)
      expect(row).toMatchObject({ title: 'Morning', userId, isPublic: true })
      expect(updateTag).toHaveBeenCalledWith('lists')
      expect(updateTag).toHaveBeenCalledWith('sitemap')
    })

    it('echoes input and field errors for an invalid title', async () => {
      const state = await createListAction({}, form({ title: '   ', description: 'keep me' }))
      expect(state.fieldErrors).toHaveProperty('title')
      expect(state.values?.description).toBe('keep me')
      expect(await mocks.db.select().from(schema.lists)).toEqual([])
    })

    it('caps free accounts at 3 lists with an upgrade message, premium goes further', async () => {
      for (let i = 0; i < 3; i++) await newList(userId)
      const blocked = await createListAction({}, form({ title: 'Fourth' }))
      expect(blocked.message).toContain('Upgrade to Premium')
      expect(await mocks.db.$count(schema.lists, eq(schema.lists.userId, userId))).toBe(3)

      as(userId, { isPremium: true })
      await expect(createListAction({}, form({ title: 'Fourth' }))).rejects.toThrow('REDIRECT')
      expect(await mocks.db.$count(schema.lists, eq(schema.lists.userId, userId))).toBe(4)
    })

    it('requires sign-in and blocks banned users', async () => {
      mocks.user = null
      expect((await createListAction({}, form({ title: 'x' }))).message).toContain('Sign in')
      as(userId)
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect((await createListAction({}, form({ title: 'x' }))).message).toContain('restricted')
      expect(await mocks.db.select().from(schema.lists)).toEqual([])
    })
  })

  describe('ownership', () => {
    it('only the owner can update or delete a list', async () => {
      const list = await newList(userId, { title: 'Mine' })
      as(otherId)
      expect((await updateListAction({}, form({ listId: String(list.id), title: 'Hacked' }))).message).toContain(
        "couldn't find",
      )
      expect((await deleteListAction(list.id)).ok).toBe(false)
      const [row] = await mocks.db.select().from(schema.lists)
      expect(row.title).toBe('Mine')

      as(userId)
      const saved = await updateListAction({}, form({ listId: String(list.id), title: 'Renamed', isPublic: 'on' }))
      expect(saved.saved).toBe(true)
      expect((await mocks.db.select().from(schema.lists))[0]).toMatchObject({ title: 'Renamed', isPublic: true })
      expect((await deleteListAction(list.id)).ok).toBe(true)
      expect(await mocks.db.select().from(schema.lists)).toEqual([])
    })

    it('cannot add teas to, remove from or reorder another user list', async () => {
      const list = await newList(userId)
      await setTeaInListAction(list.id, teaA, true)
      as(otherId)
      expect((await setTeaInListAction(list.id, teaB, true)).ok).toBe(false)
      expect((await removeTeaFromListAction(list.id, teaA)).ok).toBe(false)
      expect((await moveTeaInListAction(list.id, teaA, 'down')).ok).toBe(false)
      expect(await mocks.db.$count(schema.listItems)).toBe(1)
    })

    it('rejects bad ids without throwing', async () => {
      expect((await deleteListAction(-1)).ok).toBe(false)
      expect((await setTeaInListAction(1.5, 1, true)).ok).toBe(false)
      expect((await moveTeaInListAction(1, 1, 'sideways' as 'up')).ok).toBe(false)
    })
  })

  describe('teas in a list', () => {
    it('adds, is idempotent, removes and reorders with up/down', async () => {
      const list = await newList(userId)
      expect(await setTeaInListAction(list.id, teaA, true)).toMatchObject({ ok: true, contains: true })
      await setTeaInListAction(list.id, teaA, true)
      await setTeaInListAction(list.id, teaB, true)
      await setTeaInListAction(list.id, teaC, true)
      const order = async () => (await getListWithTeas(mocks.db, list.id, userId))!.teas.map((t) => t.tea.id)
      expect(await order()).toEqual([teaA, teaB, teaC])

      expect((await moveTeaInListAction(list.id, teaC, 'up')).ok).toBe(true)
      expect(await order()).toEqual([teaA, teaC, teaB])
      // Edges are a harmless no-op.
      expect((await moveTeaInListAction(list.id, teaA, 'up')).ok).toBe(true)
      expect(await order()).toEqual([teaA, teaC, teaB])

      expect((await setTeaInListAction(list.id, teaC, false)).ok).toBe(true)
      expect(await order()).toEqual([teaA, teaB])
    })

    it('reports a missing tea', async () => {
      const list = await newList(userId)
      expect((await setTeaInListAction(list.id, 9999, true)).message).toContain('no longer available')
    })

    it('creates a list with the tea in one step and enforces the cap', async () => {
      const result = await createListWithTeaAction(teaA, 'Quick')
      expect(result.ok).toBe(true)
      expect(await mocks.db.$count(schema.listItems)).toBe(1)
      await newList(userId)
      await newList(userId)
      const capped = await createListWithTeaAction(teaA, 'Too many')
      expect(capped).toMatchObject({ ok: false, limitReached: true })
      expect(capped.message).toContain('Upgrade to Premium')
    })
  })

  describe('visibility via the data layer', () => {
    it('hides private, hidden and banned-author lists from strangers; the author still sees hidden', async () => {
      const pub = await newList(userId, { isPublic: true })
      await mocks.db.insert(schema.listItems).values({ listId: pub.id, teaId: teaA, position: 1 })
      expect(await getListWithTeas(mocks.db, pub.id)).not.toBeNull()
      expect(await getListWithTeas(mocks.db, pub.id, otherId)).not.toBeNull()

      await mocks.db.update(schema.lists).set({ hidden: true }).where(eq(schema.lists.id, pub.id))
      expect(await getListWithTeas(mocks.db, pub.id)).toBeNull()
      expect(await getListWithTeas(mocks.db, pub.id, otherId)).toBeNull()
      expect((await getListWithTeas(mocks.db, pub.id, userId))?.list.hidden).toBe(true)

      await mocks.db.update(schema.lists).set({ hidden: false }).where(eq(schema.lists.id, pub.id))
      await mocks.db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
      expect(await getListWithTeas(mocks.db, pub.id)).toBeNull()
      expect(await listPublicLists(mocks.db)).toEqual([])
    })
  })

  describe('reporting lists', () => {
    it('lets a stranger report a public list, once; not the owner, not a private list', async () => {
      const list = await newList(userId, { isPublic: true })
      as(otherId)
      expect(await submitReport({}, form({ listId: String(list.id), reason: 'spam' }))).toEqual({ done: true })
      const [report] = await mocks.db.select().from(schema.reports)
      expect(report).toMatchObject({ listId: list.id, reviewId: null, reporterUserId: otherId })
      expect((await submitReport({}, form({ listId: String(list.id), reason: 'spam' }))).message).toContain(
        'already reported this list',
      )

      as(userId)
      expect((await submitReport({}, form({ listId: String(list.id), reason: 'spam' }))).message).toContain(
        "can't report your own list",
      )
      const priv = await newList(userId)
      as(otherId)
      expect((await submitReport({}, form({ listId: String(priv.id), reason: 'spam' }))).message).toContain(
        'no longer available',
      )
      expect((await submitReport({}, form({ listId: 'abc', reason: 'spam' }))).message).toContain("couldn't find that list")
    })

    it('admins hide a reported list (and ban the author); non-admins cannot', async () => {
      const list = await newList(userId, { isPublic: true })
      await mocks.db.insert(schema.listItems).values({ listId: list.id, teaId: teaA, position: 1 })
      as(otherId)
      await submitReport({}, form({ listId: String(list.id), reason: 'offensive' }))
      const [report] = await mocks.db.select().from(schema.reports)

      await expect(resolveReportAction(report.id, 'hide_list')).rejects.toThrow('Forbidden')

      as(adminId, { isAdmin: true })
      await resolveReportAction(report.id, 'hide_list_and_ban')
      expect((await mocks.db.select().from(schema.lists))[0].hidden).toBe(true)
      expect((await mocks.db.select().from(schema.users).where(eq(schema.users.id, userId)))[0].bannedAt).not.toBeNull()
      expect(updateTag).toHaveBeenCalledWith('lists')
      expect(updateTag).toHaveBeenCalledWith('sitemap')
      expect(await listPublicLists(mocks.db)).toEqual([])
    })

    it('refuses to ban an admin author and leaves the list alone', async () => {
      await mocks.db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, userId))
      const list = await newList(userId, { isPublic: true })
      as(otherId)
      await submitReport({}, form({ listId: String(list.id), reason: 'spam' }))
      const [report] = await mocks.db.select().from(schema.reports)
      as(adminId, { isAdmin: true })
      await expect(resolveReportAction(report.id, 'hide_list_and_ban')).rejects.toThrow(
        'REDIRECT:/admin/reports?error=admin_author',
      )
      expect((await mocks.db.select().from(schema.lists))[0].hidden).toBe(false)
    })

    it('rejects a review resolution on a list report without changing anything', async () => {
      const list = await newList(userId, { isPublic: true })
      as(otherId)
      await submitReport({}, form({ listId: String(list.id), reason: 'spam' }))
      const [report] = await mocks.db.select().from(schema.reports)
      as(adminId, { isAdmin: true })
      await resolveReportAction(report.id, 'hide')
      expect((await mocks.db.select().from(schema.reports))[0].status).toBe('pending')
      expect((await mocks.db.select().from(schema.lists))[0].hidden).toBe(false)
    })
  })
})
