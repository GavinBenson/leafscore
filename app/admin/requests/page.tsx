import Link from 'next/link'
import { db } from '@/db/client'
import { listPendingRequestsWithUser } from '@/lib/data/teaRequests'
import { declineTeaRequest } from '@/actions/teaRequests'

export const metadata = {
  title: 'Tea Requests',
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export default async function AdminRequestsPage() {
  const requests = await listPendingRequestsWithUser(db)

  return (
    <>
      <h1 className="section-title">Tea Requests</h1>

      {requests.length === 0 ? (
        <div className="empty-state">
          <p>No pending requests.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(({ request: req, user }) => (
            <div
              key={req.id}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{req.name}</div>
                <div className="subtle" style={{ marginTop: 2 }}>
                  {req.brand && <>{req.brand} &middot; </>}
                  {req.type && <>{req.type} &middot; </>}
                  Requested by {user.name} &middot; {dateFormat.format(new Date(req.createdAt))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  href={`/admin/teas/new?requestId=${req.id}`}
                  className="btn btn-primary btn-sm"
                >
                  Approve
                </Link>
                <form action={declineTeaRequest.bind(null, req.id)}>
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    style={{ border: '1px solid var(--color-line)' }}
                  >
                    Decline
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
