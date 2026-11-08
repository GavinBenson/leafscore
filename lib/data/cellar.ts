import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { parseCellarInput, type CellarInput } from '@/lib/validation/cellar'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// The Premium gate (canUseCellar in lib/premium.ts) is enforced by the action
// layer; these functions only enforce ownership and data rules. Weights are grams.

export type CellarWriteResult =
  | { ok: true; item: schema.CellarItem }
  | { ok: false; reason: 'invalid'; field: keyof CellarInput; error: string }
  | { ok: false; reason: 'tea_not_found' | 'not_found' }

// One row per user and tea: saving again replaces the amounts and details.
export async function upsertCellarItem(
  db: Db,
  userId: number,
  teaId: number,
  input: Partial<Record<keyof CellarInput, unknown>>,
): Promise<CellarWriteResult> {
  const parsed = parseCellarInput(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', field: parsed.field, error: parsed.error }

  const [tea] = await db.select({ id: schema.teas.id }).from(schema.teas).where(eq(schema.teas.id, teaId))
  if (!tea) return { ok: false, reason: 'tea_not_found' }

  const [item] = await db
    .insert(schema.cellarItems)
    .values({ userId, teaId, ...parsed.data })
    .onConflictDoUpdate({
      target: [schema.cellarItems.userId, schema.cellarItems.teaId],
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning()
  return { ok: true, item }
}

// Owner only (not_found otherwise). The tea cannot change.
export async function updateCellarItem(
  db: Db,
  userId: number,
  itemId: number,
  input: Partial<Record<keyof CellarInput, unknown>>,
): Promise<CellarWriteResult> {
  const parsed = parseCellarInput(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', field: parsed.field, error: parsed.error }

  const [item] = await db
    .update(schema.cellarItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.cellarItems.id, itemId), eq(schema.cellarItems.userId, userId)))
    .returning()
  return item ? { ok: true, item } : { ok: false, reason: 'not_found' }
}

export async function deleteCellarItem(db: Db, userId: number, itemId: number): Promise<boolean> {
  const deleted = await db
    .delete(schema.cellarItems)
    .where(and(eq(schema.cellarItems.id, itemId), eq(schema.cellarItems.userId, userId)))
    .returning({ id: schema.cellarItems.id })
  return deleted.length > 0
}

const cellarSelect = {
  item: schema.cellarItems,
  tea: { id: schema.teas.id, name: schema.teas.name, type: schema.teas.type, imageUrl: schema.teas.imageUrl },
  brand: { id: schema.brands.id, name: schema.brands.name },
}

// The user's cellar with tea and brand, alphabetical by tea.
export async function listCellar(db: Db, userId: number) {
  return db
    .select(cellarSelect)
    .from(schema.cellarItems)
    .innerJoin(schema.teas, eq(schema.cellarItems.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.cellarItems.userId, userId))
    .orderBy(asc(schema.teas.name), asc(schema.cellarItems.id))
}

export async function getCellarItemForTea(db: Db, userId: number, teaId: number) {
  const [item] = await db
    .select()
    .from(schema.cellarItems)
    .where(and(eq(schema.cellarItems.userId, userId), eq(schema.cellarItems.teaId, teaId)))
  return item ?? null
}

// Items at or below their own low-stock threshold (items without a threshold never
// qualify), emptiest first.
export async function listLowStock(db: Db, userId: number) {
  return db
    .select(cellarSelect)
    .from(schema.cellarItems)
    .innerJoin(schema.teas, eq(schema.cellarItems.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(
      and(
        eq(schema.cellarItems.userId, userId),
        isNotNull(schema.cellarItems.lowStockGrams),
        sql`${schema.cellarItems.grams} <= ${schema.cellarItems.lowStockGrams}`,
      ),
    )
    .orderBy(asc(schema.cellarItems.grams), asc(schema.teas.name), asc(schema.cellarItems.id))
}
