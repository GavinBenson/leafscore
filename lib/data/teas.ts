import { eq, ilike, desc, asc, sql, and } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

function escapeLike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

type ListTeasOpts = {
  type?: string
  search?: string
  sort?: 'score' | 'newest' | 'name'
  limit?: number
  offset?: number
}

export async function listTeas(db: Db, opts: ListTeasOpts = {}) {
  const { type, search, sort = 'score', limit = 20, offset = 0 } = opts

  const conditions = []
  if (type) {
    conditions.push(eq(schema.teas.type, type))
  }
  if (search) {
    conditions.push(ilike(schema.teas.name, `%${escapeLike(search)}%`))
  }

  const orderBy =
    sort === 'score'
      ? desc(schema.teas.leafScore)
      : sort === 'newest'
        ? desc(schema.teas.createdAt)
        : asc(schema.teas.name)

  const query = db
    .select()
    .from(schema.teas)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
  }

  return query
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
  user: Pick<schema.User, 'id' | 'name' | 'avatarUrl'>
}

export async function getTeaWithDetails(db: Db, teaId: number) {
  const teaResult = await getTea(db, teaId)
  if (!teaResult) return null

  const reviewRows = await db
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

  const reviews: ReviewWithUser[] = reviewRows.map((r) => ({
    ...r.review,
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
    affiliateLinks: affiliateLinkRows,
  }
}

export async function recalcLeafScore(db: Db, teaId: number) {
  const result = await db
    .select({
      avg: sql<number>`avg(${schema.reviews.score})`,
      count: sql<number>`count(*)`,
    })
    .from(schema.reviews)
    .where(eq(schema.reviews.teaId, teaId))

  const avg = result[0]?.avg ?? null
  const count = Number(result[0]?.count ?? 0)

  await db
    .update(schema.teas)
    .set({
      leafScore: avg,
      reviewCount: count,
    })
    .where(eq(schema.teas.id, teaId))
}

export async function searchTeas(db: Db, query: string, limit = 10) {
  return db
    .select()
    .from(schema.teas)
    .where(ilike(schema.teas.name, `%${escapeLike(query)}%`))
    .limit(limit)
}
