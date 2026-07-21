import { eq, and } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function listWishlist(db: Db, userId: number) {
  return db
    .select({
      wishlistItem: schema.wishlist,
      tea: schema.teas,
    })
    .from(schema.wishlist)
    .innerJoin(schema.teas, eq(schema.wishlist.teaId, schema.teas.id))
    .where(eq(schema.wishlist.userId, userId))
}

export async function addToWishlist(db: Db, userId: number, teaId: number) {
  await db
    .insert(schema.wishlist)
    .values({ userId, teaId })
    .onConflictDoNothing()
}

export async function removeFromWishlist(db: Db, userId: number, teaId: number) {
  await db
    .delete(schema.wishlist)
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.teaId, teaId)))
}

export async function isInWishlist(db: Db, userId: number, teaId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.wishlist)
    .where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.teaId, teaId)))

  return rows.length > 0
}
