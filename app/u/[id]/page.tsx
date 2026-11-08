import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { listFavorites } from '@/lib/data/favorites'
import { listReviewsForUser, listTagNamesForReviews } from '@/lib/data/reviews'
import { getPublicProfile } from '@/lib/data/users'
import { getCurrentUser } from '@/lib/session'
import { ReviewCard } from '@/components/ReviewCard'
import { getViewerPreferences } from '@/lib/viewerPreferences'
import { TeaCard } from '@/components/TeaCard'
import { Pager, parsePage } from '@/components/Pager'
import { BadgeList } from '@/components/TasteProfile'
import { getTasteProfile } from '@/lib/data/tasteProfile'

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ rpage?: string; fpage?: string }>
}

const PER_PAGE = 10

function parseId(id: string) {
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const userId = parseId((await params).id)
  const profile = userId === null ? null : await getPublicProfile(db, userId)
  return { title: profile ? `${profile.name}'s teas` : 'Profile' }
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const userId = parseId((await params).id)
  if (userId === null) notFound()

  const sp = (await searchParams) ?? {}
  const reviewPage = parsePage(sp.rpage)
  const favoritePage = parsePage(sp.fpage)

  const viewer = await getCurrentUser()
  // A private profile looks exactly like one that doesn't exist.
  const profile = await getPublicProfile(db, userId, viewer?.id)
  if (!profile) notFound()

  const [reviewRows, favoriteRows] = await Promise.all([
    listReviewsForUser(db, userId, { limit: PER_PAGE + 1, offset: (reviewPage - 1) * PER_PAGE }),
    listFavorites(db, userId, { limit: PER_PAGE + 1, offset: (favoritePage - 1) * PER_PAGE }),
  ])
  const hasMoreReviews = reviewRows.length > PER_PAGE
  const hasMoreFavorites = favoriteRows.length > PER_PAGE
  const reviews = reviewRows.slice(0, PER_PAGE)
  const favorites = favoriteRows.slice(0, PER_PAGE)
  const tags = await listTagNamesForReviews(db, reviews.map((r) => r.review.id))
  // The viewer's own unit (signed-out visitors get Celsius).
  const { tempUnit } = await getViewerPreferences(db, viewer?.id ?? null)

  const base = `/u/${userId}`
  const reviewsHref = (p: number) =>
    `${base}?${new URLSearchParams({ ...(p > 1 ? { rpage: String(p) } : {}), ...(favoritePage > 1 ? { fpage: String(favoritePage) } : {}) })}`
  const favoritesHref = (p: number) =>
    `${base}?${new URLSearchParams({ ...(reviewPage > 1 ? { rpage: String(reviewPage) } : {}), ...(p > 1 ? { fpage: String(p) } : {}) })}`

  const isOwner = viewer?.id === profile.id
  // Badges are shown only when the profile is public (an owner viewing a private
  // profile is not showing it to anyone else).
  const badges = profile.profilePublic ? (await getTasteProfile(db, userId)).badges : null

  return (
    <div>
      <h1 className="section-title" style={{ overflowWrap: 'anywhere' }}>{profile.name}</h1>

      {isOwner && !profile.profilePublic && (
        <p className="subtle" style={{ marginBottom: 16 }}>
          This profile is private, so only you can see this page.
        </p>
      )}

      {badges && badges.earned.length > 0 && (
        <section style={{ marginBottom: 32 }} aria-labelledby="profile-badges">
          <h2 id="profile-badges" className="section-title" style={{ fontSize: 18 }}>
            Badges
          </h2>
          <BadgeList badges={badges} showNextUp={false} />
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title" style={{ fontSize: 18 }}>
          Reviews
        </h2>
        {reviews.length === 0 ? (
          <div className="empty-state">
            <p>No reviews yet.</p>
          </div>
        ) : (
          <div className="review-list">
            {reviews.map(({ review, tea }) => (
              <ReviewCard key={review.id} review={review} tea={tea} tags={tags[review.id]} temperatureUnit={tempUnit} />
            ))}
          </div>
        )}
        <Pager page={reviewPage} hasNext={hasMoreReviews} hrefFor={reviewsHref} />
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: 18 }}>
          Favorites
        </h2>
        {favorites.length === 0 ? (
          <div className="empty-state">
            <p>No favorites yet.</p>
          </div>
        ) : (
          <div className="tea-grid">
            {favorites.map(({ tea }) => (
              <TeaCard key={tea.id} tea={tea} />
            ))}
          </div>
        )}
        <Pager page={favoritePage} hasNext={hasMoreFavorites} hrefFor={favoritesHref} />
      </section>
    </div>
  )
}
