import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const avgScore = sql<string | null>`avg(${schema.reviews.score})`
const reviewCount = sql<string>`count(*)`

// Moderator-hidden reviews don't count toward a user's stats.
const visible = (userId: number) =>
  and(eq(schema.reviews.userId, userId), eq(schema.reviews.hidden, false))

const round = (value: string | null) => (value === null ? null : Math.round(Number(value)))

export async function getReviewStats(db: Db, userId: number) {
  const [totals] = await db
    .select({
      count: reviewCount,
      avgScore,
      drinkAgain: sql<string>`count(*) filter (where ${schema.reviews.wouldDrinkAgain})`,
      answeredAgain: sql<string>`count(${schema.reviews.wouldDrinkAgain})`,
    })
    .from(schema.reviews)
    .where(visible(userId))

  const byType = await db
    .select({ type: schema.teas.type, count: reviewCount, avgScore })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .where(visible(userId))
    .groupBy(schema.teas.type)
    .orderBy(desc(reviewCount), asc(schema.teas.type))

  const byMethod = await db
    .select({ method: schema.reviews.brewMethod, count: reviewCount, avgScore })
    .from(schema.reviews)
    .where(and(visible(userId), isNotNull(schema.reviews.brewMethod)))
    .groupBy(schema.reviews.brewMethod)
    .orderBy(desc(reviewCount), asc(schema.reviews.brewMethod))

  const topFlavors = await db
    .select({ name: schema.flavorTags.name, count: reviewCount })
    .from(schema.reviewTags)
    .innerJoin(schema.reviews, eq(schema.reviewTags.reviewId, schema.reviews.id))
    .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
    .where(visible(userId))
    .groupBy(schema.flavorTags.name)
    .orderBy(desc(reviewCount), asc(schema.flavorTags.name))
    .limit(5)

  const answered = Number(totals.answeredAgain)

  return {
    count: Number(totals.count),
    avgScore: round(totals.avgScore),
    drinkAgainPercent: answered > 0 ? Math.round((Number(totals.drinkAgain) / answered) * 100) : null,
    byType: byType.map((row) => ({ type: row.type, count: Number(row.count), avgScore: round(row.avgScore) })),
    byMethod: byMethod.map((row) => ({ method: row.method as string, count: Number(row.count), avgScore: round(row.avgScore) })),
    topFlavors: topFlavors.map((row) => ({ name: row.name, count: Number(row.count) })),
  }
}

export async function listReviewsForExport(db: Db, userId: number) {
  return db
    .select({
      createdAt: schema.reviews.createdAt,
      tea: schema.teas.name,
      type: schema.teas.type,
      brand: schema.brands.name,
      score: schema.reviews.score,
      brewMethod: schema.reviews.brewMethod,
      brewTemp: schema.reviews.brewTemp,
      steepTime: schema.reviews.steepTime,
      wouldDrinkAgain: schema.reviews.wouldDrinkAgain,
      flavors: sql<string | null>`string_agg(${schema.flavorTags.name}, '; ' order by ${schema.flavorTags.name})`,
      notes: schema.reviews.notes,
      hidden: schema.reviews.hidden,
    })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .leftJoin(schema.reviewTags, eq(schema.reviewTags.reviewId, schema.reviews.id))
    .leftJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
    .where(eq(schema.reviews.userId, userId))
    .groupBy(schema.reviews.id, schema.teas.id, schema.brands.id)
    .orderBy(desc(schema.reviews.createdAt))
}
