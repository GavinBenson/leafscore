import { eq, and, desc, gte } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const DEFAULT_LIMIT = 24

export async function listFavorites(db: Db, userId: number, opts: { limit?: number; offset?: number } = {}) {
  const { limit = DEFAULT_LIMIT, offset = 0 } = opts

  const rows = await db
    .select({ favorite: schema.favorites, tea: schema.teas, brand: schema.brands })
    .from(schema.favorites)
    .innerJoin(schema.teas, eq(schema.favorites.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.favorites.userId, userId))
    .orderBy(desc(schema.favorites.createdAt), desc(schema.favorites.teaId))
    .limit(limit)
    .offset(offset)

  return rows.map((r) => ({ favorite: r.favorite, tea: { ...r.tea, brand: r.brand } }))
}

export async function addFavorite(db: Db, userId: number, teaId: number) {
  await db
    .insert(schema.favorites)
    .values({ userId, teaId })
    .onConflictDoNothing()
}

export async function countFavoritesSince(db: Db, userId: number, since: Date) {
  return db.$count(
    schema.favorites,
    and(eq(schema.favorites.userId, userId), gte(schema.favorites.createdAt, since)),
  )
}

export async function removeFavorite(db: Db, userId: number, teaId: number) {
  await db
    .delete(schema.favorites)
    .where(and(eq(schema.favorites.userId, userId), eq(schema.favorites.teaId, teaId)))
}

export async function isFavorited(db: Db, userId: number, teaId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.favorites)
    .where(and(eq(schema.favorites.userId, userId), eq(schema.favorites.teaId, teaId)))

  return rows.length > 0
}
