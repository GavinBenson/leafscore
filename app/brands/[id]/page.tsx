import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { connection } from 'next/server'
import { getBrandWithTeasCached } from '@/lib/cache'
import { TeaCard } from '@/components/TeaCard'
import type { Metadata } from 'next'
import { getBrandSeo } from '@/lib/data/seo'
import { parseId } from '@/lib/ids'
import { safeHttpUrl } from '@/lib/safeUrl'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  try {
    const brandId = parseId((await params).id)
    const brand = brandId === null ? null : await getBrandSeo(db, brandId)
    if (!brand) return { title: 'Brand not found' }
    const title = `${brand.name} teas, ratings & reviews`
    const description = `Browse teas from ${brand.name}${brand.country ? ` (${brand.country})` : ''} with community LeafScore ratings.`
    const url = `/brands/${brand.id}`
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: 'website', siteName: 'LeafScore', title, description, url },
      twitter: { card: 'summary_large_image', title, description },
    }
  } catch {
    return { title: 'Brand' }
  }
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const brandId = parseId((await params).id)
  if (brandId === null) notFound()
  await connection()
  const result = await getBrandWithTeasCached(brandId)

  if (!result) notFound()

  const { brand, teas } = result

  return (
    <>
      {/* Brand header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 4px',
          }}
        >
          {brand.name}
        </h1>
        {brand.country && (
          <p className="subtle" style={{ margin: '0 0 8px' }}>{brand.country}</p>
        )}
        {safeHttpUrl(brand.website) && (
          <a
            href={safeHttpUrl(brand.website) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', fontSize: 14 }}
          >
            {brand.website}
          </a>
        )}
      </div>

      {/* Teas by this brand */}
      <h2 className="section-title">Teas</h2>
      {teas.length === 0 ? (
        <div className="empty-state">
          <p>No teas listed for this brand yet.</p>
        </div>
      ) : (
        <div className="tea-grid">
          {teas.map((tea) => (
            <TeaCard key={tea.id} tea={tea} />
          ))}
        </div>
      )}
    </>
  )
}
