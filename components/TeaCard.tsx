import Link from 'next/link'
import type { Tea, Brand } from '@/db/schema'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { CompareToggle } from '@/components/CompareToggle'
import { MIN_REVIEWS_FOR_SCORE, hasPublicScore } from '@/lib/scoring'

export function TeaCard({ tea }: { tea: Tea & { brand?: Brand | null } }) {
  const reviewCount = tea.reviewCount ?? 0
  const scored = hasPublicScore(reviewCount)

  return (
    <div className="card card-link" style={{ position: 'relative' }}>
      {/* Whole-card click target; the name link below is the one for keyboards and screen readers. */}
      <Link
        href={`/browse/${tea.id}`}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'absolute', inset: 0, borderRadius: 'inherit' }}
      />
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        {scored && <LeafScoreBadge score={tea.leafScore} size="sm" />}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2, paddingRight: 48 }}>
        <Link href={`/browse/${tea.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {tea.name}
        </Link>
      </div>
      {tea.brand && (
        <div style={{ marginBottom: 8 }}>
          <Link
            href={`/brands/${tea.brand.id}`}
            className="subtle"
            style={{ position: 'relative', textDecoration: 'underline' }}
          >
            {tea.brand.name}
          </Link>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="tag">{tea.type}</span>
        {tea.origin && <span className="tag">{tea.origin}</span>}
      </div>
      {!scored && (
        <div className="subtle" style={{ marginTop: 8, fontSize: 13 }}>
          Not enough reviews yet ({Math.min(reviewCount, MIN_REVIEWS_FOR_SCORE)} of{' '}
          {MIN_REVIEWS_FOR_SCORE})
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <CompareToggle teaId={tea.id} teaName={tea.name} />
      </div>
    </div>
  )
}
