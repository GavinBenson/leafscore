import type { ReviewSort } from '@/lib/data/helpful'

// Pure helpers for the tea page review sort (PBI 49). The ?rsort= value is
// validated against this list; anything else means the default, newest first.
export const REVIEW_SORTS: readonly { key: ReviewSort; label: string }[] = [
  { key: 'recent', label: 'Most recent' },
  { key: 'helpful', label: 'Most helpful' },
]

export function parseReviewSort(value: string | string[] | undefined): ReviewSort {
  const raw = Array.isArray(value) ? value[0] : value
  return REVIEW_SORTS.find((s) => s.key === raw)?.key ?? 'recent'
}

// Tea page URL for a review page and sort. Defaults are left out of the URL.
export function teaReviewsHref(teaId: number, page = 1, sort: ReviewSort = 'recent'): string {
  const params = new URLSearchParams()
  if (sort !== 'recent') params.set('rsort', sort)
  if (page > 1) params.set('rpage', String(page))
  const qs = params.toString()
  return `/browse/${teaId}${qs ? `?${qs}` : ''}`
}
