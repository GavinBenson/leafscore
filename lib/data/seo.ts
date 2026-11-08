import { eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function getTeaSeo(db: Db, teaId: number) {
  const rows = await db
    .select({
      id: schema.teas.id,
      name: schema.teas.name,
      type: schema.teas.type,
      origin: schema.teas.origin,
      imageUrl: schema.teas.imageUrl,
      leafScore: schema.teas.leafScore,
      reviewCount: schema.teas.reviewCount,
      brandName: schema.brands.name,
    })
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.teas.id, teaId))
    .limit(1)
  return rows[0] ?? null
}

export async function getBrandSeo(db: Db, brandId: number) {
  const rows = await db
    .select({ id: schema.brands.id, name: schema.brands.name, country: schema.brands.country })
    .from(schema.brands)
    .where(eq(schema.brands.id, brandId))
    .limit(1)
  return rows[0] ?? null
}

/** Tea ids with last-modified = latest review date, falling back to created_at. */
export async function listTeaSitemapRows(db: Db, limit: number) {
  const lastReview = sql<Date | string | null>`max(${schema.reviews.createdAt})`
  return db
    .select({ id: schema.teas.id, createdAt: schema.teas.createdAt, lastReviewAt: lastReview })
    .from(schema.teas)
    .leftJoin(schema.reviews, eq(schema.reviews.teaId, schema.teas.id))
    .groupBy(schema.teas.id)
    .orderBy(schema.teas.id)
    .limit(limit)
}

export async function listBrandSitemapRows(db: Db) {
  return db
    .select({ id: schema.brands.id, createdAt: schema.brands.createdAt })
    .from(schema.brands)
    .orderBy(schema.brands.id)
}
