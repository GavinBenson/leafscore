import { eq, ilike, or, desc, asc, sql, and, gte, getTableColumns } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { MIN_REVIEWS_FOR_SCORE } from '@/lib/scoring'
import { helpfulCountSql, reviewOrderBy, type ReviewSort } from './helpful'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

function escapeLike(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export type TeaSort = 'score' | 'newest' | 'name'

export type ListTeasOpts = {
  type?: string
  search?: string
  brandId?: number
  subtype?: string
  origin?: string
  // Only teas with at least this many reviews (the home page uses the score threshold).
  minReviews?: number
  sort?: TeaSort
  limit?: number
  offset?: number
}

export type TeaWithBrand = schema.Tea & { brand: schema.Brand | null }

function teaConditions(opts: ListTeasOpts) {
  const { type, search, brandId, subtype, origin, minReviews } = opts
  const conditions = []
  if (type) conditions.push(eq(schema.teas.type, type))
  if (brandId !== undefined) conditions.push(eq(schema.teas.brandId, brandId))
  if (subtype) conditions.push(eq(schema.teas.subtype, subtype))
  if (origin) conditions.push(eq(schema.teas.origin, origin))
  if (minReviews !== undefined) conditions.push(gte(schema.teas.reviewCount, minReviews))
  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(or(ilike(schema.teas.name, pattern), ilike(schema.brands.name, pattern)))
  }
  return conditions.length > 0 ? and(...conditions) : undefined
}

// Scored teas first (enough reviews and a score), best first; everything else
// follows by review count. Ties end on id so offset paging never repeats a row.
const hasScore = sql`(${schema.teas.reviewCount} >= ${MIN_REVIEWS_FOR_SCORE} and ${schema.teas.leafScore} is not null)`
const scoreOrder = [
  desc(hasScore),
  sql`case when ${hasScore} then ${schema.teas.leafScore} end desc nulls last`,
  sql`${schema.teas.reviewCount} desc nulls last`,
  desc(schema.teas.id),
]

export async function listTeas(db: Db, opts: ListTeasOpts = {}): Promise<TeaWithBrand[]> {
  const { sort = 'score', limit = 20, offset = 0 } = opts

  const orderBy =
    sort === 'score'
      ? scoreOrder
      : sort === 'newest'
        ? [desc(schema.teas.createdAt), desc(schema.teas.id)]
        : [asc(schema.teas.name), asc(schema.teas.id)]

  const rows = await db
    .select({ tea: schema.teas, brand: schema.brands })
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(teaConditions(opts))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)

  return rows.map((r) => ({ ...r.tea, brand: r.brand }))
}

export async function countTeas(db: Db, opts: ListTeasOpts = {}): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(teaConditions(opts))
  return Number(rows[0]?.count ?? 0)
}

// Values for the browse filters.
export async function listTeaFacets(db: Db) {
  const [brandRows, subtypeRows, originRows] = await Promise.all([
    db
      .selectDistinct({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands)
      .innerJoin(schema.teas, eq(schema.teas.brandId, schema.brands.id))
      .orderBy(asc(schema.brands.name), asc(schema.brands.id)),
    db.selectDistinct({ v: schema.teas.subtype }).from(schema.teas).orderBy(asc(schema.teas.subtype)),
    db.selectDistinct({ v: schema.teas.origin }).from(schema.teas).orderBy(asc(schema.teas.origin)),
  ])
  return {
    brands: brandRows,
    subtypes: subtypeRows.map((r) => r.v).filter((v): v is string => !!v),
    origins: originRows.map((r) => r.v).filter((v): v is string => !!v),
  }
}

export async function getTea(db: Db, teaId: number) {
  const rows = await db
    .select()
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.teas.id, teaId))

  if (rows.length === 0) return null

  return {
    tea: rows[0].teas,
    brand: rows[0].brands,
  }
}

export type ReviewWithUser = schema.Review & {
  helpfulCount: number
  user: Pick<schema.User, 'id' | 'name' | 'avatarUrl' | 'profilePublic'>
}

// Hidden reviews are never listed. reviewLimit/reviewOffset page the review list; one extra row is fetched into
// `hasMoreReviews` so callers can show a Next link without a count query.
export async function getTeaWithDetails(
  db: Db,
  teaId: number,
  opts: { reviewLimit?: number; reviewOffset?: number; sort?: ReviewSort } = {},
) {
  const { reviewLimit = 10, reviewOffset = 0, sort = 'recent' } = opts
  const teaResult = await getTea(db, teaId)
  if (!teaResult) return null

  const reviewRows = await db
    .select({
      review: schema.reviews,
      helpfulCount: helpfulCountSql,
      user: {
        id: schema.users.id,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
        profilePublic: schema.users.profilePublic,
      },
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
    .where(and(eq(schema.reviews.teaId, teaId), eq(schema.reviews.hidden, false)))
    .orderBy(...reviewOrderBy(sort))
    .limit(reviewLimit + 1)
    .offset(reviewOffset)

  const hasMoreReviews = reviewRows.length > reviewLimit
  const reviews: ReviewWithUser[] = reviewRows.slice(0, reviewLimit).map((r) => ({
    ...r.review,
    helpfulCount: r.helpfulCount,
    user: r.user,
  }))

  const affiliateLinkRows = await db
    .select()
    .from(schema.affiliateLinks)
    .where(eq(schema.affiliateLinks.teaId, teaId))

  return {
    tea: teaResult.tea,
    brand: teaResult.brand,
    reviews,
    hasMoreReviews,
    affiliateLinks: affiliateLinkRows,
  }
}

// One statement, so the stored score and count can never disagree. Hidden
// reviews are excluded. Callers that write reviews take lockTea() first (see
// lib/data/reviews.ts) so concurrent writers serialize. leaf_score is always the
// plain average; use hasPublicScore() from lib/scoring.ts to decide whether to show it.
export async function recalcLeafScore(db: Db, teaId: number) {
  await db
    .update(schema.teas)
    .set({
      leafScore: sql`(select avg(${schema.reviews.score}) from ${schema.reviews} where ${schema.reviews.teaId} = ${teaId} and not ${schema.reviews.hidden})`,
      reviewCount: sql`(select count(*)::int from ${schema.reviews} where ${schema.reviews.teaId} = ${teaId} and not ${schema.reviews.hidden})`,
    })
    .where(eq(schema.teas.id, teaId))
}

export async function searchTeas(db: Db, query: string, limit = 10) {
  const pattern = `%${escapeLike(query)}%`
  return db
    .select(getTableColumns(schema.teas))
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(or(ilike(schema.teas.name, pattern), ilike(schema.brands.name, pattern)))
    .orderBy(asc(schema.teas.name), asc(schema.teas.id))
    .limit(limit)
}
