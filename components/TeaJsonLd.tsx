import type { Tea, Brand } from '@/db/schema'
import { safeJsonLd, ratingFromScore } from '@/lib/seo'
import { siteUrl } from '@/lib/siteUrl'

export function TeaJsonLd({
  tea,
  brand,
}: {
  tea: Tea
  brand?: Brand | null
}) {
  const rating = ratingFromScore(tea.leafScore)
  const reviewCount = tea.reviewCount ?? 0
  const description = `${tea.name}${brand ? ` by ${brand.name}` : ''}, a ${tea.type.toLowerCase()} tea${tea.origin ? ` from ${tea.origin}` : ''}.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: tea.name,
    description,
    url: `${siteUrl()}/browse/${tea.id}`,
    image: tea.imageUrl ?? undefined,
    brand: brand ? { '@type': 'Brand', name: brand.name } : undefined,
    aggregateRating:
      reviewCount >= 1 && rating !== null
        ? {
            '@type': 'AggregateRating',
            ratingValue: rating.toFixed(1),
            bestRating: '5',
            worstRating: '1',
            ratingCount: reviewCount,
            reviewCount,
          }
        : undefined,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
    />
  )
}
