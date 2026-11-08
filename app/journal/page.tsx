import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { db } from '@/db/client'
import { listReviewsForUser, listTagNamesForReviews } from '@/lib/data/reviews'
import { listFavorites } from '@/lib/data/favorites'
import { countWishlist, listWishlist } from '@/lib/data/wishlist'
import { FREE_WISHLIST_LIMIT } from '@/lib/premium'
import { ReviewCard } from '@/components/ReviewCard'
import { getViewerPreferences } from '@/lib/viewerPreferences'
import { TeaCard } from '@/components/TeaCard'
import { JournalTabs } from '@/components/JournalTabs'
import { TasteProfile } from '@/components/TasteProfile'
import { SessionsPanel } from '@/components/SessionsPanel'
import { getTasteProfile } from '@/lib/data/tasteProfile'
import { ListRemoveButton } from '@/components/ListRemoveButton'
import { Pager, parsePage } from '@/components/Pager'
import { resolveJournalTab } from '@/lib/journalTabs'
import type { Tea, Brand } from '@/db/schema'

export const metadata = {
  title: 'Journal',
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/journal'))

  const params = await searchParams
  const activeTab = resolveJournalTab(params.tab)
  const page = parsePage(params.page)

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
          <Link href="/cellar" className="btn btn-ghost btn-sm">
            Cellar
            {!user.isPremium && <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 11 }}>Premium</span>}
          </Link>
          <Link href="/lists/mine" className="btn btn-ghost btn-sm">
            My lists
          </Link>
          <Link href="/requests" className="btn btn-ghost btn-sm">
            My requests
          </Link>
          <Link href="/journal/stats" className="btn btn-ghost btn-sm">
            Brew stats
            {!user.isPremium && <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 11 }}>Premium</span>}
          </Link>
          {/* Free accounts are sent to the plans page by the route. */}
          <a href="/journal/export" className="btn btn-ghost btn-sm">
            Export CSV
            {!user.isPremium && <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 11 }}>Premium</span>}
          </a>
        </div>
      </div>
      <Suspense>
        <JournalTabs activeTab={activeTab} />
      </Suspense>

      {activeTab === 'reviews' && <ReviewsTab userId={user.id} page={page} />}
      {activeTab === 'favorites' && <FavoritesTab userId={user.id} page={page} />}
      {activeTab === 'wishlist' && (
        <WishlistTab userId={user.id} page={page} isPremium={user.isPremium} />
      )}
      {activeTab === 'taste' && <TasteTab userId={user.id} />}
      {activeTab === 'sessions' && (
        <SessionsPanel userId={user.id} isPremium={user.isPremium} page={page} hrefFor={tabHref('sessions')} />
      )}
    </div>
  )
}

const PER_PAGE = 10

function tabHref(tab: string) {
  return (p: number) => {
    const params = new URLSearchParams()
    if (tab !== 'reviews') params.set('tab', tab)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/journal${qs ? `?${qs}` : ''}`
  }
}

async function ReviewsTab({ userId, page }: { userId: number; page: number }) {
  const fetched = await listReviewsForUser(db, userId, {
    limit: PER_PAGE + 1,
    offset: (page - 1) * PER_PAGE,
    includeHidden: true,
  })
  const hasNext = fetched.length > PER_PAGE
  const rows = fetched.slice(0, PER_PAGE)
  const tags = await listTagNamesForReviews(db, rows.map((r) => r.review.id))
  // Per-user, read per request: the temperature unit applies to every card.
  const { tempUnit } = await getViewerPreferences(db, userId)

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
    <>
      <div className="review-list">
        {rows.map(({ review, tea }) => (
          <ReviewCard key={review.id} review={review} tea={tea} tags={tags[review.id]} canManage returnTo="/journal" temperatureUnit={tempUnit} />
        ))}
      </div>
      <Pager page={page} hasNext={hasNext} hrefFor={tabHref('reviews')} />
    </>
  )
}

async function TasteTab({ userId }: { userId: number }) {
  // Per-user and uncached.
  const data = await getTasteProfile(db, userId)
  return <TasteProfile data={data} />
}

function SavedTea({
  tea,
  list,
}: {
  tea: Tea & { brand: Brand | null }
  list: 'favorites' | 'wishlist'
}) {
  return (
    <div>
      <TeaCard tea={tea} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <Link href={`/log?tea=${tea.id}`} className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
          Log this tea
        </Link>
        <ListRemoveButton teaId={tea.id} list={list} />
      </div>
    </div>
  )
}

async function FavoritesTab({ userId, page }: { userId: number; page: number }) {
  const fetched = await listFavorites(db, userId, {
    limit: PER_PAGE + 1,
    offset: (page - 1) * PER_PAGE,
  })
  const hasNext = fetched.length > PER_PAGE
  const rows = fetched.slice(0, PER_PAGE)

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
    <>
      <div className="tea-grid">
        {rows.map(({ tea }) => (
          <SavedTea key={tea.id} tea={tea} list="favorites" />
        ))}
      </div>
      <Pager page={page} hasNext={hasNext} hrefFor={tabHref('favorites')} />
    </>
  )
}

async function WishlistTab({
  userId,
  page,
  isPremium,
}: {
  userId: number
  page: number
  isPremium: boolean
}) {
  const [fetched, used] = await Promise.all([
    listWishlist(db, userId, { limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE }),
    countWishlist(db, userId),
  ])
  const hasNext = fetched.length > PER_PAGE
  const rows = fetched.slice(0, PER_PAGE)

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
    <>
      {!isPremium && (
        <p className="subtle" style={{ marginBottom: 12 }}>
          {used} of {FREE_WISHLIST_LIMIT} used
        </p>
      )}
      <div className="tea-grid">
        {rows.map(({ tea }) => (
          <SavedTea key={tea.id} tea={tea} list="wishlist" />
        ))}
      </div>
      <Pager page={page} hasNext={hasNext} hrefFor={tabHref('wishlist')} />
    </>
  )
}
