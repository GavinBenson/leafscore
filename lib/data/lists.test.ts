import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { FREE_LIST_LIMIT, MAX_TEAS_PER_LIST, PREMIUM_LIST_LIMIT } from '@/lib/premium'
import {
  addTeaToList,
  createList,
  deleteList,
  getListWithTeas,
  listListsForUser,
  listPublicLists,
  listsContainingTea,
  removeTeaFromList,
  reorderList,
  updateList,
} from './lists'
import { createReport, listPendingListReports, resolveReport } from './reports'
import { banUser } from './users'

describe('lists', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let owner: number
  let other: number
  let teaA: number
  let teaB: number
  let teaC: number

  beforeEach(async () => {
    db = await createTestDb()
    owner = (await seedTestUser(db, 'owner@example.com')).id
    other = (await seedTestUser(db, 'other@example.com')).id
    teaA = (await seedTestTea(db, { name: 'A' })).id
    teaB = (await seedTestTea(db, { name: 'B' })).id
    teaC = (await seedTestTea(db, { name: 'C' })).id
  })

  const make = async (title = 'Morning', isPublic = true, userId = owner) => {
    const result = await createList(db, { userId, title, isPublic }, false)
    if (!result.ok) throw new Error('create failed')
    return result.list
  }

  it('validates title and description', async () => {
    expect(await createList(db, { userId: owner, title: '   ' }, false)).toMatchObject({ ok: false, reason: 'invalid', field: 'title' })
    expect(await createList(db, { userId: owner, title: 'x'.repeat(81) }, false)).toMatchObject({ ok: false, field: 'title' })
    expect(await createList(db, { userId: owner, title: 'bad\ntitle' }, false)).toMatchObject({ ok: false, field: 'title' })
    expect(await createList(db, { userId: owner, title: 'ok', description: 'x'.repeat(501) }, false)).toMatchObject({
      ok: false,
      field: 'description',
    })
    const ok = await createList(db, { userId: owner, title: '  Trim me  ', description: '  ' }, false)
    expect(ok.ok && ok.list.title).toBe('Trim me')
    expect(ok.ok && ok.list.description).toBeNull()
    expect(ok.ok && ok.list.isPublic).toBe(false)
  })

  it('caps lists per user by premium status', async () => {
    for (let i = 0; i < FREE_LIST_LIMIT; i++) await make(`L${i}`)
    expect(await createList(db, { userId: owner, title: 'one more' }, false)).toEqual({
      ok: false,
      reason: 'limit_reached',
      limit: FREE_LIST_LIMIT,
    })
    expect((await createList(db, { userId: owner, title: 'premium' }, true)).ok).toBe(true)
    // Another user is unaffected.
    expect((await createList(db, { userId: other, title: 'mine' }, false)).ok).toBe(true)
    expect(PREMIUM_LIST_LIMIT).toBeGreaterThan(FREE_LIST_LIMIT)
  })

  it('keeps the cap under concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createList(db, { userId: owner, title: `C${i}` }, false)),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(FREE_LIST_LIMIT)
    expect((await listListsForUser(db, owner)).length).toBe(FREE_LIST_LIMIT)
  })

  it('only the owner can update, delete or edit a list', async () => {
    const list = await make()
    expect(await updateList(db, list.id, other, { title: 'Hacked' })).toEqual({ ok: false, reason: 'not_found' })
    expect(await deleteList(db, list.id, other)).toBe(false)
    expect(await addTeaToList(db, list.id, other, teaA)).toEqual({ ok: false, reason: 'not_found' })
    expect(await removeTeaFromList(db, list.id, other, teaA)).toBe(false)
    expect(await reorderList(db, list.id, other, [])).toEqual({ ok: false, reason: 'not_found' })

    const updated = await updateList(db, list.id, owner, { title: 'New', description: 'd', isPublic: false })
    expect(updated.ok && updated.list).toMatchObject({ title: 'New', description: 'd', isPublic: false })
    expect(await deleteList(db, list.id, owner)).toBe(true)
  })

  it('adds teas idempotently in order, removes and reorders them', async () => {
    const list = await make()
    expect(await addTeaToList(db, list.id, owner, teaA)).toEqual({ ok: true, alreadyInList: false })
    expect(await addTeaToList(db, list.id, owner, teaA)).toEqual({ ok: true, alreadyInList: true })
    await addTeaToList(db, list.id, owner, teaB)
    await addTeaToList(db, list.id, owner, teaC)
    expect(await addTeaToList(db, list.id, owner, 99_999)).toEqual({ ok: false, reason: 'tea_not_found' })

    const names = async () => (await getListWithTeas(db, list.id, owner))!.teas.map((t) => t.tea.name)
    expect(await names()).toEqual(['A', 'B', 'C'])

    expect(await reorderList(db, list.id, owner, [teaC, teaA, teaB])).toEqual({ ok: true })
    expect(await names()).toEqual(['C', 'A', 'B'])
    expect(await reorderList(db, list.id, owner, [teaC, teaA])).toEqual({ ok: false, reason: 'mismatch' })
    expect(await reorderList(db, list.id, owner, [teaC, teaA, teaA])).toEqual({ ok: false, reason: 'mismatch' })

    expect(await removeTeaFromList(db, list.id, owner, teaA)).toBe(true)
    await addTeaToList(db, list.id, owner, teaA)
    expect(await names()).toEqual(['C', 'B', 'A'])
  })

  it('caps teas per list, even under concurrent adds', async () => {
    const list = await make()
    const ids: number[] = []
    for (let i = 0; i < MAX_TEAS_PER_LIST + 3; i++) {
      ids.push((await seedTestTea(db, { name: `T${i}` })).id)
    }
    await db
      .insert(schema.listItems)
      .values(ids.slice(0, MAX_TEAS_PER_LIST - 1).map((teaId, i) => ({ listId: list.id, teaId, position: i + 1 })))
    const results = await Promise.all(ids.slice(MAX_TEAS_PER_LIST - 1).map((id) => addTeaToList(db, list.id, owner, id)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.reason === 'list_full')).toHaveLength(3)
  })

  it('public view hides private, hidden and banned-author lists; owner sees all', async () => {
    const pub = await make('Public', true)
    const priv = await make('Private', false)
    await addTeaToList(db, pub.id, owner, teaA)

    expect((await getListWithTeas(db, pub.id))?.teas).toHaveLength(1)
    expect((await getListWithTeas(db, pub.id, other))?.isOwner).toBe(false)
    expect(await getListWithTeas(db, priv.id)).toBeNull()
    expect(await getListWithTeas(db, priv.id, other)).toBeNull()
    expect((await getListWithTeas(db, priv.id, owner))?.isOwner).toBe(true)
    expect(await getListWithTeas(db, 99_999, owner)).toBeNull()

    expect((await listPublicLists(db)).map((r) => r.list.id)).toEqual([pub.id])

    await db.update(schema.lists).set({ hidden: true }).where(eq(schema.lists.id, pub.id))
    expect(await getListWithTeas(db, pub.id)).toBeNull()
    expect(await listPublicLists(db)).toEqual([])
    expect((await getListWithTeas(db, pub.id, owner))?.list.hidden).toBe(true)

    await db.update(schema.lists).set({ hidden: false }).where(eq(schema.lists.id, pub.id))
    await banUser(db, owner)
    expect(await getListWithTeas(db, pub.id)).toBeNull()
    expect(await listPublicLists(db)).toEqual([])
  })

  it('pages public lists stably and can skip empty lists', async () => {
    const created = []
    for (let i = 0; i < 3; i++) created.push(await make(`P${i}`))
    await addTeaToList(db, created[0].id, owner, teaA)
    const all = await listPublicLists(db, { limit: 2, offset: 0 })
    const rest = await listPublicLists(db, { limit: 2, offset: 2 })
    expect([...all, ...rest].map((r) => r.list.id).sort()).toEqual(created.map((l) => l.id).sort())
    expect((await listPublicLists(db, { minTeas: 1 })).map((r) => r.list.id)).toEqual([created[0].id])
    expect(all[0].teaCount).toBeTypeOf('number')
  })

  it('listsContainingTea flags the lists that hold the tea', async () => {
    const one = await make('One', false)
    const two = await make('Two', false)
    await addTeaToList(db, one.id, owner, teaA)
    const rows = await listsContainingTea(db, owner, teaA)
    expect(rows.find((r) => r.id === one.id)?.contains).toBe(true)
    expect(rows.find((r) => r.id === two.id)?.contains).toBe(false)
    expect(await listsContainingTea(db, other, teaA)).toEqual([])
  })

  it('deleting a list or a tea removes items; deleting a user removes lists', async () => {
    const list = await make()
    await addTeaToList(db, list.id, owner, teaA)
    await db.delete(schema.teas).where(eq(schema.teas.id, teaA))
    expect(await db.$count(schema.listItems)).toBe(0)
    await addTeaToList(db, list.id, owner, teaB)
    await deleteList(db, list.id, owner)
    expect(await db.$count(schema.listItems)).toBe(0)
  })

  describe('moderation', () => {
    it('reports a public list once per reporter, never your own, never hidden or private', async () => {
      const list = await make('Spammy', true)
      const priv = await make('Secret', false)
      expect(await createReport(db, { listId: list.id, reporterUserId: owner, reason: 'spam' })).toEqual({
        ok: false,
        reason: 'own_list',
      })
      expect(await createReport(db, { listId: priv.id, reporterUserId: other, reason: 'spam' })).toEqual({
        ok: false,
        reason: 'list_not_found',
      })
      expect(await createReport(db, { listId: 99_999, reporterUserId: other, reason: 'spam' })).toMatchObject({
        reason: 'list_not_found',
      })
      expect((await createReport(db, { listId: list.id, reporterUserId: other, reason: 'spam' })).ok).toBe(true)
      expect(await createReport(db, { listId: list.id, reporterUserId: other, reason: 'fake' })).toEqual({
        ok: false,
        reason: 'already_reported',
      })
      expect(await createReport(db, { listId: list.id, reporterUserId: other, reason: 'nope' })).toMatchObject({
        reason: 'invalid_reason',
      })
      const pending = await listPendingListReports(db)
      expect(pending).toHaveLength(1)
      expect(pending[0]).toMatchObject({ list: { id: list.id }, reportCount: 1, owner: { id: owner } })
    })

    it('dismiss keeps the list; hide_list hides it and closes all pending reports', async () => {
      const list = await make('Spammy', true)
      const third = (await seedTestUser(db, 'third@example.com')).id
      const r1 = await createReport(db, { listId: list.id, reporterUserId: other, reason: 'spam' })
      const r2 = await createReport(db, { listId: list.id, reporterUserId: third, reason: 'spam' })
      if (!r1.ok || !r2.ok) throw new Error('report failed')
      const admin = (await seedTestUser(db, 'admin@example.com')).id

      expect(await resolveReport(db, r1.report.id, 'hide', admin)).toBeNull() // wrong resolution for a list
      expect(await resolveReport(db, r1.report.id, 'dismiss', admin)).toMatchObject({ listId: list.id, hidden: false })
      expect((await getListWithTeas(db, list.id))?.list.id).toBe(list.id)
      expect(await resolveReport(db, r1.report.id, 'dismiss', admin)).toBeNull()

      expect(await resolveReport(db, r2.report.id, 'hide_list', admin)).toMatchObject({
        listId: list.id,
        reviewId: null,
        hidden: true,
        banned: false,
        authorId: owner,
      })
      expect(await getListWithTeas(db, list.id)).toBeNull()
      const rows = await db.select().from(schema.reports)
      expect(rows.map((r) => r.status).sort()).toEqual(['actioned', 'dismissed'])
    })

    it('hide_list_and_ban bans the author but refuses to ban an admin', async () => {
      const list = await make('Bad', true)
      const r = await createReport(db, { listId: list.id, reporterUserId: other, reason: 'offensive' })
      if (!r.ok) throw new Error('report failed')
      const admin = (await seedTestUser(db, 'admin@example.com')).id

      await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, owner))
      expect(await resolveReport(db, r.report.id, 'hide_list_and_ban', admin)).toEqual({ blocked: 'author_is_admin' })
      expect((await getListWithTeas(db, list.id))?.list.hidden).toBe(false)
      expect((await db.select().from(schema.reports))[0].status).toBe('pending')

      await db.update(schema.users).set({ isAdmin: false }).where(eq(schema.users.id, owner))
      expect(await resolveReport(db, r.report.id, 'hide_list_and_ban', admin)).toMatchObject({ hidden: true, banned: true })
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, owner))
      expect(u.bannedAt).not.toBeNull()
    })

    it('deleting a reported list deletes its reports', async () => {
      const list = await make('Gone', true)
      await createReport(db, { listId: list.id, reporterUserId: other, reason: 'spam' })
      await deleteList(db, list.id, owner)
      expect(await db.$count(schema.reports)).toBe(0)
    })
  })
})
