import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { getSession } from '@/lib/data/brewSessions'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { getUserById } from '@/lib/data/users'
import { formatClock } from '@/lib/brewTimer'
import { parseId } from '@/lib/ids'
import { getCurrentUser } from '@/lib/session'
import { formatTemperature, formatWeight } from '@/lib/units'
import { DeleteSessionButton } from '@/components/DeleteSessionButton'
import { SessionReviewLink } from '@/components/SessionReviewLink'

export const metadata = {
  title: 'Brew session',
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id)
  if (sessionId === null) notFound()
  const user = await getCurrentUser()
  if (!user) redirect(signInPath(`/sessions/${sessionId}`))

  // Owner only: someone else's session looks exactly like a missing one.
  const found = await getSession(db, sessionId, user.id)
  if (!found) notFound()
  const { session, tea, infusions } = found

  const [userRow, review] = await Promise.all([
    getUserById(db, user.id),
    findReviewByUserAndTea(db, user.id, tea.id),
  ])
  const tempUnit = userRow?.tempUnit ?? 'c'
  const weightUnit = userRow?.weightUnit ?? 'g'
  const linked = session.reviewId !== null && review?.id === session.reviewId

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={{ margin: '0 0 8px' }}>
        <Link href="/sessions">All sessions</Link>
      </p>
      <h1 className="section-title" style={{ marginBottom: 4 }}>
        <Link href={`/browse/${tea.id}`} style={{ color: 'inherit' }}>
          {tea.name}
        </Link>
      </h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        {session.method && <span className="tag">{session.method.replace(/_/g, ' ')}</span>}
        {session.tempC != null && <span className="tag">{formatTemperature(session.tempC, tempUnit)}</span>}
        {session.gramsUsed != null && <span className="tag">{formatWeight(session.gramsUsed, weightUnit)}</span>}
        <span className="tag">
          {infusions.length} {infusions.length === 1 ? 'infusion' : 'infusions'}
        </span>
      </div>
      {session.notes && <p style={{ color: 'var(--color-ink-2)' }}>{session.notes}</p>}

      <ol style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'grid', gap: 8 }}>
        {infusions.map((inf) => (
          <li key={inf.id} className="card">
            <strong>Step {inf.step}</strong>
            <span className="subtle" style={{ marginLeft: 8 }}>
              {formatClock(inf.seconds)} ({inf.seconds} s)
            </span>
            {inf.rating !== null && (
              <span className="tag" style={{ marginLeft: 8 }}>
                Rating {inf.rating}
              </span>
            )}
            {inf.note && <p style={{ margin: '6px 0 0', color: 'var(--color-ink-2)', fontSize: 14 }}>{inf.note}</p>}
          </li>
        ))}
      </ol>

      <p className="subtle">This session does not change the tea&apos;s LeafScore.</p>
      {review && (
        <div style={{ marginBottom: 12 }}>
          {linked && <p style={{ margin: '0 0 8px' }}>Linked to your review of this tea.</p>}
          <SessionReviewLink sessionId={session.id} reviewId={review.id} linked={linked} />
        </div>
      )}
      <DeleteSessionButton sessionId={session.id} />
    </div>
  )
}
