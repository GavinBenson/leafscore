import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type HelpfulFailure = 'review_not_found' | 'own_review' | 'review_hidden'

export type HelpfulResult =
  | { ok: true; helpful: boolean; count: number }
  | { ok: false; reason: HelpfulFailure }

async function checkVotable(db: Db, userId: number, reviewId: number): Promise<HelpfulFailure | null> {
  const [review] = await db
    .select({ userId: schema.reviews.userId, hidden: schema.reviews.hidden })
    .from(schema.reviews)
    .where(eq(schema.reviews.id, reviewId))
  if (!review) return 'review_not_found'
  if (review.hidden) return 'review_hidden'
  if (review.userId === userId) return 'own_review'
  return null
}

async function countFor(db: Db, reviewId: number) {
  return db.$count(schema.reviewHelpfulVotes, eq(schema.reviewHelpfulVotes.reviewId, reviewId))
}

// Idempotent: on=true twice leaves one vote, on=false with no vote is a no-op.
// Refused for a missing or hidden review and for your own review.
export async function setHelpful(
  db: Db,
  userId: number,
  reviewId: number,
  on: boolean,
): Promise<HelpfulResult> {
  const failure = await checkVotable(db, userId, reviewId)
  if (failure) return { ok: false, reason: failure }

  if (on) {
    await db.insert(schema.reviewHelpfulVotes).values({ userId, reviewId }).onConflictDoNothing()
  } else {
    await db
      .delete(schema.reviewHelpfulVotes)
      .where(and(eq(schema.reviewHelpfulVotes.userId, userId), eq(schema.reviewHelpfulVotes.reviewId, reviewId)))
  }
  return { ok: true, helpful: on, count: await countFor(db, reviewId) }
}

// Flips the vote. Atomic: a vote is removed with a delete that reports whether a
// row existed, otherwise inserted, so a double click cannot error.
export async function toggleHelpful(db: Db, userId: number, reviewId: number): Promise<HelpfulResult> {
  const failure = await checkVotable(db, userId, reviewId)
  if (failure) return { ok: false, reason: failure }

  const removed = await db
    .delete(schema.reviewHelpfulVotes)
    .where(and(eq(schema.reviewHelpfulVotes.userId, userId), eq(schema.reviewHelpfulVotes.reviewId, reviewId)))
    .returning({ reviewId: schema.reviewHelpfulVotes.reviewId })
  if (removed.length === 0) {
    await db.insert(schema.reviewHelpfulVotes).values({ userId, reviewId }).onConflictDoNothing()
  }
  return { ok: true, helpful: removed.length === 0, count: await countFor(db, reviewId) }
}

// Vote counts keyed by review id (reviews without votes are 0).
export async function helpfulCountsForReviews(db: Db, reviewIds: number[]): Promise<Record<number, number>> {
  const counts: Record<number, number> = {}
  for (const id of reviewIds) counts[id] = 0
  if (reviewIds.length === 0) return counts
  const rows = await db
    .select({
      reviewId: schema.reviewHelpfulVotes.reviewId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.reviewHelpfulVotes)
    .where(inArray(schema.reviewHelpfulVotes.reviewId, reviewIds))
    .groupBy(schema.reviewHelpfulVotes.reviewId)
  for (const row of rows) counts[row.reviewId] = row.count
  return counts
}

// The ids (from reviewIds) that this user has marked helpful.
export async function viewerVotes(db: Db, userId: number, reviewIds: number[]): Promise<Set<number>> {
  if (reviewIds.length === 0) return new Set()
  const rows = await db
    .select({ reviewId: schema.reviewHelpfulVotes.reviewId })
    .from(schema.reviewHelpfulVotes)
    .where(
      and(eq(schema.reviewHelpfulVotes.userId, userId), inArray(schema.reviewHelpfulVotes.reviewId, reviewIds)),
    )
  return new Set(rows.map((r) => r.reviewId))
}

export type ReviewSort = 'recent' | 'helpful'

// Correlated count for use in a select over schema.reviews.
export const helpfulCountSql = sql<number>`(
  select count(*)::int from ${schema.reviewHelpfulVotes} hv where hv.review_id = ${schema.reviews.id}
)`

// 'recent': newest first. 'helpful': most votes first, then newest, then highest
// id, so ties never reorder between pages.
export function reviewOrderBy(sort: ReviewSort = 'recent') {
  return sort === 'helpful'
    ? [sql`${helpfulCountSql} desc`, desc(schema.reviews.createdAt), desc(schema.reviews.id)]
    : [desc(schema.reviews.createdAt), desc(schema.reviews.id)]
}
