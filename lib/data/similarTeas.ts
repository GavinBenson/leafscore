import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { MIN_REVIEWS_FOR_SCORE } from '@/lib/scoring'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const MAX_SIMILAR_TEAS = 6
// Bounds on what is pulled into memory for ranking.
const OVERLAP_CANDIDATES = 200
const SAME_TYPE_CANDIDATES = 50

export type SimilarTea = {
  id: number
  name: string
  brandName: string | null
  type: string
  subtype: string | null
  origin: string | null
  leafScore: number
  reviewCount: number
  /** Distinct flavor tags both teas have been tagged with. */
  sharedTags: number
  /** Jaccard overlap of the two tag sets, 0..1. */
  similarity: number
}

export type SimilarSource = {
  type: string
  subtype: string | null
  origin: string | null
}

export type SimilarCandidate = Omit<SimilarTea, 'similarity'> & {
  /** Number of distinct tags on the candidate (for the Jaccard union). */
  tagCount: number
}

/** Jaccard index from set sizes: |A∩B| / (|A| + |B| - |A∩B|). */
export function jaccard(shared: number, sizeA: number, sizeB: number): number {
  const union = sizeA + sizeB - shared
  return union > 0 && shared > 0 ? shared / union : 0
}

const same = (a: string | null, b: string | null) =>
  a != null && b != null && a.toLowerCase() === b.toLowerCase()

/**
 * Pure ranking. Order: tag overlap (Jaccard, to 3 decimals) desc, then same
 * type, same origin, same subtype, then LeafScore desc and id so ties are
 * stable. Candidates with no tag overlap and a different type are dropped; a
 * zero-overlap same-type tea is the fallback when tag data is thin.
 */
export function rankSimilarTeas(
  source: SimilarSource,
  sourceTagCount: number,
  candidates: SimilarCandidate[],
  limit = MAX_SIMILAR_TEAS,
): SimilarTea[] {
  const scored = candidates
    .map((c) => {
      const { tagCount, ...rest } = c
      return {
        tea: { ...rest, similarity: jaccard(c.sharedTags, sourceTagCount, tagCount) } as SimilarTea,
        sameType: same(c.type, source.type),
        sameOrigin: same(c.origin, source.origin),
        sameSubtype: same(c.subtype, source.subtype),
      }
    })
    .filter((x) => x.tea.similarity > 0 || x.sameType)
  scored.sort((a, b) => {
    const sa = Math.round(a.tea.similarity * 1000)
    const sb = Math.round(b.tea.similarity * 1000)
    return (
      sb - sa ||
      Number(b.sameType) - Number(a.sameType) ||
      Number(b.sameOrigin) - Number(a.sameOrigin) ||
      Number(b.sameSubtype) - Number(a.sameSubtype) ||
      b.tea.leafScore - a.tea.leafScore ||
      a.tea.id - b.tea.id
    )
  })
  return scored.slice(0, limit).map((x) => x.tea)
}

const publicScore = and(
  gte(schema.teas.reviewCount, MIN_REVIEWS_FOR_SCORE),
  isNotNull(schema.teas.leafScore),
)

/**
 * Teas similar to `teaId`: only teas with a public score, never the tea itself,
 * flavor tags counted from non-hidden reviews only. At most 6.
 */
export async function getSimilarTeas(db: Db, teaId: number, limit = MAX_SIMILAR_TEAS): Promise<SimilarTea[]> {
  const [source] = await db
    .select({ type: schema.teas.type, subtype: schema.teas.subtype, origin: schema.teas.origin })
    .from(schema.teas)
    .where(eq(schema.teas.id, teaId))
  if (!source) return []

  const sourceTagRows = await db
    .selectDistinct({ tagId: schema.reviewTags.flavorTagId })
    .from(schema.reviewTags)
    .innerJoin(schema.reviews, eq(schema.reviewTags.reviewId, schema.reviews.id))
    .where(and(eq(schema.reviews.teaId, teaId), eq(schema.reviews.hidden, false)))
  const sourceTagIds = sourceTagRows.map((r) => r.tagId)

  const overlap = new Map<number, { shared: number; size: number }>()
  if (sourceTagIds.length > 0) {
    const tagCol = schema.reviewTags.flavorTagId
    const shared = sql<string>`count(distinct ${tagCol}) filter (where ${inArray(tagCol, sourceTagIds)})`
    const rows = await db
      .select({
        teaId: schema.reviews.teaId,
        size: sql<string>`count(distinct ${tagCol})`,
        shared,
      })
      .from(schema.reviewTags)
      .innerJoin(schema.reviews, eq(schema.reviewTags.reviewId, schema.reviews.id))
      .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
      .where(and(eq(schema.reviews.hidden, false), ne(schema.teas.id, teaId), publicScore))
      .groupBy(schema.reviews.teaId)
      .having(sql`${shared} > 0`)
      .orderBy(desc(shared), schema.reviews.teaId)
      .limit(OVERLAP_CANDIDATES)
    for (const r of rows) overlap.set(r.teaId, { shared: Number(r.shared), size: Number(r.size) })
  }

  const select = {
    id: schema.teas.id,
    name: schema.teas.name,
    brandName: schema.brands.name,
    type: schema.teas.type,
    subtype: schema.teas.subtype,
    origin: schema.teas.origin,
    leafScore: schema.teas.leafScore,
    reviewCount: schema.teas.reviewCount,
  }
  const base = () =>
    db
      .select(select)
      .from(schema.teas)
      .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
  const overlapIds = [...overlap.keys()]
  const [overlapTeas, sameTypeTeas] = await Promise.all([
    overlapIds.length > 0
      ? base().where(and(inArray(schema.teas.id, overlapIds), publicScore))
      : Promise.resolve([]),
    base()
      .where(and(eq(schema.teas.type, source.type), ne(schema.teas.id, teaId), publicScore))
      .orderBy(desc(schema.teas.leafScore), desc(schema.teas.reviewCount), schema.teas.id)
      .limit(SAME_TYPE_CANDIDATES),
  ])

  const byId = new Map<number, SimilarCandidate>()
  for (const t of [...overlapTeas, ...sameTypeTeas]) {
    if (byId.has(t.id) || t.leafScore === null) continue
    const o = overlap.get(t.id)
    byId.set(t.id, {
      id: t.id,
      name: t.name,
      brandName: t.brandName,
      type: t.type,
      subtype: t.subtype,
      origin: t.origin,
      leafScore: t.leafScore,
      reviewCount: t.reviewCount,
      sharedTags: o?.shared ?? 0,
      tagCount: o?.size ?? 0,
    })
  }

  return rankSimilarTeas(source, sourceTagIds.length, [...byId.values()], limit)
}
