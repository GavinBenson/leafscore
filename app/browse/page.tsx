import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { countTeas, listTeas, type TeaSort } from '@/lib/data/teas'
import { getBrowseFacetsCached, listBrowseCached } from '@/lib/cache'
import { TeaCard } from '@/components/TeaCard'
import { FilterBar } from '@/components/FilterBar'
import { Pager } from '@/components/Pager'
import { clampPage, parseId } from '@/lib/ids'

const TEA_TYPES = [
  'Green',
  'Black',
  'White',
  'Oolong',
  'Pu-erh',
  'Yellow',
  'Herbal',
  'Rooibos',
]

// Canonical ignores type/sort/q/page so filtered views consolidate onto /browse.
export const metadata = {
  title: 'Browse teas',
  description: 'Browse and filter teas by type, with community LeafScore ratings.',
  alternates: { canonical: '/browse' },
  openGraph: { url: '/browse', siteName: 'LeafScore', title: 'Browse teas' },
}

const PER_PAGE = 12
const SORTS: TeaSort[] = ['score', 'newest', 'name']

type Param = string | string[] | undefined

function first(value: Param): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v ? v : undefined
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Param>>
}) {
  const sp = await searchParams
  const type = first(sp.type)
  const q = first(sp.q)?.trim().slice(0, 100) || undefined
  const subtype = first(sp.subtype)
  const origin = first(sp.origin)
  const brand = first(sp.brand)
  const brandId = (brand ? parseId(brand) : null) ?? undefined
  const sortParam = first(sp.sort)
  const sort = SORTS.find((s) => s === sortParam) ?? 'score'
  const currentPage = clampPage(sp.page)

  const filters = { type, search: q, brandId, subtype, origin }

  const facets = await getBrowseFacetsCached()
  // Only a bounded set of filter values is cached (no free-text search, values
  // must exist in the facets) so arbitrary query strings cannot fill the cache.
  const cacheable =
    !q &&
    currentPage <= 50 &&
    (!type || TEA_TYPES.includes(type)) &&
    (!subtype || facets.subtypes.includes(subtype)) &&
    (!origin || facets.origins.includes(origin)) &&
    (brandId === undefined || facets.brands.some((b) => b.id === brandId))
  const { teas, total } = cacheable
    ? await listBrowseCached({ type, subtype, origin, brandId }, sort, currentPage, PER_PAGE)
    : {
        teas: await listTeas(db, { ...filters, sort, limit: PER_PAGE, offset: (currentPage - 1) * PER_PAGE }),
        total: await countTeas(db, filters),
      }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const hasFilters = Boolean(type || q || subtype || origin || brandId !== undefined)

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (sortParam && sort !== 'score') params.set('sort', sort)
    if (q) params.set('q', q)
    if (brandId !== undefined) params.set('brand', String(brandId))
    if (subtype) params.set('subtype', subtype)
    if (origin) params.set('origin', origin)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/browse${qs ? `?${qs}` : ''}`
  }

  // A page past the end (stale link, edited URL): go to the last real page.
  if (currentPage > totalPages) redirect(pageHref(totalPages))

  return (
    <>
      <h1 className="section-title">Browse Teas</h1>

      <Suspense fallback={null}>
        <FilterBar
          types={TEA_TYPES}
          brands={facets.brands}
          subtypes={facets.subtypes}
          origins={facets.origins}
          currentType={type}
          currentSort={sort}
          currentQuery={q ?? ''}
          currentBrand={brandId !== undefined ? String(brandId) : undefined}
          currentSubtype={subtype}
          currentOrigin={origin}
        />
      </Suspense>

      {teas.length === 0 ? (
        <div className="empty-state">
          <p>No teas found. Try a different filter.</p>
          {hasFilters && (
            <Link href="/browse" className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
              Clear filters
            </Link>
          )}
          <Link
            href={q ? `/requests/new?name=${encodeURIComponent(q)}` : '/requests/new'}
            className="btn btn-primary btn-sm"
            style={{ minHeight: 44 }}
          >
            Can&apos;t find your tea? Request it
          </Link>
        </div>
      ) : (
        <div className="tea-grid">
          {teas.map((tea) => (
            <TeaCard key={tea.id} tea={tea} />
          ))}
        </div>
      )}

      <Pager
        page={currentPage}
        hasNext={currentPage < totalPages}
        hrefFor={pageHref}
        totalPages={totalPages}
      />
    </>
  )
}
