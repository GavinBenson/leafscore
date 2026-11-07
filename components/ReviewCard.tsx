import Image from 'next/image'
import Link from 'next/link'
import type { Review } from '@/db/schema'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { ReviewActions } from '@/components/ReviewActions'

type ReviewCardProps = {
  review: Review & { user?: { name: string; avatarUrl: string | null } }
  // In a journal the author is always the reader, so headline the tea instead.
  tea?: { id: number; name: string }
  canManage?: boolean
}

export function ReviewCard({ review, tea, canManage }: ReviewCardProps) {
  const dateStr = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString()
    : ''

  return (
    <div className="card">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          {tea ? (
            <Link
              href={`/browse/${tea.id}`}
              style={{ fontWeight: 600, fontSize: 15, color: 'inherit' }}
            >
              {tea.name}
            </Link>
          ) : (
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {review.user?.name ?? 'Anonymous'}
            </span>
          )}
          {dateStr && (
            <span className="subtle" style={{ marginLeft: 8 }}>
              {dateStr}
            </span>
          )}
        </div>
        <LeafScoreBadge score={review.score} />
      </div>

      {/* Brew details */}
      {(review.brewMethod || review.brewTemp || review.steepTime) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          {review.brewMethod && (
            <span className="tag">{review.brewMethod.replace('_', ' ')}</span>
          )}
          {review.brewTemp && <span className="tag">{review.brewTemp}&deg;C</span>}
          {review.steepTime && (
            <span className="tag">{review.steepTime}s steep</span>
          )}
        </div>
      )}

      {/* Notes */}
      {review.notes && (
        <p style={{ margin: '0 0 8px', color: 'var(--color-ink-2)', fontSize: 14 }}>
          {review.notes}
        </p>
      )}

      {/* Photo */}
      {review.photoUrl && (
        <Image
          src={review.photoUrl}
          alt={tea ? `Photo of ${tea.name}` : `Photo from ${review.user?.name ?? 'a reviewer'}'s tasting`}
          width={640}
          height={480}
          sizes="(max-width: 640px) 100vw, 600px"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: 360,
            objectFit: 'cover',
            borderRadius: 'var(--radius-md)',
            marginBottom: 8,
          }}
        />
      )}

      {/* Would drink again */}
      {review.wouldDrinkAgain !== null && review.wouldDrinkAgain !== undefined && (
        <div className="subtle" style={{ fontSize: 13 }}>
          {review.wouldDrinkAgain ? 'Would drink again' : 'Would not drink again'}
        </div>
      )}

      {canManage && <ReviewActions reviewId={review.id} teaId={review.teaId} />}
    </div>
  )
}
