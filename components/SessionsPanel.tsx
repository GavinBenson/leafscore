import Link from 'next/link'
import { db } from '@/db/client'
import { countSessionsForUser, listSessionsForUser } from '@/lib/data/brewSessions'
import { getUserById } from '@/lib/data/users'
import { FREE_SESSION_LIMIT } from '@/lib/premium'
import { Pager } from '@/components/Pager'
import { SessionsList } from '@/components/SessionsList'

const PER_PAGE = 10

// Per-user and uncached. Shared by /sessions and the Journal "Sessions" tab.
export async function SessionsPanel({
  userId,
  isPremium,
  page,
  hrefFor,
}: {
  userId: number
  isPremium: boolean
  page: number
  hrefFor: (page: number) => string
}) {
  const [fetched, total, userRow] = await Promise.all([
    listSessionsForUser(db, userId, { limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE }),
    countSessionsForUser(db, userId),
    getUserById(db, userId),
  ])
  const hasNext = fetched.length > PER_PAGE
  const rows = fetched.slice(0, PER_PAGE)

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>{page > 1 ? 'No sessions on this page.' : 'No brew sessions yet.'}</p>
        <Link href="/sessions/new" className="btn btn-primary">
          Start a session
        </Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {!isPremium ? (
          <p className="subtle" style={{ margin: 0 }}>
            {total} of {FREE_SESSION_LIMIT} saved sessions used
          </p>
        ) : (
          <span />
        )}
        <Link href="/sessions/new" className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
          Start a session
        </Link>
      </div>
      <SessionsList rows={rows} tempUnit={userRow?.tempUnit ?? 'c'} weightUnit={userRow?.weightUnit ?? 'g'} />
      <Pager page={page} hasNext={hasNext} hrefFor={hrefFor} />
    </>
  )
}
