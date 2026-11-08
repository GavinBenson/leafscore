import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { countSessionsForUser } from '@/lib/data/brewSessions'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { getTea } from '@/lib/data/teas'
import { getUserById } from '@/lib/data/users'
import { parseId } from '@/lib/ids'
import { FREE_SESSION_LIMIT, canSaveSession } from '@/lib/premium'
import { getCurrentUser } from '@/lib/session'
import { SessionForm } from '@/components/SessionForm'

export const metadata = {
  title: 'New brew session',
}

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ tea?: string }>
}) {
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(signInPath(params.tea ? `/sessions/new?tea=${encodeURIComponent(params.tea)}` : '/sessions/new'))

  let tea: { id: number; name: string } | null = null
  const teaId = parseId(params.tea)
  if (teaId !== null) {
    const result = await getTea(db, teaId)
    if (result) tea = { id: result.tea.id, name: result.tea.name }
  }

  const [userRow, count, review] = await Promise.all([
    getUserById(db, user.id),
    user.isPremium ? Promise.resolve(0) : countSessionsForUser(db, user.id),
    tea ? findReviewByUserAndTea(db, user.id, tea.id) : Promise.resolve(null),
  ])
  const atLimit = !canSaveSession(user.isPremium, count)

  return (
    <div>
      <h1 className="section-title">New brew session</h1>
      {atLimit && (
        <p className="form-error" role="note">
          You have {FREE_SESSION_LIMIT} saved sessions, the free limit. You can still use the timer, but to save this
          session delete an old one or <Link href="/settings/billing">upgrade to Premium</Link>.
        </p>
      )}
      <div className="card" style={{ maxWidth: 600 }}>
        <SessionForm
          tea={tea}
          hasReview={Boolean(review)}
          tempUnit={userRow?.tempUnit ?? 'c'}
          weightUnit={userRow?.weightUnit ?? 'g'}
        />
      </div>
      <p style={{ marginTop: 16 }}>
        <Link href="/sessions">Your saved sessions</Link>
      </p>
    </div>
  )
}
