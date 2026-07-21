import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/db/client'
import { listTeas } from '@/lib/data/teas'
import { TeaCard } from '@/components/TeaCard'
import { FilterBar } from '@/components/FilterBar'

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

const PER_PAGE = 12

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; q?: string; page?: string }>
}) {
  const { type, sort, q, page } = await searchParams
  const currentPage = Math.max(1, Number(page) || 1)
  const offset = (currentPage - 1) * PER_PAGE

  const teas = await listTeas(db, {
    type,
    search: q,
    sort: (sort as 'score' | 'newest' | 'name') ?? 'score',
    limit: PER_PAGE + 1, // fetch one extra to detect "has next"
    offset,
  })

  const hasNext = teas.length > PER_PAGE
  const displayTeas = hasNext ? teas.slice(0, PER_PAGE) : teas

  // Build pagination hrefs
  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (sort) params.set('sort', sort)
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/browse${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      <h1 className="section-title">Browse Teas</h1>

      <Suspense fallback={null}>
        <FilterBar types={TEA_TYPES} currentType={type} currentSort={sort} />
      </Suspense>

      {displayTeas.length === 0 ? (
        <div className="empty-state">
          <p>No teas found. Try a different filter.</p>
        </div>
      ) : (
        <div className="tea-grid">
          {displayTeas.map((tea) => (
            <TeaCard key={tea.id} tea={tea} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(currentPage > 1 || hasNext) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 32,
          }}
        >
          {currentPage > 1 && (
            <Link href={pageHref(currentPage - 1)} className="btn btn-ghost btn-sm">
              Previous
            </Link>
          )}
          {hasNext && (
            <Link href={pageHref(currentPage + 1)} className="btn btn-ghost btn-sm">
              Next
            </Link>
          )}
        </div>
      )}
    </>
  )
}
