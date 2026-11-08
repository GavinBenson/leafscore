// Price-per-100g helpers for affiliate links (PBI 46). Prices are stored in minor
// units (cents) of the link's currency. No scraping, no conversion between
// currencies: comparison is only meaningful inside one currency, so
// sortLinksByPrice/cheapestLinkId compare within the most common currency.

export type PricedLink = {
  id: number
  priceCents?: number | null
  currency?: string | null
  pricePer100gCents?: number | null
}

export type Per100g = { cents: number; currency: string }

/** Stored price per 100 g, or null when missing/invalid. */
export function pricePer100g(link: PricedLink): Per100g | null {
  const cents = link.pricePer100gCents
  if (cents == null || !Number.isFinite(cents) || cents < 0) return null
  return { cents, currency: (link.currency || 'USD').toUpperCase() }
}

/** "$8.00" using Intl.NumberFormat and the stored currency; falls back for bad codes. */
export function formatPrice(cents: number, currency: string | null | undefined): string {
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`
  }
}

/** "$8.00 / 100 g" or null when the link has no price per 100 g. */
export function formatPricePer100g(link: PricedLink): string | null {
  const p = pricePer100g(link)
  return p ? `${formatPrice(p.cents, p.currency)} / 100 g` : null
}

/** The currency most links with a price share (ties: alphabetical). Null if none. */
function dominantCurrency(links: PricedLink[]): string | null {
  const counts = new Map<string, number>()
  for (const l of links) {
    const p = pricePer100g(l)
    if (p) counts.set(p.currency, (counts.get(p.currency) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [cur, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (best === null || n > (counts.get(best) ?? 0)) best = cur
  }
  return best
}

/**
 * New array ordered by price per 100 g ascending. Links in the dominant currency
 * come first, then other currencies (by amount), then links without a price.
 * Ties keep the original order (stable) and then id.
 */
export function sortLinksByPrice<T extends PricedLink>(links: readonly T[]): T[] {
  const main = dominantCurrency([...links])
  const rank = (l: T) => {
    const p = pricePer100g(l)
    if (!p) return 2
    return p.currency === main ? 0 : 1
  }
  return links
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ra = rank(a.l)
      const rb = rank(b.l)
      if (ra !== rb) return ra - rb
      const pa = pricePer100g(a.l)
      const pb = pricePer100g(b.l)
      if (pa && pb && pa.cents !== pb.cents) return pa.cents - pb.cents
      if (pa && pb && pa.currency !== pb.currency) return pa.currency.localeCompare(pb.currency)
      return a.i - b.i
    })
    .map((x) => x.l)
}

/**
 * Id of the cheapest link per 100 g (within the dominant currency), or null when
 * no link has a price or when the choice would be meaningless (only one priced
 * link is still cheapest; ties return the earliest in the given order).
 */
export function cheapestLinkId(links: readonly PricedLink[]): number | null {
  const first = sortLinksByPrice(links)[0]
  return first && pricePer100g(first) ? first.id : null
}

/** True when more than one link has a comparable price (so a "lowest" marker is meaningful). */
export function hasComparablePrices(links: readonly PricedLink[]): boolean {
  const main = dominantCurrency([...links])
  return links.filter((l) => pricePer100g(l)?.currency === main).length > 1
}
