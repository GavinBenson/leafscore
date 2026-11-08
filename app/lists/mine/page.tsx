import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { listListsForUser } from '@/lib/data/lists'
import { FREE_LIST_LIMIT, PREMIUM_LIST_LIMIT } from '@/lib/premium'
import { getCurrentUser } from '@/lib/session'

export const metadata = { title: 'My lists', robots: { index: false } }

export default async function MyListsPage() {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/lists/mine'))

  // Per-user and uncached.
  const rows = await listListsForUser(db, user.id)
  const limit = user.isPremium ? PREMIUM_LIST_LIMIT : FREE_LIST_LIMIT
  const atLimit = rows.length >= limit

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
        <h1 className="section-title" style={{ margin: 0 }}>
          My lists
        </h1>
        {!atLimit && (
          <Link href="/lists/new" className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
            New list
          </Link>
        )}
      </div>
      <p className="subtle">
        {rows.length} of {limit} lists used.{' '}
        {atLimit && !user.isPremium && <Link href="/settings/billing">Upgrade to Premium for more.</Link>}
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>You have no lists yet.</p>
          <Link href="/lists/new" className="btn btn-primary">
            Create your first list
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {rows.map(({ list, teaCount }) => (
            <li key={list.id} className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px' }}>
                <Link href={`/lists/${list.id}`} style={{ fontWeight: 600 }}>
                  {list.title}
                </Link>
                <div className="subtle">
                  {teaCount} {teaCount === 1 ? 'tea' : 'teas'} &middot; {list.isPublic ? 'Public' : 'Private'}
                  {list.hidden ? ' · hidden by moderators' : ''}
                </div>
              </div>
              <Link href={`/lists/${list.id}/edit`} className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
