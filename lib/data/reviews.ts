import { eq, and, desc } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { NewReview } from '@/db/schema'
import { recalcLeafScore } from './teas'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listReviewsForTea(db: Db, teaId: number) {
  return db
    .select({
      review: schema.reviews,
      user: {
        id: schema.users.id,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
      },
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
    .where(eq(schema.reviews.teaId, teaId))
    .orderBy(desc(schema.reviews.createdAt))
}

export async function listReviewsForUser(
  db: Db,
  userId: number,
  opts: { limit?: number; offset?: number } = {},
) {
  const { limit = 20, offset = 0 } = opts

  return db
    .select({
      review: schema.reviews,
      tea: schema.teas,
    })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .where(eq(schema.reviews.userId, userId))
    .orderBy(desc(schema.reviews.createdAt))
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

export async function createReview(
  db: Db,
  data: NewReview,
  tagIds?: number[],
) {
  const [review] = await db.insert(schema.reviews).values(data).returning()

  if (tagIds && tagIds.length > 0) {
    await db.insert(schema.reviewTags).values(
      tagIds.map((flavorTagId) => ({
        reviewId: review.id,
        flavorTagId,
      })),
    )
  }

  await recalcLeafScore(db, data.teaId)

  return review
}

export async function deleteReview(db: Db, reviewId: number, userId: number) {
  const reviewRows = await db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.userId, userId)))

  if (reviewRows.length === 0) return false

  const teaId = reviewRows[0].teaId

  await db.delete(schema.reviews).where(eq(schema.reviews.id, reviewId))
  await recalcLeafScore(db, teaId)

  return true
}
