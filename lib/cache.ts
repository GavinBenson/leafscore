// Caching and invalidation for anonymous (same-for-everyone) reads. PBI 34.
//
// Mechanism: next.config.ts does NOT enable `cacheComponents`, so the previous
// caching model applies: `unstable_cache` (data cache) + tags, invalidated with
// `updateTag`. Docs relied on (node_modules/next/dist/docs/01-app/):
//   - 02-guides/caching-without-cache-components.md (unstable_cache, tags, route
//     segment config, on-demand revalidation)
//   - 03-api-reference/04-functions/unstable_cache.md (no cookies()/headers()
//     inside the cached function; pass request data as arguments; arguments and
//     keyParts form the key; results are JSON-serialized)
//   - 03-api-reference/04-functions/updateTag.md and revalidateTag.md (updateTag
//     is for Server Actions and expires immediately = read-your-own-writes;
//     revalidateTag needs a profile and serves stale content)
//   - 03-api-reference/04-functions/connection.md (marks a page dynamic without
//     setting fetchCache=force-no-store; `dynamic = 'force-dynamic'` would make
//     unstable_cache bypass its cache, see unstable-cache.js)
//
// RULES
//   - Cached readers take only serializable arguments and never touch cookies,
//     headers or the session. Per-user data (favorite/wishlist state, "you
//     reviewed this", journal, settings, admin) is NEVER read through this file.
//   - Cached values are JSON round-tripped: Date fields arrive as ISO strings.
//   - Every reader has a TTL so a missed invalidation heals itself.
//   - The invalidate* helpers call updateTag, so they may only be called from
//     Server Actions (every write path in actions/*.ts is one).
//   - The db client is imported lazily so importing this module never throws
//     when DATABASE_URL is unset (build, tests).
import { revalidatePath, unstable_cache, updateTag } from 'next/cache'
import { listBrands, getBrandWithTeas } from '@/lib/data/brands'
import { getTeaSeo, listBrandSitemapRows, listTeaSitemapRows } from '@/lib/data/seo'
import { countTeas, getTeaWithDetails, listTeaFacets, listTeas, type TeaSort } from '@/lib/data/teas'
import { listTagNamesForReviews } from '@/lib/data/reviews'
import type { ReviewSort } from '@/lib/data/helpful'
import { MIN_REVIEWS_FOR_SCORE } from '@/lib/scoring'
import { getBrewGuide } from '@/lib/data/brewGuide'
import { getSimilarTeas } from '@/lib/data/similarTeas'
import { listPublicLists } from '@/lib/data/lists'

/** Seconds before any cached entry is recomputed even if nobody invalidated it. */
export const CACHE_TTL_SECONDS = 300

export const TAGS = {
  /** Tea listings: home, browse, brand pages, facets. Any tea/score change. */
  teas: 'teas',
  tea: (id: number) => `tea:${id}`,
  /** Every cached tea page (used when the tea id is unknown). */
  teaPages: 'tea-pages',
  /** Tea pages show reviewer name and profile link, so profile edits touch them. */
  reviewAuthors: 'review-authors',
  brands: 'brands',
  profile: (id: number) => `profile:${id}`,
  sitemap: 'sitemap',
  /** Public curated lists (PBI 44): sitemap entries. Per-viewer list pages are never cached. */
  lists: 'lists',
} as const

async function getDb() {
  return (await import('@/db/client')).db
}

// ---- Invalidation (Server Actions only) ----

/** A tea or its reviews changed. Omit teaId when it is unknown (all tea pages). */
export function revalidateTeaCaches(teaId?: number) {
  updateTag(TAGS.teas)
  updateTag(TAGS.sitemap)
  updateTag(teaId === undefined ? TAGS.teaPages : TAGS.tea(teaId))
}

/** A public list was created, changed, hidden or deleted. Server Actions only. */
export function revalidateListCaches() {
  updateTag(TAGS.lists)
  updateTag(TAGS.sitemap)
}

/** Brands were added/changed/removed (also covers the tea listings that join brands). */
export function revalidateBrandCaches() {
  updateTag(TAGS.brands)
  updateTag(TAGS.teas)
  updateTag(TAGS.sitemap)
}

/**
 * A user's public profile data changed (name, privacy). With
 * `reviewsChanged` (account deleted, user banned) their reviews also vanish
 * from tea pages and scores, so every tea cache is dropped too.
 */
export function revalidateProfileCaches(userId: number, opts: { reviewsChanged?: boolean } = {}) {
  updateTag(TAGS.profile(userId))
  updateTag(TAGS.reviewAuthors)
  revalidatePath(`/u/${userId}`)
  if (opts.reviewsChanged) revalidateTeaCaches()
}

// ---- Cached anonymous readers ----

const base = { revalidate: CACHE_TTL_SECONDS }

export const getTopRatedTeasCached = unstable_cache(
  async () =>
    listTeas(await getDb(), { sort: 'score', minReviews: MIN_REVIEWS_FOR_SCORE, limit: 6 }),
  ['home-top-rated'],
  { ...base, tags: [TAGS.teas] },
)

export const listBrandsCached = unstable_cache(
  async () => listBrands(await getDb()),
  ['brands-list'],
  { ...base, tags: [TAGS.brands] },
)

export const getBrowseFacetsCached = unstable_cache(
  async () => listTeaFacets(await getDb()),
  ['browse-facets'],
  { ...base, tags: [TAGS.teas, TAGS.brands] },
)

// A null result (unknown id) is not cached: the id may be created later.
class NotCached extends Error {}

export async function getBrandWithTeasCached(brandId: number) {
  try {
    return await unstable_cache(
      async () => {
        const result = await getBrandWithTeas(await getDb(), brandId)
        if (!result) throw new NotCached()
        return result
      },
      ['brand-page', String(brandId)],
      { ...base, tags: [TAGS.brands, TAGS.teas] },
    )()
  } catch (error) {
    if (error instanceof NotCached) return null
    throw error
  }
}

export type BrowseFilters = {
  type?: string
  subtype?: string
  origin?: string
  brandId?: number
}

/**
 * One /browse page for the anonymous filter combination. The caller must only
 * pass a bounded set of filter values (no free-text search) so the key space
 * stays small. Key = normalized filters + sort + page + page size.
 */
export function listBrowseCached(
  filters: BrowseFilters,
  sort: TeaSort,
  page: number,
  perPage: number,
) {
  const key = [
    'browse',
    `type=${filters.type ?? ''}`,
    `subtype=${filters.subtype ?? ''}`,
    `origin=${filters.origin ?? ''}`,
    `brand=${filters.brandId ?? ''}`,
    `sort=${sort}`,
    `page=${page}`,
    `per=${perPage}`,
  ]
  return unstable_cache(
    async () => {
      const db = await getDb()
      const [teas, total] = await Promise.all([
        listTeas(db, { ...filters, sort, limit: perPage, offset: (page - 1) * perPage }),
        countTeas(db, filters),
      ])
      return { teas, total }
    },
    key,
    { ...base, tags: [TAGS.teas] },
  )()
}

/**
 * Anonymous core of the tea page: tea, brand, a page of public non-hidden
 * reviews (hidden filtering happens in getTeaWithDetails), flavor tags,
 * aggregates (on the tea row) and affiliate links. Takes only ids/page numbers.
 * The review sort (PBI 49) is part of the cache key (rsort=...); the helpful
 * counts it carries are user-independent, and a vote expires the tea:<id> tag.
 * Which reviews the viewer voted for is read per request, outside this cache.
 */
export async function getTeaPageCached(
  teaId: number,
  reviewPage: number,
  perPage: number,
  sort: ReviewSort = 'recent',
) {
  try {
    return await unstable_cache(
      async () => {
        const db = await getDb()
        const result = await getTeaWithDetails(db, teaId, {
          reviewLimit: perPage,
          reviewOffset: (reviewPage - 1) * perPage,
          sort,
        })
        if (!result) throw new NotCached()
        const reviewTags = await listTagNamesForReviews(db, result.reviews.map((r) => r.id))
        return { ...result, reviewTags }
      },
      ['tea-page', String(teaId), `rpage=${reviewPage}`, `per=${perPage}`, `rsort=${sort}`],
      { ...base, tags: [TAGS.tea(teaId), TAGS.teaPages, TAGS.reviewAuthors, TAGS.brands] },
    )()
  } catch (error) {
    if (error instanceof NotCached) return null
    throw error
  }
}

/**
 * Title/description inputs for a tea (generateMetadata). Plain strings and
 * numbers only, so it survives the cache's JSON round trip. Includes the brand
 * name, hence the brands tag. Unknown ids are not cached.
 */
export async function getTeaSeoCached(teaId: number) {
  try {
    return await unstable_cache(
      async () => {
        const result = await getTeaSeo(await getDb(), teaId)
        if (!result) throw new NotCached()
        return result
      },
      ['tea-seo', String(teaId)],
      { ...base, tags: [TAGS.tea(teaId), TAGS.teaPages, TAGS.teas, TAGS.brands] },
    )()
  } catch (error) {
    if (error instanceof NotCached) return null
    throw error
  }
}

/** Community brew guide (PBI 40): aggregate of non-hidden reviews. Plain numbers/strings. */
export function getBrewGuideCached(teaId: number) {
  return unstable_cache(
    async () => getBrewGuide(await getDb(), teaId),
    ['brew-guide', String(teaId)],
    { ...base, tags: [TAGS.tea(teaId), TAGS.teaPages] },
  )()
}

/** Similar teas (PBI 41). Depends on other teas' scores and tags, so it carries the listings tag. */
export function getSimilarTeasCached(teaId: number) {
  return unstable_cache(
    async () => getSimilarTeas(await getDb(), teaId),
    ['similar-teas', String(teaId)],
    { ...base, tags: [TAGS.teas, TAGS.tea(teaId)] },
  )()
}

const MAX_SITEMAP_LISTS = 2000

export function getSitemapRowsCached(maxTeas: number) {
  return unstable_cache(
    async () => {
      const db = await getDb()
      const [teas, brands, lists] = await Promise.all([
        listTeaSitemapRows(db, maxTeas),
        listBrandSitemapRows(db),
        // Public, not hidden, author not banned, at least 2 teas (SQL); only
        // plain fields are kept so the JSON round trip is safe.
        listPublicLists(db, { limit: MAX_SITEMAP_LISTS, minTeas: 2 }),
      ])
      return {
        teas,
        brands,
        lists: lists.map((l) => ({
          id: l.list.id,
          isPublic: l.list.isPublic,
          hidden: l.list.hidden,
          teaCount: l.teaCount,
          updatedAt: l.list.updatedAt,
        })),
      }
    },
    ['sitemap-rows', String(maxTeas)],
    { ...base, tags: [TAGS.sitemap, TAGS.teas, TAGS.brands, TAGS.lists] },
  )()
}
