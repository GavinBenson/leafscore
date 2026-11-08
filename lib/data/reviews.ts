import { eq, and, asc, desc, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { NewReview } from '@/db/schema'
import { recalcLeafScore } from './teas'
import { helpfulCountSql, reviewOrderBy, type ReviewSort } from './helpful'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// One review per user per tea (unique index reviews_user_id_tea_id_idx). The action
// layer should catch this and send the user to edit their existing review.
export class DuplicateReviewError extends Error {
  constructor() {
    super('You have already reviewed this tea.')
    this.name = 'DuplicateReviewError'
  }
}

export function isDuplicateReviewError(error: unknown): error is DuplicateReviewError {
  return error instanceof DuplicateReviewError
}

// Drizzle wraps driver errors, so look through `cause` for the Postgres code.
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    const err = e as { code?: string; constraint?: string; message?: string; cause?: unknown }
    if (err.code === '23505' && ((err.constraint ?? '').includes(constraint) || err.message?.includes(constraint))) {
      return true
    }
    e = err.cause
  }
  return false
}

// Serialises writers per tea. The recompute is a single UPDATE, but under READ
// COMMITTED a writer that waited on the tea row would still compute from its
// older snapshot; taking the lock first (a separate statement) means the
// recompute sees every committed review.
export async function lockTea(tx: Db, teaId: number) {
  await tx.execute(sql`select id from ${schema.teas} where id = ${teaId} for update`)
}

export async function findReviewByUserAndTea(db: Db, userId: number, teaId: number) {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.userId, userId), eq(schema.reviews.teaId, teaId)))
    .limit(1)

  return rows[0] ?? null
}

// Without opts every review comes back (limit/offset are opt-in).
export async function listReviewsForTea(
  db: Db,
  teaId: number,
  opts: { limit?: number; offset?: number; sort?: ReviewSort } = {},
) {
  const query = db
    .select({
      review: schema.reviews,
      helpfulCount: helpfulCountSql,
      user: {
        id: schema.users.id,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
      },
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
    .where(and(eq(schema.reviews.teaId, teaId), eq(schema.reviews.hidden, false)))
    .orderBy(...reviewOrderBy(opts.sort))
    .$dynamic()

  return opts.limit === undefined ? query : query.limit(opts.limit).offset(opts.offset ?? 0)
}

// Flavor tag names for a page of reviews, keyed by review id.
export async function listTagNamesForReviews(db: Db, reviewIds: number[]) {
  const byReview: Record<number, string[]> = {}
  if (reviewIds.length === 0) return byReview
  const rows = await db
    .select({ reviewId: schema.reviewTags.reviewId, name: schema.flavorTags.name })
    .from(schema.reviewTags)
    .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
    .where(inArray(schema.reviewTags.reviewId, reviewIds))
    .orderBy(asc(schema.flavorTags.name))
  for (const row of rows) (byReview[row.reviewId] ??= []).push(row.name)
  return byReview
}

export async function listReviewsForUser(
  db: Db,
  userId: number,
  opts: { limit?: number; offset?: number; includeHidden?: boolean } = {},
) {
  const { limit = 20, offset = 0, includeHidden = false } = opts

  return db
    .select({
      review: schema.reviews,
      tea: schema.teas,
    })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .where(
      includeHidden
        ? eq(schema.reviews.userId, userId)
        : and(eq(schema.reviews.userId, userId), eq(schema.reviews.hidden, false)),
    )
    .orderBy(desc(schema.reviews.createdAt), desc(schema.reviews.id))
    .limit(limit)
    .offset(offset)
}

export async function getReview(db: Db, reviewId: number) {
  const reviewRows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.id, reviewId))

  if (reviewRows.length === 0) return null

  const review = reviewRows[0]

  const tags = await db
    .select({ tag: schema.flavorTags })
    .from(schema.reviewTags)
    .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
    .where(eq(schema.reviewTags.reviewId, reviewId))

  return {
    ...review,
    tags: tags.map((t) => t.tag),
  }
}

// A double-submit that slips past the disabled button: same user, tea, score
// and notes within a few seconds. Repeat tastings later on are legitimate.
export async function findRecentDuplicateReview(
  db: Db,
  data: { userId: number; teaId: number; score: number; notes: string | null },
  windowSeconds = 30,
) {
  const rows = await db
    .select({ id: schema.reviews.id })
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.userId, data.userId),
        eq(schema.reviews.teaId, data.teaId),
        eq(schema.reviews.score, data.score),
        data.notes === null ? isNull(schema.reviews.notes) : eq(schema.reviews.notes, data.notes),
        gt(schema.reviews.createdAt, sql`now() - make_interval(secs => ${windowSeconds})`),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

// Atomic: review, tags and the tea's score commit together or not at all.
// Throws DuplicateReviewError if this user already reviewed the tea.
export async function createReview(
  db: Db,
  data: NewReview,
  tagIds?: number[],
) {
  try {
    return await db.transaction(async (tx) => {
      await lockTea(tx, data.teaId)
      if (await findReviewByUserAndTea(tx, data.userId, data.teaId)) {
        throw new DuplicateReviewError()
      }

      const [review] = await tx.insert(schema.reviews).values(data).returning()

      if (tagIds && tagIds.length > 0) {
        await tx.insert(schema.reviewTags).values(
          tagIds.map((flavorTagId) => ({ reviewId: review.id, flavorTagId })),
        )
      }

      await recalcLeafScore(tx, data.teaId)
      return review
    })
  } catch (error) {
    if (isUniqueViolation(error, 'reviews_user_id_tea_id_idx')) throw new DuplicateReviewError()
    throw error
  }
}

// Only the review's author can change it, and it stays on the same tea.
export async function updateReview(
  db: Db,
  reviewId: number,
  userId: number,
  data: Pick<NewReview, 'score' | 'brewMethod' | 'brewTemp' | 'steepTime' | 'notes' | 'wouldDrinkAgain' | 'photoUrl'> &
    Partial<Pick<NewReview, 'aromaScore' | 'flavorScore' | 'bodyScore' | 'aftertasteScore' | 'valueScore'>>,
  tagIds: number[],
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ teaId: schema.reviews.teaId })
      .from(schema.reviews)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.userId, userId)))
    if (!existing) return null

    await lockTea(tx, existing.teaId)

    const [review] = await tx
      .update(schema.reviews)
      .set(data)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.userId, userId)))
      .returning()
    if (!review) return null

    await tx.delete(schema.reviewTags).where(eq(schema.reviewTags.reviewId, reviewId))
    if (tagIds.length > 0) {
      await tx.insert(schema.reviewTags).values(
        tagIds.map((flavorTagId) => ({ reviewId, flavorTagId })),
      )
    }

    await recalcLeafScore(tx, review.teaId)
    return review
  })
}

export async function deleteReview(db: Db, reviewId: number, userId: number) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.reviews)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.userId, userId)))
    if (!existing) return null

    await lockTea(tx, existing.teaId)
    await tx.delete(schema.reviews).where(eq(schema.reviews.id, reviewId))
    await recalcLeafScore(tx, existing.teaId)
    return existing
  })
}
