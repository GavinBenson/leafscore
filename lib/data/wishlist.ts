import { eq, and, desc, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const DEFAULT_LIMIT = 24

export async function listWishlist(db: Db, userId: number, opts: { limit?: number; offset?: number } = {}) {
  const { limit = DEFAULT_LIMIT, offset = 0 } = opts

  const rows = await db
    .select({ wishlistItem: schema.wishlist, tea: schema.teas, brand: schema.brands })
    .from(schema.wishlist)
    .innerJoin(schema.teas, eq(schema.wishlist.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.wishlist.userId, userId))
    .orderBy(desc(schema.wishlist.createdAt), desc(schema.wishlist.teaId))
    .limit(limit)
    .offset(offset)

  return rows.map((r) => ({ wishlistItem: r.wishlistItem, tea: { ...r.tea, brand: r.brand } }))
}

export async function countWishlist(db: Db, userId: number) {
  return db.$count(schema.wishlist, eq(schema.wishlist.userId, userId))
}

export async function addToWishlist(db: Db, userId: number, teaId: number) {
  await db
    .insert(schema.wishlist)
    .values({ userId, teaId })
    .onConflictDoNothing()
}

export type CappedAddResult = 'added' | 'exists' | 'limit'

// Atomic cap: the count check and insert run in one transaction under a
// per-user advisory lock, so concurrent adds cannot overshoot the limit.
// Pass limit = null for unlimited (premium).
export async function addToWishlistWithinCap(
  db: Db,
  userId: number,
  teaId: number,
  limit: number | null,
): Promise<CappedAddResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wishlist:${userId}`}))`)
    if (await isInWishlist(tx as unknown as Db, userId, teaId)) return 'exists'
    if (limit !== null) {
      const count = await tx.$count(schema.wishlist, eq(schema.wishlist.userId, userId))
      if (count >= limit) return 'limit'
    }
    const inserted = await tx
      .insert(schema.wishlist)
      .values({ userId, teaId })
      .onConflictDoNothing()
      .returning({ teaId: schema.wishlist.teaId })
    return inserted.length > 0 ? 'added' : 'exists'
  })
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
