import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
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
  if (!user) redirect(signInPath('/journal'))

  const params = await searchParams
  const activeTab = params.tab ?? 'reviews'

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 className="section-title" style={{ margin: 0 }}>My Journal</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/journal/stats" className="btn btn-ghost btn-sm">
            Brew stats
          </Link>
          {/* Free accounts are sent to the plans page by the route. */}
          <a href="/journal/export" className="btn btn-ghost btn-sm">
            Export CSV
          </a>
        </div>
      </div>
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
        <Link href="/log" className="btn btn-primary">
          Log your first tea
        </Link>
      </div>
    )
  }

  return (
    <div className="review-list">
      {rows.map(({ review, tea }) => (
        <ReviewCard key={review.id} review={review} tea={tea} canManage />
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
        <Link href="/browse" className="btn btn-primary">
          Browse teas
        </Link>
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
        <Link href="/browse" className="btn btn-primary">
          Browse teas
        </Link>
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
