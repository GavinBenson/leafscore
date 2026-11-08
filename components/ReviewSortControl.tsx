import Link from 'next/link'
import type { ReviewSort } from '@/lib/data/helpful'
import { REVIEW_SORTS, teaReviewsHref } from '@/lib/reviewSort'

// Link group (works without JavaScript). Changing the sort returns to page 1.
export function ReviewSortControl({ teaId, sort }: { teaId: number; sort: ReviewSort }) {
  return (
    <nav aria-label="Sort reviews" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="subtle">Sort by</span>
      {REVIEW_SORTS.map(({ key, label }) => (
        <Link
          key={key}
          href={`${teaReviewsHref(teaId, 1, key)}#reviews`}
          scroll={false}
          className={`btn btn-sm ${sort === key ? 'btn-primary' : 'btn-ghost'}`}
          style={{ minHeight: 44 }}
          aria-current={sort === key ? 'true' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
