import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { listFavorites } from '@/lib/data/favorites'
import { listReviewsForUser } from '@/lib/data/reviews'
import { getPublicProfile } from '@/lib/data/users'
import { getCurrentUser } from '@/lib/session'
import { ReviewCard } from '@/components/ReviewCard'
import { TeaCard } from '@/components/TeaCard'

type Props = { params: Promise<{ id: string }> }

function parseId(id: string) {
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const userId = parseId((await params).id)
  const profile = userId === null ? null : await getPublicProfile(db, userId)
  return { title: profile ? `${profile.name}'s teas` : 'Profile' }
}

export default async function ProfilePage({ params }: Props) {
  const userId = parseId((await params).id)
  if (userId === null) notFound()

  const viewer = await getCurrentUser()
  // A private profile looks exactly like one that doesn't exist.
  const profile = await getPublicProfile(db, userId, viewer?.id)
  if (!profile) notFound()

  const [reviews, favorites] = await Promise.all([
    listReviewsForUser(db, userId),
    listFavorites(db, userId),
  ])

  const isOwner = viewer?.id === profile.id

  return (
    <div>
      <h1 className="section-title" style={{ overflowWrap: 'anywhere' }}>{profile.name}</h1>

      {isOwner && !profile.profilePublic && (
        <p className="subtle" style={{ marginBottom: 16 }}>
          This profile is private, so only you can see this page.
        </p>
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
              <ReviewCard key={review.id} review={review} tea={tea} />
            ))}
          </div>
        )}
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
      </section>
    </div>
  )
}
