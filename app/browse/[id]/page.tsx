import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { getBrewGuideCached, getSimilarTeasCached, getTeaPageCached, getTeaSeoCached } from '@/lib/cache'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { Pager } from '@/components/Pager'
import { clampPage } from '@/lib/ids'
import { MIN_REVIEWS_FOR_SCORE, hasPublicScore } from '@/lib/scoring'
import { isFavorited } from '@/lib/data/favorites'
import { isInWishlist } from '@/lib/data/wishlist'
import { signInPath } from '@/lib/authRedirect'
import { getCurrentUser } from '@/lib/session'
import { TeaListButtons } from '@/components/TeaListButtons'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { ReviewCard } from '@/components/ReviewCard'
import { TeaJsonLd } from '@/components/TeaJsonLd'
import { ShareButton } from '@/components/ShareButton'
import { BrewGuide } from '@/components/BrewGuide'
import { SimilarTeas, SIMILAR_TEAS_ID } from '@/components/SimilarTeas'
import { WhereToBuy } from '@/components/WhereToBuy'
import { TeaPageLists } from '@/components/TeaPageLists'
import { BlindTastingNotice } from '@/components/BlindTastingNotice'
import { shouldHideCommunityData } from '@/lib/blindTasting'
import { getViewerPreferences } from '@/lib/viewerPreferences'
import { ReviewSortControl } from '@/components/ReviewSortControl'
import { viewerVotes } from '@/lib/data/helpful'
import { parseReviewSort, teaReviewsHref } from '@/lib/reviewSort'
import type { Metadata } from 'next'
import { parseId, teaDescription } from '@/lib/seo'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  try {
    const teaId = parseId((await params).id)
    const tea = teaId === null ? null : await getTeaSeoCached(teaId)
    if (!tea) return { title: 'Tea not found' }
    const title = `${tea.name} review & LeafScore`
    const description = teaDescription({
      name: tea.name,
      brand: tea.brandName,
      type: tea.type,
      origin: tea.origin,
      score: tea.leafScore,
      reviewCount: tea.reviewCount,
    })
    const url = `/browse/${tea.id}`
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: 'website', siteName: 'LeafScore', title, description, url },
      twitter: { card: 'summary_large_image', title, description },
    }
  } catch {
    return { title: 'Tea' }
  }
}

const REVIEWS_PER_PAGE = 10

export default async function TeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ rpage?: string; rsort?: string; reviewed?: string }>
}) {
  const teaIdParam = parseId((await params).id)
  if (teaIdParam === null) notFound()
  const sp = (await searchParams) ?? {}
  const reviewPage = clampPage(sp.rpage)
  const reviewSort = parseReviewSort(sp.rsort)
  const justReviewed = sp.reviewed === '1'
  const [result, user, brewGuide, similarTeas] = await Promise.all([
    // Anonymous, shared, tagged cache. Reads no cookies.
    getTeaPageCached(teaIdParam, reviewPage, REVIEWS_PER_PAGE, reviewSort),
    // Per-user part below is never cached (this call reads cookies).
    getCurrentUser(),
    // Anonymous aggregates over non-hidden reviews, tagged like the tea page.
    getBrewGuideCached(teaIdParam),
    getSimilarTeasCached(teaIdParam),
  ])

  if (!result) notFound()

  const { tea, brand, reviews, hasMoreReviews, affiliateLinks, reviewTags } = result
  const scored = hasPublicScore(tea.reviewCount)

  const [favorited, wishlisted, myReview] = user
    ? await Promise.all([
        isFavorited(db, user.id, tea.id),
        isInWishlist(db, user.id, tea.id),
        findReviewByUserAndTea(db, user.id, tea.id),
      ])
    : [false, false, null]
  // Blind tasting (PBI 43): decided per request, after the shared anonymous data
  // above was fetched. The viewer never enters a cache key.
  const prefs = await getViewerPreferences(db, user?.id ?? null)
  const hideCommunity = shouldHideCommunityData({
    blindMode: prefs.blindTasting,
    signedIn: Boolean(user),
    hasReviewed: myReview !== null,
  })
  const returnTo = teaReviewsHref(tea.id, reviewPage, reviewSort)
  // Which reviews the viewer found helpful: per request, never cached.
  const votedIds = user ? await viewerVotes(db, user.id, reviews.map((r) => r.id)) : new Set<number>()

  return (
    <>
      {/* The structured data carries the score, so a blind viewer does not get it. */}
      {!hideCommunity && <TeaJsonLd tea={tea} brand={brand} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <ShareButton title={tea.name} path={`/browse/${tea.id}`} />
      </div>

      {justReviewed && user && myReview && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Thanks — your review is in.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/log" className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
              Log another tea
            </Link>
            <Link
              href={similarTeas.length > 0 ? `#${SIMILAR_TEAS_ID}` : `/browse?type=${encodeURIComponent(tea.type)}`}
              className="btn btn-outline btn-sm"
              style={{ minHeight: 44 }}
            >
              Teas like this
            </Link>
          </div>
        </div>
      )}

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
            <p className="subtle" style={{ margin: '0 0 12px' }}>
              <Link href={`/brands/${brand.id}`}>{brand.name}</Link>
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="tag">{tea.type}</span>
            {tea.origin && <span className="tag">{tea.origin}</span>}
            {tea.caffeineLevel && <span className="tag">Caffeine: {tea.caffeineLevel}</span>}
            {tea.leafStyle && <span className="tag">{tea.leafStyle}</span>}
          </div>
        </div>
        {!hideCommunity && (
          <div style={{ flexShrink: 0 }}>
            <LeafScoreBadge score={scored ? tea.leafScore : null} size="lg" />
          </div>
        )}
      </div>

      {!scored && !hideCommunity && (
        <p className="subtle" style={{ marginBottom: 16 }}>
          Not enough reviews yet ({Math.min(tea.reviewCount ?? 0, MIN_REVIEWS_FOR_SCORE)} of{' '}
          {MIN_REVIEWS_FOR_SCORE})
        </p>
      )}

      {user ? (
        <TeaListButtons
          teaId={tea.id}
          initialFavorited={favorited}
          initialWishlisted={wishlisted}
        />
      ) : (
        <p className="subtle" style={{ marginBottom: 24 }}>
          <Link href={signInPath(`/browse/${tea.id}`)}>Sign in</Link> to save this tea to your
          favorites or wishlist.
        </p>
      )}

      {user && <TeaPageLists teaId={tea.id} userId={user.id} isPremium={user.isPremium} />}

      {user && (
        <p style={{ margin: '0 0 24px' }}>
          <Link href={`/sessions/new?tea=${tea.id}`} className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
            Start a session
          </Link>
        </p>
      )}

      {hideCommunity ? <BlindTastingNotice teaId={tea.id} /> : <BrewGuide guide={brewGuide} temperatureUnit={prefs.tempUnit} />}

      <WhereToBuy links={affiliateLinks} />

      {!hideCommunity && <SimilarTeas teas={similarTeas} />}

      {/* Reviews */}
      {!hideCommunity && (
      <section id="reviews">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Reviews ({tea.reviewCount ?? 0})
          </h2>
          {myReview ? (
            <p style={{ margin: 0 }}>
              You reviewed this tea (score {myReview.score}):{' '}
              <Link href={`/reviews/${myReview.id}/edit`}>Edit</Link>
            </p>
          ) : (
            <Link href={`/log?tea=${tea.id}`} className="btn btn-primary btn-sm">
              Write a Review
            </Link>
          )}
        </div>

        {reviews.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <ReviewSortControl teaId={tea.id} sort={reviewSort} />
          </div>
        )}
        {reviews.length === 0 ? (
          <div className="empty-state">
            <p>No reviews yet. Be the first!</p>
          </div>
        ) : (
          <div className="review-list">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                tags={reviewTags[review.id]}
                canManage={user?.id === review.userId}
                temperatureUnit={prefs.tempUnit}
                report={{ signedIn: Boolean(user), returnTo }}
                helpful={{ count: review.helpfulCount ?? 0, voted: votedIds.has(review.id), signedIn: Boolean(user), returnTo }}
              />
            ))}
          </div>
        )}
        <Pager
          page={reviewPage}
          hasNext={hasMoreReviews}
          hrefFor={(p) => teaReviewsHref(tea.id, p, reviewSort)}
        />
      </section>
      )}
    </>
  )
}
