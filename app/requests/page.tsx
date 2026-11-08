import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { listRequestsForUser } from '@/lib/data/teaRequests'

export const metadata = {
  title: 'My tea requests',
}

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Declined' } as const

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/requests'))

  const sent = (await searchParams).sent === '1'
  const requests = await listRequestsForUser(db, user.id)

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
        <h1 className="section-title" style={{ margin: 0 }}>My tea requests</h1>
        <Link href="/requests/new" className="btn btn-primary btn-sm">
          Request a tea
        </Link>
      </div>

      {sent && (
        <p className="card" role="status">
          Thanks, your request is in. We&apos;ll review it soon.
        </p>
      )}

      {requests.length === 0 ? (
        <div className="empty-state">
          <p>You haven&apos;t requested any teas.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((req) => (
            <li key={req.id} className="card">
              <div style={{ fontWeight: 600 }}>{req.name}</div>
              <div className="subtle">
                {[req.brand, req.type].filter(Boolean).join(' · ')}
                {(req.brand || req.type) && ' · '}
                <span className="tag">{STATUS_LABEL[req.status]}</span>
              </div>
              {req.status === 'approved' && req.createdTeaId && (
                <p style={{ margin: '8px 0 0' }}>
                  <Link href={`/browse/${req.createdTeaId}`}>View the tea</Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
