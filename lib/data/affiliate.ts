import { asc, and, eq, like, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { AffiliateInput } from '@/lib/affiliate'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listAffiliateLinks(db: Db, teaId: number) {
  return db
    .select()
    .from(schema.affiliateLinks)
    .where(eq(schema.affiliateLinks.teaId, teaId))
    .orderBy(asc(schema.affiliateLinks.id))
}

export async function createAffiliateLink(db: Db, teaId: number, input: AffiliateInput) {
  const [row] = await db.insert(schema.affiliateLinks).values({ teaId, ...input }).returning()
  return row
}

export async function updateAffiliateLink(db: Db, id: number, teaId: number, input: AffiliateInput) {
  const [row] = await db
    .update(schema.affiliateLinks)
    .set(input)
    .where(and(eq(schema.affiliateLinks.id, id), eq(schema.affiliateLinks.teaId, teaId)))
    .returning()
  return row ?? null
}

export async function deleteAffiliateLink(db: Db, id: number, teaId: number) {
  const rows = await db
    .delete(schema.affiliateLinks)
    .where(and(eq(schema.affiliateLinks.id, id), eq(schema.affiliateLinks.teaId, teaId)))
    .returning({ id: schema.affiliateLinks.id })
  return rows.length > 0
}

// One atomic UPDATE: increments and returns the stored URL. Only https rows are
// touched, so a bad row neither counts nor redirects. Callers must still re-check
// the URL with safeHttpUrl before redirecting.
export async function recordAffiliateClick(db: Db, id: number): Promise<string | null> {
  const [row] = await db
    .update(schema.affiliateLinks)
    .set({ clickCount: sql`${schema.affiliateLinks.clickCount} + 1` })
    .where(and(eq(schema.affiliateLinks.id, id), like(schema.affiliateLinks.url, 'https://%')))
    .returning({ url: schema.affiliateLinks.url })
  return row?.url ?? null
}
