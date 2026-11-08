import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function countTeaDependents(db: Db, teaId: number) {
  const [reviews, favorites, wishlist, listItems, cellarItems, sessions] = await Promise.all([
    db.$count(schema.reviews, eq(schema.reviews.teaId, teaId)),
    db.$count(schema.favorites, eq(schema.favorites.teaId, teaId)),
    db.$count(schema.wishlist, eq(schema.wishlist.teaId, teaId)),
    db.$count(schema.listItems, eq(schema.listItems.teaId, teaId)),
    db.$count(schema.cellarItems, eq(schema.cellarItems.teaId, teaId)),
    db.$count(schema.brewSessions, eq(schema.brewSessions.teaId, teaId)),
  ])
  return { reviews, favorites, wishlist, listItems, cellarItems, sessions }
}

export type DeleteTeaResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'has_reviews'; reviewCount: number }

// Reviews are never deleted along with a tea (FK is RESTRICT). Favorites,
// wishlist entries, list items, cellar items, brew sessions and affiliate links go with it; tea requests keep a null link.
export async function deleteTea(db: Db, teaId: number): Promise<DeleteTeaResult> {
  const { reviews } = await countTeaDependents(db, teaId)
  if (reviews > 0) return { ok: false, reason: 'has_reviews', reviewCount: reviews }

  try {
    const deleted = await db
      .delete(schema.teas)
      .where(eq(schema.teas.id, teaId))
      .returning({ id: schema.teas.id })
    return deleted.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' }
  } catch (error) {
    // A review landed between the count and the delete: the FK still protects it.
    const code = (error as { code?: string; cause?: { code?: string } })
    if (code.code === '23503' || code.cause?.code === '23503') {
      return { ok: false, reason: 'has_reviews', reviewCount: (await countTeaDependents(db, teaId)).reviews }
    }
    throw error
  }
}
