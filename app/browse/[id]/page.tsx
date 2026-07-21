import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { getTeaWithDetails } from '@/lib/data/teas'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { ReviewCard } from '@/components/ReviewCard'
import { TeaJsonLd } from '@/components/TeaJsonLd'

export default async function TeaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getTeaWithDetails(db, Number(id))

  if (!result) notFound()

  const { tea, brand, reviews, affiliateLinks } = result

  return (
    <>
      <TeaJsonLd tea={tea} brand={brand} reviews={reviews} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 4px',
            }}
          >
            {tea.name}
          </h1>
          {brand && (
            <p className="subtle" style={{ margin: '0 0 12px' }}>{brand.name}</p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="tag">{tea.type}</span>
            {tea.origin && <span className="tag">{tea.origin}</span>}
            {tea.caffeineLevel && <span className="tag">Caffeine: {tea.caffeineLevel}</span>}
            {tea.leafStyle && <span className="tag">{tea.leafStyle}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0, transform: 'scale(1.4)', transformOrigin: 'top right' }}>
          <LeafScoreBadge score={tea.leafScore} />
        </div>
      </div>

      {/* Affiliate links */}
      {affiliateLinks.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 className="section-title" style={{ fontSize: 18 }}>Where to Buy</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {affiliateLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card"
                style={{
                  textDecoration: 'none',
                  color: 'var(--color-primary)',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '10px 16px',
                }}
              >
                {link.provider}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Reviews ({reviews.length})
          </h2>
          <Link href={`/log?tea=${tea.id}`} className="btn btn-primary btn-sm">
            Write a Review
          </Link>
        </div>

        {reviews.length === 0 ? (
          <div className="empty-state">
            <p>No reviews yet. Be the first!</p>
          </div>
        ) : (
          <div className="review-list">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
