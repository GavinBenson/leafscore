import type { Tea, Brand } from '@/db/schema'

export function TeaJsonLd({
  tea,
  brand,
}: {
  tea: Tea
  brand?: Brand | null
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: tea.name,
    brand: brand ? { '@type': 'Brand', name: brand.name } : undefined,
    aggregateRating:
      tea.reviewCount && tea.reviewCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: ((tea.leafScore ?? 0) / 20).toFixed(1),
            bestRating: '5',
            worstRating: '1',
            ratingCount: tea.reviewCount,
          }
        : undefined,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
