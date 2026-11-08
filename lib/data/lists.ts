import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { listLimitFor, MAX_TEAS_PER_LIST } from '@/lib/premium'
import { parseListInput } from '@/lib/validation/list'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// First key of the two-int advisory lock; the second is the user id.
const LIST_CREATE_LOCK_KEY = 7_301_044

export type ListInputFailure = { ok: false; reason: 'invalid'; field: 'title' | 'description'; error: string }

export type CreateListResult =
  | { ok: true; list: schema.List }
  | ListInputFailure
  | { ok: false; reason: 'limit_reached'; limit: number }

// Capped per user (FREE_LIST_LIMIT / PREMIUM_LIST_LIMIT by isPremium). The count
// and the insert run in one transaction behind a per-user advisory lock so
// concurrent creates cannot both pass the cap.
export async function createList(
  db: Db,
  data: { userId: number; title: string; description?: string | null; isPublic?: boolean },
  isPremium: boolean,
): Promise<CreateListResult> {
  const parsed = parseListInput(data)
  if (!parsed.ok) return { ok: false, reason: 'invalid', field: parsed.field, error: parsed.error }
  const limit = listLimitFor(isPremium)

  return db.transaction(async (tx): Promise<CreateListResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LIST_CREATE_LOCK_KEY}, ${data.userId})`)
    const count = await tx.$count(schema.lists, eq(schema.lists.userId, data.userId))
    if (count >= limit) return { ok: false, reason: 'limit_reached', limit }

    const [list] = await tx
      .insert(schema.lists)
      .values({
        userId: data.userId,
        title: parsed.title,
        description: parsed.description,
        isPublic: data.isPublic ?? false,
      })
      .returning()
    return { ok: true, list }
  })
}

export type UpdateListResult =
  | { ok: true; list: schema.List }
  | ListInputFailure
  | { ok: false; reason: 'not_found' }

// Only the owner can change a list (not_found otherwise, so ids don't leak).
export async function updateList(
  db: Db,
  listId: number,
  userId: number,
  data: { title: string; description?: string | null; isPublic?: boolean },
): Promise<UpdateListResult> {
  const parsed = parseListInput(data)
  if (!parsed.ok) return { ok: false, reason: 'invalid', field: parsed.field, error: parsed.error }

  const [list] = await db
    .update(schema.lists)
    .set({
      title: parsed.title,
      description: parsed.description,
      ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)))
    .returning()
  return list ? { ok: true, list } : { ok: false, reason: 'not_found' }
}

// Returns false when the list does not exist or is not the user's.
export async function deleteList(db: Db, listId: number, userId: number): Promise<boolean> {
  const deleted = await db
    .delete(schema.lists)
    .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)))
    .returning({ id: schema.lists.id })
  return deleted.length > 0
}

export type AddTeaToListResult =
  | { ok: true; alreadyInList: boolean }
  | { ok: false; reason: 'not_found' | 'tea_not_found' | 'list_full' }

// Idempotent: adding a tea that is already there succeeds with alreadyInList.
// The list row is locked so concurrent adds cannot pass MAX_TEAS_PER_LIST together
// or pick the same position.
export async function addTeaToList(
  db: Db,
  listId: number,
  userId: number,
  teaId: number,
): Promise<AddTeaToListResult> {
  return db.transaction(async (tx): Promise<AddTeaToListResult> => {
    const owned = await tx
      .select({ id: schema.lists.id })
      .from(schema.lists)
      .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)))
      .for('update')
    if (owned.length === 0) return { ok: false, reason: 'not_found' }

    const [tea] = await tx.select({ id: schema.teas.id }).from(schema.teas).where(eq(schema.teas.id, teaId))
    if (!tea) return { ok: false, reason: 'tea_not_found' }

    const [existing] = await tx
      .select({ teaId: schema.listItems.teaId })
      .from(schema.listItems)
      .where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.teaId, teaId)))
    if (existing) return { ok: true, alreadyInList: true }

    const [stats] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        maxPosition: sql<number>`coalesce(max(${schema.listItems.position}), 0)::int`,
      })
      .from(schema.listItems)
      .where(eq(schema.listItems.listId, listId))
    if (stats.count >= MAX_TEAS_PER_LIST) return { ok: false, reason: 'list_full' }

    await tx.insert(schema.listItems).values({ listId, teaId, position: stats.maxPosition + 1 })
    await tx.update(schema.lists).set({ updatedAt: new Date() }).where(eq(schema.lists.id, listId))
    return { ok: true, alreadyInList: false }
  })
}

// Returns false when the list is not the user's. Removing an absent tea is a no-op.
export async function removeTeaFromList(
  db: Db,
  listId: number,
  userId: number,
  teaId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select({ id: schema.lists.id })
      .from(schema.lists)
      .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)))
    if (!list) return false
    await tx
      .delete(schema.listItems)
      .where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.teaId, teaId)))
    await tx.update(schema.lists).set({ updatedAt: new Date() }).where(eq(schema.lists.id, listId))
    return true
  })
}

export type ReorderListResult = { ok: true } | { ok: false; reason: 'not_found' | 'mismatch' }

// teaIds must be exactly the tea ids currently in the list, in the new order.
export async function reorderList(
  db: Db,
  listId: number,
  userId: number,
  teaIds: number[],
): Promise<ReorderListResult> {
  return db.transaction(async (tx): Promise<ReorderListResult> => {
    const owned = await tx
      .select({ id: schema.lists.id })
      .from(schema.lists)
      .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)))
      .for('update')
    if (owned.length === 0) return { ok: false, reason: 'not_found' }

    const current = await tx
      .select({ teaId: schema.listItems.teaId })
      .from(schema.listItems)
      .where(eq(schema.listItems.listId, listId))
    const wanted = new Set(teaIds)
    if (
      wanted.size !== teaIds.length ||
      current.length !== teaIds.length ||
      current.some((c) => !wanted.has(c.teaId))
    ) {
      return { ok: false, reason: 'mismatch' }
    }

    for (const [index, teaId] of teaIds.entries()) {
      await tx
        .update(schema.listItems)
        .set({ position: index + 1 })
        .where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.teaId, teaId)))
    }
    await tx.update(schema.lists).set({ updatedAt: new Date() }).where(eq(schema.lists.id, listId))
    return { ok: true }
  })
}

export type ListTea = {
  tea: schema.Tea
  brand: schema.Brand | null
  position: number
  addedAt: Date
}

// Public view (no viewerId, or someone else): the list must be public, not
// hidden by a moderator, and its author not banned. The owner sees their own
// list whatever its state. Returns null when the viewer may not see it.
export async function getListWithTeas(db: Db, listId: number, viewerId?: number) {
  const [row] = await db
    .select({
      list: schema.lists,
      owner: {
        id: schema.users.id,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
        bannedAt: schema.users.bannedAt,
      },
    })
    .from(schema.lists)
    .innerJoin(schema.users, eq(schema.lists.userId, schema.users.id))
    .where(eq(schema.lists.id, listId))
  if (!row) return null

  const isOwner = viewerId !== undefined && viewerId === row.list.userId
  if (!isOwner && (!row.list.isPublic || row.list.hidden || row.owner.bannedAt !== null)) return null

  const teaRows = await db
    .select({
      tea: schema.teas,
      brand: schema.brands,
      position: schema.listItems.position,
      addedAt: schema.listItems.addedAt,
    })
    .from(schema.listItems)
    .innerJoin(schema.teas, eq(schema.listItems.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.listItems.listId, listId))
    .orderBy(asc(schema.listItems.position), asc(schema.listItems.teaId))

  const teas: ListTea[] = teaRows
  return {
    list: row.list,
    owner: { id: row.owner.id, name: row.owner.name, avatarUrl: row.owner.avatarUrl },
    isOwner,
    teas,
  }
}

const itemCount = sql<number>`(select count(*)::int from ${schema.listItems} li where li.list_id = ${schema.lists.id})`

// Every list the user owns (including private and hidden), newest first.
export async function listListsForUser(db: Db, userId: number) {
  return db
    .select({ list: schema.lists, teaCount: itemCount })
    .from(schema.lists)
    .where(eq(schema.lists.userId, userId))
    .orderBy(desc(schema.lists.updatedAt), desc(schema.lists.id))
}

// Public lists for the index page and the sitemap: public, not hidden, author
// not banned. Newest first; the id tiebreak keeps offset paging stable.
// minTeas lets the sitemap skip empty lists.
export async function listPublicLists(
  db: Db,
  opts: { limit?: number; offset?: number; minTeas?: number } = {},
) {
  const { limit = 20, offset = 0, minTeas = 0 } = opts
  return db
    .select({
      list: schema.lists,
      owner: { id: schema.users.id, name: schema.users.name },
      teaCount: itemCount,
    })
    .from(schema.lists)
    .innerJoin(schema.users, eq(schema.lists.userId, schema.users.id))
    .where(
      and(
        eq(schema.lists.isPublic, true),
        eq(schema.lists.hidden, false),
        isNull(schema.users.bannedAt),
        minTeas > 0 ? sql`${itemCount} >= ${minTeas}` : undefined,
      ),
    )
    .orderBy(desc(schema.lists.createdAt), desc(schema.lists.id))
    .limit(limit)
    .offset(offset)
}

// For the save-to-list control: all of the user's lists, each flagged with
// whether it already contains the tea.
export async function listsContainingTea(db: Db, userId: number, teaId: number) {
  return db
    .select({
      id: schema.lists.id,
      title: schema.lists.title,
      isPublic: schema.lists.isPublic,
      hidden: schema.lists.hidden,
      teaCount: itemCount,
      contains: sql<boolean>`exists (
        select 1 from ${schema.listItems} li
        where li.list_id = ${schema.lists.id} and li.tea_id = ${teaId}
      )`,
    })
    .from(schema.lists)
    .where(eq(schema.lists.userId, userId))
    .orderBy(desc(schema.lists.updatedAt), desc(schema.lists.id))
}
