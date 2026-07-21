import { eq, and } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listFavorites(db: Db, userId: number) {
  return db
    .select({
      favorite: schema.favorites,
      tea: schema.teas,
    })
    .from(schema.favorites)
    .innerJoin(schema.teas, eq(schema.favorites.teaId, schema.teas.id))
    .where(eq(schema.favorites.userId, userId))
}

export async function addFavorite(db: Db, userId: number, teaId: number) {
  await db
    .insert(schema.favorites)
    .values({ userId, teaId })
    .onConflictDoNothing()
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
