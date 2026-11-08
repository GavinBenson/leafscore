import Image from 'next/image'
import Link from 'next/link'
import type { Review } from '@/db/schema'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { ReviewActions } from '@/components/ReviewActions'
import { ReportButton } from '@/components/ReportButton'
import { HelpfulButton } from '@/components/HelpfulButton'
import { SubScores } from '@/components/SubScores'
import { formatTemperature, type TemperatureUnit } from '@/lib/units'

// Fixed locale and zone so server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

type ReviewCardProps = {
  review: Review & {
    user?: { id: number; name: string; avatarUrl: string | null; profilePublic: boolean | null }
  }
  // In a journal the author is always the reader, so headline the tea instead.
  tea?: { id: number; name: string }
  canManage?: boolean
  // Where deleting this review should land (same-site path); default is the tea page.
  returnTo?: string
  tags?: string[]
  // Offer "Report" on someone else's review. returnTo is where sign-in sends them back.
  report?: { signedIn: boolean; returnTo: string }
  // Helpful vote (PBI 49); only shown on someone else's review.
  helpful?: { count: number; voted: boolean; signedIn: boolean; returnTo: string }
  // Display unit for the brew temperature (stored values are Celsius). Default Celsius.
  temperatureUnit?: TemperatureUnit
}

export function ReviewCard({ review, tea, canManage, returnTo, tags, report, helpful, temperatureUnit = 'c' }: ReviewCardProps) {
  const dateStr = review.createdAt
    ? dateFormat.format(new Date(review.createdAt))
    : ''

  return (
    <div className="card">
      {review.hidden && (
        <p className="form-error" role="note">
          Hidden by moderators. Only you can see this review, and it does not count toward the tea&apos;s score.
        </p>
      )}

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
          ) : review.user?.profilePublic ? (
            <Link
              href={`/u/${review.user.id}`}
              style={{ fontWeight: 600, fontSize: 15, color: 'inherit' }}
            >
              {review.user.name}
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
      {(review.brewMethod || review.brewTemp != null || review.steepTime != null) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          {review.brewMethod && (
            <span className="tag">{review.brewMethod.replace(/_/g, ' ')}</span>
          )}
          {review.brewTemp != null && <span className="tag">{formatTemperature(review.brewTemp, temperatureUnit)}</span>}
          {review.steepTime != null && (
            <span className="tag">{review.steepTime}s steep</span>
          )}
        </div>
      )}

      <SubScores review={review} />

      {/* Flavor tags */}
      {tags && tags.length > 0 && (
        <ul
          aria-label="Flavor tags"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px', padding: 0, listStyle: 'none' }}
        >
          {tags.map((name) => (
            <li key={name} className="tag">
              {name}
            </li>
          ))}
        </ul>
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

      {!canManage && helpful && (<div style={{ marginTop: 8 }}><HelpfulButton reviewId={review.id} count={helpful.count} helpful={helpful.voted} signedIn={helpful.signedIn} returnTo={helpful.returnTo} /></div>)}
      {canManage && <ReviewActions reviewId={review.id} teaId={review.teaId} returnTo={returnTo} />}
      {!canManage && report && (
        <div className="review-actions">
          <ReportButton
            reviewId={review.id}
            signedInAs={report.signedIn}
            returnTo={report.returnTo}
          />
        </div>
      )}
    </div>
  )
}
