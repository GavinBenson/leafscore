import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const FLAVOR_WHEEL_SIZE = 8

export type FlavorCount = { name: string; count: number }
export type PassportEntry = { name: string; count: number }
export type Passport = {
  /** Distinct values the user has tried, with the number of reviews for each. */
  tried: PassportEntry[]
  /** Distinct values present in the catalogue. */
  total: number
}

export type BadgeStats = {
  reviewCount: number
  originsTried: number
  /** Largest number of reviews in a single tea type. */
  maxOfOneType: number
}

export type BadgeProgress = {
  id: string
  label: string
  description: string
  target: number
  /** Capped at target. */
  progress: number
  earned: boolean
}

export type BadgeEvaluation = {
  earned: BadgeProgress[]
  /** Unearned badges, closest to completion first. */
  nextUp: BadgeProgress[]
}

type BadgeDef = {
  id: string
  label: string
  description: string
  target: number
  value: (s: BadgeStats) => number
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'first-review', label: 'First review', description: 'Write your first review', target: 1, value: (s) => s.reviewCount },
  { id: 'reviews-10', label: '10 reviews', description: 'Review 10 teas', target: 10, value: (s) => s.reviewCount },
  { id: 'origins-5', label: '5 origins', description: 'Try teas from 5 different origins', target: 5, value: (s) => s.originsTried },
  { id: 'one-type-10', label: '10 of one type', description: 'Review 10 teas of the same type', target: 10, value: (s) => s.maxOfOneType },
  { id: 'reviews-25', label: '25 reviews', description: 'Review 25 teas', target: 25, value: (s) => s.reviewCount },
]

/** Pure: which badges are earned and how far along the rest are. */
export function evaluateBadges(stats: BadgeStats): BadgeEvaluation {
  const all: BadgeProgress[] = BADGES.map((b) => {
    const raw = Math.max(0, Math.floor(Number.isFinite(b.value(stats)) ? b.value(stats) : 0))
    return {
      id: b.id,
      label: b.label,
      description: b.description,
      target: b.target,
      progress: Math.min(raw, b.target),
      earned: raw >= b.target,
    }
  })
  const ratio = (b: BadgeProgress) => b.progress / b.target
  return {
    earned: all.filter((b) => b.earned),
    nextUp: all
      .filter((b) => !b.earned)
      .sort((a, b) => ratio(b) - ratio(a) || a.target - b.target),
  }
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

/** Pure: top N tags by count, ties by name. */
export function topFlavors(rows: FlavorCount[], limit = FLAVOR_WHEEL_SIZE): FlavorCount[] {
  return [...rows]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/**
 * Pure: passport from per-value review counts and the catalogue's distinct
 * values. Blank values are ignored; tried values never exceed the total.
 */
export function buildPassport(
  triedRows: { value: string | null; count: number }[],
  catalogueValues: (string | null)[],
): Passport {
  const catalogue = new Set(catalogueValues.map(clean).filter(Boolean))
  const merged = new Map<string, number>()
  for (const row of triedRows) {
    const v = clean(row.value)
    if (!v || row.count <= 0) continue
    merged.set(v, (merged.get(v) ?? 0) + row.count)
    catalogue.add(v) // a reviewed value is by definition in the catalogue
  }
  const tried = [...merged]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { tried, total: catalogue.size }
}

export type TasteProfileData = {
  reviewCount: number
  flavors: FlavorCount[]
  origins: Passport
  types: Passport
  badges: BadgeEvaluation
}

/** Pure assembly, so the page and tests share one path. */
export function assembleTasteProfile(input: {
  reviewCount: number
  flavorRows: FlavorCount[]
  byOrigin: { value: string | null; count: number }[]
  byType: { value: string | null; count: number }[]
  catalogueOrigins: (string | null)[]
  catalogueTypes: (string | null)[]
}): TasteProfileData {
  const origins = buildPassport(input.byOrigin, input.catalogueOrigins)
  const types = buildPassport(input.byType, input.catalogueTypes)
  return {
    reviewCount: input.reviewCount,
    flavors: topFlavors(input.flavorRows),
    origins,
    types,
    badges: evaluateBadges({
      reviewCount: input.reviewCount,
      originsTried: origins.tried.length,
      maxOfOneType: types.tried[0]?.count ?? 0,
    }),
  }
}

const visible = (userId: number) =>
  and(eq(schema.reviews.userId, userId), eq(schema.reviews.hidden, false))

/** Read-only. Hidden reviews never count. Per-user data: never put this in the shared cache. */
export async function getTasteProfile(db: Db, userId: number): Promise<TasteProfileData> {
  const count = sql<string>`count(*)`
  const [totals, flavorRows, byOrigin, byType, catOrigins, catTypes] = await Promise.all([
    db.select({ count }).from(schema.reviews).where(visible(userId)),
    db
      .select({ name: schema.flavorTags.name, count })
      .from(schema.reviewTags)
      .innerJoin(schema.reviews, eq(schema.reviewTags.reviewId, schema.reviews.id))
      .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
      .where(visible(userId))
      .groupBy(schema.flavorTags.name)
      .orderBy(desc(count), asc(schema.flavorTags.name))
      .limit(FLAVOR_WHEEL_SIZE),
    db
      .select({ value: schema.teas.origin, count })
      .from(schema.reviews)
      .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
      .where(and(visible(userId), isNotNull(schema.teas.origin)))
      .groupBy(schema.teas.origin),
    db
      .select({ value: schema.teas.type, count })
      .from(schema.reviews)
      .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
      .where(visible(userId))
      .groupBy(schema.teas.type),
    db.selectDistinct({ v: schema.teas.origin }).from(schema.teas).where(isNotNull(schema.teas.origin)),
    db.selectDistinct({ v: schema.teas.type }).from(schema.teas),
  ])

  return assembleTasteProfile({
    reviewCount: Number(totals[0]?.count ?? 0),
    flavorRows: flavorRows.map((r) => ({ name: r.name, count: Number(r.count) })),
    byOrigin: byOrigin.map((r) => ({ value: r.value, count: Number(r.count) })),
    byType: byType.map((r) => ({ value: r.value, count: Number(r.count) })),
    catalogueOrigins: catOrigins.map((r) => r.v),
    catalogueTypes: catTypes.map((r) => r.v),
  })
}
