import Link from 'next/link'

type PagerProps = {
  page: number
  hasNext: boolean
  hrefFor: (page: number) => string
  totalPages?: number
}

// Server-rendered Previous/Next links. Shows "Page X of Y" when the total is known.
export function Pager({ page, hasNext, hrefFor, totalPages }: PagerProps) {
  if (page <= 1 && !hasNext) return null

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 24,
      }}
    >
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 44 }}
          rel="prev"
        >
          Previous
        </Link>
      ) : null}
      <span className="subtle" aria-current="page">
        {totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`}
      </span>
      {hasNext ? (
        <Link
          href={hrefFor(page + 1)}
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 44 }}
          rel="next"
        >
          Next
        </Link>
      ) : null}
    </nav>
  )
}

// Parses a ?page-style param into a positive integer.
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}
