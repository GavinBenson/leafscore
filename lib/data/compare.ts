import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { hasPublicScore } from '@/lib/scoring'
import { safeHttpUrl } from '@/lib/safeUrl'
import { cheapestLinkId, formatPrice, pricePer100g } from '@/lib/priceFormat'
import { MAX_COMPARE } from '@/lib/compareIds'
import { getBrewGuide, type BrewGuide } from '@/lib/data/brewGuide'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const COMPARE_TAGS_PER_TEA = 5

export type CompareTea = {
  id: number
  name: string
  brand: { id: number; name: string } | null
  type: string
  origin: string | null
  /** Null until the tea has enough reviews for a public score. */
  leafScore: number | null
  reviewCount: number
  topTags: string[]
  brewGuide: BrewGuide
  cheapest: { linkId: number; provider: string; perHundredGrams: string } | null
}

export type Comparison = {
  teas: CompareTea[]
  /** Valid ids that matched no tea. */
  missingIds: number[]
}

/** Pure: top tags per tea from (teaId, name, count) rows. */
export function pickTopTags(
  rows: { teaId: number; name: string; count: number }[],
  limit = COMPARE_TAGS_PER_TEA,
): Map<number, string[]> {
  const grouped = new Map<number, { name: string; count: number }[]>()
  for (const r of rows) {
    const list = grouped.get(r.teaId) ?? []
    list.push({ name: r.name, count: r.count })
    grouped.set(r.teaId, list)
  }
  const out = new Map<number, string[]>()
  for (const [teaId, list] of grouped) {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    out.set(teaId, list.slice(0, limit).map((t) => t.name))
  }
  return out
}

/** Assemble the comparison for already-validated ids (at most MAX_COMPARE are used). */
export async function getComparison(db: Db, rawIds: readonly number[]): Promise<Comparison> {
  const ids = [...new Set(rawIds)].slice(0, MAX_COMPARE)
  if (ids.length === 0) return { teas: [], missingIds: [] }

  const teaRows = await db
    .select({ tea: schema.teas, brandId: schema.brands.id, brandName: schema.brands.name })
    .from(schema.teas)
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(inArray(schema.teas.id, ids))
  const found = new Map(teaRows.map((r) => [r.tea.id, r]))
  const presentIds = ids.filter((id) => found.has(id))

  if (presentIds.length === 0) return { teas: [], missingIds: ids }

  const count = sql<string>`count(*)`
  const [tagRows, linkRows, guides] = await Promise.all([
    db
      .select({ teaId: schema.reviews.teaId, name: schema.flavorTags.name, count })
      .from(schema.reviewTags)
      .innerJoin(schema.reviews, eq(schema.reviewTags.reviewId, schema.reviews.id))
      .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
      .where(and(inArray(schema.reviews.teaId, presentIds), eq(schema.reviews.hidden, false)))
      .groupBy(schema.reviews.teaId, schema.flavorTags.name)
      .orderBy(asc(schema.reviews.teaId), desc(count), asc(schema.flavorTags.name)),
    db
      .select()
      .from(schema.affiliateLinks)
      .where(inArray(schema.affiliateLinks.teaId, presentIds))
      .orderBy(asc(schema.affiliateLinks.id)),
    Promise.all(presentIds.map((id) => getBrewGuide(db, id))),
  ])

  const tags = pickTopTags(tagRows.map((r) => ({ teaId: r.teaId, name: r.name, count: Number(r.count) })))

  const teas = presentIds.map((id, i): CompareTea => {
    const row = found.get(id)!
    const links = linkRows.filter((l) => l.teaId === id && safeHttpUrl(l.url))
    const cheapestId = cheapestLinkId(links)
    const cheapestLink = links.find((l) => l.id === cheapestId)
    const per = cheapestLink ? pricePer100g(cheapestLink) : null
    return {
      id,
      name: row.tea.name,
      brand: row.brandId != null && row.brandName != null ? { id: row.brandId, name: row.brandName } : null,
      type: row.tea.type,
      origin: row.tea.origin,
      leafScore: hasPublicScore(row.tea.reviewCount) ? row.tea.leafScore : null,
      reviewCount: row.tea.reviewCount ?? 0,
      topTags: tags.get(id) ?? [],
      brewGuide: guides[i],
      cheapest:
        cheapestLink && per
          ? {
              linkId: cheapestLink.id,
              provider: cheapestLink.provider,
              perHundredGrams: formatPrice(per.cents, per.currency),
            }
          : null,
    }
  })

  return { teas, missingIds: ids.filter((id) => !found.has(id)) }
}
