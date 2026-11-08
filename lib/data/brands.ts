import { eq, asc } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listBrands(db: Db) {
  return db.select().from(schema.brands).orderBy(asc(schema.brands.name))
}

export async function getBrand(db: Db, brandId: number) {
  const rows = await db
    .select()
    .from(schema.brands)
    .where(eq(schema.brands.id, brandId))

  return rows[0] ?? null
}

export async function getBrandWithTeas(db: Db, brandId: number) {
  const brand = await getBrand(db, brandId)
  if (!brand) return null

  const brandTeas = await db
    .select()
    .from(schema.teas)
    .where(eq(schema.teas.brandId, brandId))
    .orderBy(asc(schema.teas.name), asc(schema.teas.id))

  return {
    brand,
    teas: brandTeas.map((tea) => ({ ...tea, brand })),
  }
}
