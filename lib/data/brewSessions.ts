import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { canSaveSession, FREE_SESSION_LIMIT } from '@/lib/premium'
import { parseSessionInput } from '@/lib/validation/brewSession'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// First key of the two-int advisory lock; the second is the user id.
const SESSION_CREATE_LOCK_KEY = 7_301_047

export type CreateSessionResult =
  | { ok: true; session: schema.BrewSession; infusions: schema.BrewInfusion[] }
  | { ok: false; reason: 'invalid'; error: string }
  | { ok: false; reason: 'limit_reached'; limit: number }
  | { ok: false; reason: 'tea_not_found' }

// Session and infusions are written in one transaction. Free accounts keep
// FREE_SESSION_LIMIT saved sessions (Premium is unlimited); the count and the
// insert sit behind a per-user advisory lock so concurrent saves cannot exceed it.
// Saving a session never touches the LeafScore.
export async function createSession(
  db: Db,
  userId: number,
  input: {
    teaId: number
    method?: string | null
    tempC?: number | null
    gramsUsed?: number | null
    notes?: string | null
    infusions: { seconds: number; rating?: number | null; note?: string | null }[]
  },
  isPremium: boolean,
): Promise<CreateSessionResult> {
  const parsed = parseSessionInput(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', error: parsed.error }
  const { infusions, ...sessionData } = parsed.data

  return db.transaction(async (tx): Promise<CreateSessionResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SESSION_CREATE_LOCK_KEY}, ${userId})`)

    if (!isPremium) {
      const count = await tx.$count(schema.brewSessions, eq(schema.brewSessions.userId, userId))
      if (!canSaveSession(false, count)) return { ok: false, reason: 'limit_reached', limit: FREE_SESSION_LIMIT }
    }

    const [tea] = await tx.select({ id: schema.teas.id }).from(schema.teas).where(eq(schema.teas.id, sessionData.teaId))
    if (!tea) return { ok: false, reason: 'tea_not_found' }

    const [session] = await tx
      .insert(schema.brewSessions)
      .values({ userId, ...sessionData })
      .returning()
    const rows = await tx
      .insert(schema.brewInfusions)
      .values(infusions.map((inf, index) => ({ sessionId: session.id, step: index + 1, ...inf })))
      .returning()
    return { ok: true, session, infusions: rows.sort((a, b) => a.step - b.step) }
  })
}

// Owner only: returns null for someone else's session.
export async function getSession(db: Db, sessionId: number, userId: number) {
  const [row] = await db
    .select({
      session: schema.brewSessions,
      tea: { id: schema.teas.id, name: schema.teas.name, type: schema.teas.type },
    })
    .from(schema.brewSessions)
    .innerJoin(schema.teas, eq(schema.brewSessions.teaId, schema.teas.id))
    .where(and(eq(schema.brewSessions.id, sessionId), eq(schema.brewSessions.userId, userId)))
  if (!row) return null

  const infusions = await db
    .select()
    .from(schema.brewInfusions)
    .where(eq(schema.brewInfusions.sessionId, sessionId))
    .orderBy(asc(schema.brewInfusions.step))
  return { ...row, infusions }
}

// Newest first with the infusion count, for the history list.
export async function listSessionsForUser(
  db: Db,
  userId: number,
  opts: { limit?: number; offset?: number } = {},
) {
  const { limit = 20, offset = 0 } = opts
  return db
    .select({
      session: schema.brewSessions,
      tea: { id: schema.teas.id, name: schema.teas.name, type: schema.teas.type },
      infusionCount: sql<number>`(select count(*)::int from ${schema.brewInfusions} bi where bi.session_id = ${schema.brewSessions.id})`,
    })
    .from(schema.brewSessions)
    .innerJoin(schema.teas, eq(schema.brewSessions.teaId, schema.teas.id))
    .where(eq(schema.brewSessions.userId, userId))
    .orderBy(desc(schema.brewSessions.createdAt), desc(schema.brewSessions.id))
    .limit(limit)
    .offset(offset)
}

export async function countSessionsForUser(db: Db, userId: number) {
  return db.$count(schema.brewSessions, eq(schema.brewSessions.userId, userId))
}

// Returns false when the session is not the user's. Infusions cascade.
export async function deleteSession(db: Db, sessionId: number, userId: number): Promise<boolean> {
  const deleted = await db
    .delete(schema.brewSessions)
    .where(and(eq(schema.brewSessions.id, sessionId), eq(schema.brewSessions.userId, userId)))
    .returning({ id: schema.brewSessions.id })
  return deleted.length > 0
}

export type LinkSessionResult =
  | { ok: true }
  | { ok: false; reason: 'session_not_found' | 'review_not_found' | 'tea_mismatch' }

// Links a session to the user's own review of the same tea (reviewId null
// unlinks). Someone else's review, or a review of another tea, is refused.
export async function linkSessionToReview(
  db: Db,
  sessionId: number,
  userId: number,
  reviewId: number | null,
): Promise<LinkSessionResult> {
  return db.transaction(async (tx): Promise<LinkSessionResult> => {
    const [session] = await tx
      .select({ teaId: schema.brewSessions.teaId })
      .from(schema.brewSessions)
      .where(and(eq(schema.brewSessions.id, sessionId), eq(schema.brewSessions.userId, userId)))
    if (!session) return { ok: false, reason: 'session_not_found' }

    if (reviewId !== null) {
      const [review] = await tx
        .select({ teaId: schema.reviews.teaId })
        .from(schema.reviews)
        .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.userId, userId)))
      if (!review) return { ok: false, reason: 'review_not_found' }
      if (review.teaId !== session.teaId) return { ok: false, reason: 'tea_mismatch' }
    }

    await tx.update(schema.brewSessions).set({ reviewId }).where(eq(schema.brewSessions.id, sessionId))
    return { ok: true }
  })
}
