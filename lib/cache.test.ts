import { beforeEach, describe, expect, it, vi } from 'vitest'

type Registration = { keyParts: string[]; options: { tags?: string[]; revalidate?: number } }

const mocks = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  registrations: [] as Registration[],
  // Records what each reader registers; the wrapped function runs directly.
  unstable_cache: vi.fn((fn: unknown, keyParts: string[], options: Registration['options']) => {
    mocks.registrations.push({ keyParts, options })
    return fn
  }),
}))
vi.mock('next/cache', () => mocks)
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/data/brands', () => ({
  listBrands: vi.fn(async () => []),
  getBrandWithTeas: vi.fn(async () => ({ id: 1 })),
}))
vi.mock('@/lib/data/lists', () => ({
  listPublicLists: vi.fn(async () => [
    { list: { id: 5, isPublic: true, hidden: false, updatedAt: new Date('2026-01-01') }, owner: { id: 1, name: 'A' }, teaCount: 3 },
  ]),
}))
vi.mock('@/lib/data/seo', () => ({
  getTeaSeo: vi.fn(async () => ({ id: 7 })),
  listBrandSitemapRows: vi.fn(async () => []),
  listTeaSitemapRows: vi.fn(async () => []),
}))
vi.mock('@/lib/data/teas', () => ({
  countTeas: vi.fn(async () => 0),
  listTeas: vi.fn(async () => []),
  listTeaFacets: vi.fn(async () => ({})),
  getTeaWithDetails: vi.fn(async () => ({ reviews: [] })),
}))
vi.mock('@/lib/data/brewGuide', () => ({ getBrewGuide: vi.fn(async () => ({ temperature: null, time: null, method: null })) }))
vi.mock('@/lib/data/similarTeas', () => ({ getSimilarTeas: vi.fn(async () => []) }))
vi.mock('@/lib/data/reviews', () => ({ listTagNamesForReviews: vi.fn(async () => ({})) }))

const cache = await import('./cache')
// Readers built at import time (the rest register when called).
const moduleLevel = [...mocks.registrations]

const tags = () => mocks.updateTag.mock.calls.map((c) => c[0])

describe('lib/cache invalidation helpers', () => {
  beforeEach(() => {
    mocks.updateTag.mockClear()
    mocks.revalidatePath.mockClear()
  })

  it('revalidateTeaCaches(id) expires listings, sitemap and that tea only', () => {
    cache.revalidateTeaCaches(7)
    expect(tags().sort()).toEqual(['sitemap', 'tea:7', 'teas'])
  })

  it('revalidateTeaCaches() expires every tea page', () => {
    cache.revalidateTeaCaches()
    expect(tags()).toContain('tea-pages')
  })

  it('revalidateListCaches expires the lists tag and the sitemap only', () => {
    cache.revalidateListCaches()
    expect(tags().sort()).toEqual(['lists', 'sitemap'])
  })

  it('revalidateBrandCaches expires brands, listings and sitemap', () => {
    cache.revalidateBrandCaches()
    expect(tags().sort()).toEqual(['brands', 'sitemap', 'teas'])
  })

  it('revalidateProfileCaches expires the profile, authors and path', () => {
    cache.revalidateProfileCaches(3)
    expect(tags().sort()).toEqual(['profile:3', 'review-authors'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/u/3')
  })

  it('revalidateProfileCaches with reviewsChanged also drops tea caches', () => {
    cache.revalidateProfileCaches(3, { reviewsChanged: true })
    expect(tags()).toEqual(expect.arrayContaining(['profile:3', 'teas', 'tea-pages', 'sitemap']))
  })
})

describe('cached readers carry the right tags and keys', () => {
  // Calling a reader registers it (and runs the mocked function once).
  async function registerAll() {
    mocks.registrations.length = 0
    mocks.registrations.push(...moduleLevel)
    await cache.getTopRatedTeasCached()
    await cache.listBrandsCached()
    await cache.getBrowseFacetsCached()
    await cache.getBrandWithTeasCached(4)
    await cache.listBrowseCached({ type: 'Green', brandId: 2 }, 'score', 3, 12)
    await cache.getTeaPageCached(7, 2, 10)
    await cache.getTeaSeoCached(7)
    await cache.getSitemapRowsCached(500)
    await cache.getBrewGuideCached(7)
    await cache.getSimilarTeasCached(7)
    return mocks.registrations
  }
  const find = async (first: string, second?: string) => {
    const reg = (await registerAll()).find(
      (r) => r.keyParts[0] === first && (second === undefined || r.keyParts[1] === second),
    )
    expect(reg, first).toBeDefined()
    return reg!
  }

  it('registers every reader once, all with a TTL', async () => {
    const regs = await registerAll()
    expect(regs.map((r) => r.keyParts[0]).sort()).toEqual(
      ['brand-page', 'brands-list', 'brew-guide', 'browse', 'browse-facets', 'home-top-rated', 'similar-teas', 'sitemap-rows', 'tea-page', 'tea-seo'].sort(),
    )
    for (const r of regs) expect(r.options.revalidate).toBe(cache.CACHE_TTL_SECONDS)
  })

  it('tea page: tea:<id>, tea-pages, review-authors; key has id and page', async () => {
    const r = await find('tea-page')
    expect(r.options.tags).toEqual(expect.arrayContaining(['tea:7', 'tea-pages', 'review-authors']))
    expect(r.keyParts).toEqual(['tea-page', '7', 'rpage=2', 'per=10', 'rsort=recent'])
  })

  it('tea seo: tea:<id> and tea-pages, keyed by id', async () => {
    const r = await find('tea-seo')
    expect(r.options.tags).toEqual(expect.arrayContaining(['tea:7', 'tea-pages', 'teas', 'brands']))
    expect(r.keyParts).toEqual(['tea-seo', '7'])
  })

  it('brew guide: tea:<id> and tea-pages, keyed by id', async () => {
    const r = await find('brew-guide')
    expect(r.options.tags).toEqual(['tea:7', 'tea-pages'])
    expect(r.keyParts).toEqual(['brew-guide', '7'])
  })

  it('similar teas: teas and tea:<id>, keyed by id', async () => {
    const r = await find('similar-teas')
    expect(r.options.tags).toEqual(['teas', 'tea:7'])
    expect(r.keyParts).toEqual(['similar-teas', '7'])
  })

  it('browse listing: teas, keyed by filters, sort and page', async () => {
    const r = await find('browse')
    expect(r.options.tags).toEqual(['teas'])
    expect(r.keyParts).toEqual(
      expect.arrayContaining(['type=Green', 'brand=2', 'sort=score', 'page=3', 'per=12']),
    )
  })

  it('brand page: brands and teas, keyed by id', async () => {
    const r = await find('brand-page')
    expect(r.options.tags).toEqual(expect.arrayContaining(['brands', 'teas']))
    expect(r.keyParts).toEqual(['brand-page', '4'])
  })

  it('sitemap rows carry only plain public list fields (no owner, no title)', async () => {
    const { listPublicLists } = await import('@/lib/data/lists')
    const rows = await cache.getSitemapRowsCached(500)
    expect(rows.lists).toEqual([
      { id: 5, isPublic: true, hidden: false, teaCount: 3, updatedAt: new Date('2026-01-01') },
    ])
    expect(listPublicLists).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ minTeas: 2 }))
  })

  it('sitemap rows: sitemap, teas, brands', async () => {
    const r = await find('sitemap-rows')
    expect(r.options.tags).toEqual(expect.arrayContaining(['sitemap', 'teas', 'brands', 'lists']))
  })

  it('home, brands list and facets use their tags', async () => {
    expect((await find('home-top-rated')).options.tags).toEqual(['teas'])
    expect((await find('brands-list')).options.tags).toEqual(['brands'])
    expect((await find('browse-facets')).options.tags).toEqual(expect.arrayContaining(['teas', 'brands']))
  })

  it('never registers a tag that no invalidation helper emits', async () => {
    mocks.updateTag.mockClear()
    cache.revalidateTeaCaches(7)
    cache.revalidateTeaCaches()
    cache.revalidateBrandCaches()
    cache.revalidateListCaches()
    cache.revalidateProfileCaches(3, { reviewsChanged: true })
    const emitted = new Set(tags())
    for (const r of await registerAll()) {
      for (const tag of r.options.tags ?? []) expect(emitted, tag).toContain(tag)
    }
  })
})
