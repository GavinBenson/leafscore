import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { listReviewsForUser } from '@/lib/data/reviews'
import { listFavorites } from '@/lib/data/favorites'
import { listWishlist } from '@/lib/data/wishlist'
import { ReviewCard } from '@/components/ReviewCard'
import { TeaCard } from '@/components/TeaCard'
import { JournalTabs } from '@/components/JournalTabs'

export const metadata = {
  title: 'Journal',
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/api/auth/signin')

  const params = await searchParams
  const activeTab = params.tab ?? 'reviews'

  return (
    <div>
      <h1 className="section-title">My Journal</h1>
      <Suspense>
        <JournalTabs activeTab={activeTab} />
      </Suspense>

      {activeTab === 'reviews' && <ReviewsTab userId={user.id} />}
      {activeTab === 'favorites' && <FavoritesTab userId={user.id} />}
      {activeTab === 'wishlist' && <WishlistTab userId={user.id} />}
    </div>
  )
}

async function ReviewsTab({ userId }: { userId: number }) {
  const rows = await listReviewsForUser(db, userId)

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>No reviews yet.</p>
        <a href="/log" className="btn btn-primary">
          Log your first tea
        </a>
      </div>
    )
  }

  return (
    <div className="review-list">
      {rows.map(({ review, tea }) => (
        <ReviewCard key={review.id} review={review} showTea />
      ))}
    </div>
  )
}

async function FavoritesTab({ userId }: { userId: number }) {
  const rows = await listFavorites(db, userId)

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>No favorites yet.</p>
        <a href="/browse" className="btn btn-primary">
          Browse teas
        </a>
      </div>
    )
  }

  return (
    <div className="tea-grid">
      {rows.map(({ tea }) => (
        <TeaCard key={tea.id} tea={tea} />
      ))}
    </div>
  )
}

async function WishlistTab({ userId }: { userId: number }) {
  const rows = await listWishlist(db, userId)

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>Nothing on your wishlist yet.</p>
        <a href="/browse" className="btn btn-primary">
          Browse teas
        </a>
      </div>
    )
  }

  return (
    <div className="tea-grid">
      {rows.map(({ tea }) => (
        <TeaCard key={tea.id} tea={tea} />
      ))}
    </div>
  )
}
