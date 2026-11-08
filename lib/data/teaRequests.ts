import { and, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const MAX_PENDING_REQUESTS_PER_USER = 5
const CREATE_LOCK_KEY = 7_301_001

export type CreateTeaRequestResult =
  | { ok: true; request: schema.TeaRequest }
  | { ok: false; reason: 'too_many_pending' | 'duplicate' }

// Capped per user, and the same name+brand (case-insensitive) can't be pending twice.
// The duplicate check covers every user's pending requests, since a second ask
// for the same tea adds nothing for the admin.
export async function createTeaRequest(
  db: Db,
  data: { userId: number; name: string; brand?: string; type?: string },
): Promise<CreateTeaRequestResult> {
  // Check and insert run in one transaction behind an advisory lock, so
  // concurrent submits can't both pass the cap or the duplicate check. One lock
  // for all creates (not per user) because the duplicate check spans users;
  // creates are rate limited, so contention is negligible.
  return db.transaction(async (tx): Promise<CreateTeaRequestResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CREATE_LOCK_KEY})`)

    const pendingForUser = await tx.$count(
      schema.teaRequests,
      and(eq(schema.teaRequests.userId, data.userId), eq(schema.teaRequests.status, 'pending')),
    )
    if (pendingForUser >= MAX_PENDING_REQUESTS_PER_USER) {
      return { ok: false, reason: 'too_many_pending' }
    }

    const duplicates = await tx.$count(
      schema.teaRequests,
      and(
        eq(schema.teaRequests.status, 'pending'),
        sql`lower(${schema.teaRequests.name}) = lower(${data.name})`,
        sql`lower(coalesce(${schema.teaRequests.brand}, '')) = lower(${data.brand ?? ''})`,
      ),
    )
    if (duplicates > 0) return { ok: false, reason: 'duplicate' }

    const [request] = await tx.insert(schema.teaRequests).values(data).returning()
    return { ok: true, request }
  })
}

export async function listRequestsForUser(db: Db, userId: number) {
  return db
    .select()
    .from(schema.teaRequests)
    .where(eq(schema.teaRequests.userId, userId))
    .orderBy(desc(schema.teaRequests.createdAt), desc(schema.teaRequests.id))
}

// Admin queue with the requester's name in the same query (no per-row lookup).
export async function listPendingRequestsWithUser(db: Db) {
  return db
    .select({
      request: schema.teaRequests,
      user: { id: schema.users.id, name: schema.users.name },
    })
    .from(schema.teaRequests)
    .innerJoin(schema.users, eq(schema.teaRequests.userId, schema.users.id))
    .where(eq(schema.teaRequests.status, 'pending'))
    .orderBy(desc(schema.teaRequests.createdAt), desc(schema.teaRequests.id))
}

export async function listPendingRequests(db: Db) {
  return db
    .select()
    .from(schema.teaRequests)
    .where(eq(schema.teaRequests.status, 'pending'))
    .orderBy(desc(schema.teaRequests.createdAt))
}

export async function updateRequestStatus(
  db: Db,
  requestId: number,
  status: 'pending' | 'approved' | 'rejected',
) {
  const [request] = await db
    .update(schema.teaRequests)
    .set({ status, resolvedAt: status === 'pending' ? null : new Date() })
    .where(eq(schema.teaRequests.id, requestId))
    .returning()

  return request ?? null
}

// Returns null when the request is no longer pending (someone else resolved it).
export async function markRequestApproved(db: Db, requestId: number, teaId: number) {
  const [request] = await db
    .update(schema.teaRequests)
    .set({ status: 'approved', createdTeaId: teaId, resolvedAt: new Date() })
    .where(and(eq(schema.teaRequests.id, requestId), eq(schema.teaRequests.status, 'pending')))
    .returning()

  return request ?? null
}

export async function getTeaRequest(db: Db, requestId: number) {
  const [request] = await db
    .select()
    .from(schema.teaRequests)
    .where(eq(schema.teaRequests.id, requestId))
  return request ?? null
}
