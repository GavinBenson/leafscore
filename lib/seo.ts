/** Serialize JSON for an inline <script>; escapes characters that can break out of it. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export { parseId } from './ids'

/** Convert a 0..100 LeafScore to a 1..5 rating, clamped; null when unusable. */
export function ratingFromScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null
  return Math.min(5, Math.max(1, Math.round((score / 20) * 10) / 10))
}

export function teaDescription(t: {
  name: string
  brand?: string | null
  type: string
  origin?: string | null
  score?: number | null
  reviewCount?: number | null
}): string {
  let first = `${t.name}${t.brand ? ` by ${t.brand}` : ''} is a ${t.type.toLowerCase()} tea`
  if (t.origin) first += ` from ${t.origin}`
  first += '.'
  const count = t.reviewCount ?? 0
  const second =
    t.score != null && count > 0
      ? `LeafScore ${Math.round(t.score)}/100 from ${count} community review${count === 1 ? '' : 's'}.`
      : 'No reviews yet. Be the first to rate it on LeafScore.'
  return `${first} ${second}`
}
