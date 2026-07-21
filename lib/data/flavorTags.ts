import { eq, asc } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listFlavorTags(db: Db) {
  return db
    .select()
    .from(schema.flavorTags)
    .orderBy(asc(schema.flavorTags.category), asc(schema.flavorTags.name))
}

export async function getTagsForReview(db: Db, reviewId: number) {
  const rows = await db
    .select({ tag: schema.flavorTags })
    .from(schema.reviewTags)
    .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
    .where(eq(schema.reviewTags.reviewId, reviewId))

  return rows.map((r) => r.tag)
}
