import type { AffiliateLink } from '@/db/schema'
import { AFFILIATE_DISCLOSURE } from '@/lib/affiliate'
import { safeHttpUrl } from '@/lib/safeUrl'
import {
  cheapestLinkId,
  formatPrice,
  formatPricePer100g,
  hasComparablePrices,
  sortLinksByPrice,
} from '@/lib/priceFormat'

/** Affiliate links sorted by price per 100 g, cheapest flagged (PBI 46). Nothing when there are no usable links. */
export function WhereToBuy({ links }: { links: Pick<AffiliateLink, 'id' | 'provider' | 'url' | 'priceCents' | 'currency' | 'pricePer100gCents'>[] }) {
  const usable = links.filter((l) => safeHttpUrl(l.url))
  if (usable.length === 0) return null

  const sorted = sortLinksByPrice(usable)
  const best = hasComparablePrices(sorted) ? cheapestLinkId(sorted) : null
  const anyPrice = sorted.some((l) => l.priceCents != null || l.pricePer100gCents != null)

  return (
    <section aria-labelledby="where-to-buy-heading" style={{ marginBottom: 32 }}>
      <h2 id="where-to-buy-heading" className="section-title" style={{ fontSize: 18 }}>
        Where to Buy
      </h2>
      <ul className="buy-list">
        {sorted.map((link) => {
          const per100 = formatPricePer100g(link)
          const isBest = link.id === best
          return (
            <li key={link.id}>
              <a
                href={`/api/out/${link.id}`}
                target="_blank"
                rel="sponsored nofollow noopener"
                className={`card card-link buy-link${isBest ? ' buy-link-best' : ''}`}
              >
                <span>{link.provider}</span>
                {link.priceCents != null && (
                  <span className="subtle" style={{ fontWeight: 400 }}>
                    {formatPrice(link.priceCents, link.currency)}
                    {per100 && ` (${per100})`}
                  </span>
                )}
                {link.priceCents == null && per100 && (
                  <span className="subtle" style={{ fontWeight: 400 }}>
                    {per100}
                  </span>
                )}
                {isBest && <span className="buy-flag">Lowest price per 100 g</span>}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="subtle" style={{ fontSize: 13, margin: '8px 0 0' }}>
        {AFFILIATE_DISCLOSURE}
        {anyPrice && ' Prices may be out of date.'}
      </p>
    </section>
  )
}
