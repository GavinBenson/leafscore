import { db } from '@/db/client'
import { listPendingRequests } from '@/lib/data/teaRequests'
import { handleTeaRequest } from '@/actions/teaRequests'
import { getUserById } from '@/lib/data/users'

export const metadata = {
  title: 'Tea Requests',
}

export default async function AdminRequestsPage() {
  const requests = await listPendingRequests(db)

  // Fetch user names for each request
  const requestsWithUsers = await Promise.all(
    requests.map(async (req) => {
      const user = await getUserById(db, req.userId)
      return { ...req, userName: user?.name ?? 'Unknown' }
    }),
  )

  return (
    <>
      <h1 className="section-title">Tea Requests</h1>

      {requestsWithUsers.length === 0 ? (
        <div className="empty-state">
          <p>No pending requests.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requestsWithUsers.map((req) => (
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
                  Requested by {req.userName}
                  {req.createdAt && (
                    <> &middot; {new Date(req.createdAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <form
                  action={async () => {
                    'use server'
                    await handleTeaRequest(req.id, 'approved')
                  }}
                >
                  <button type="submit" className="btn btn-primary btn-sm">
                    Approve
                  </button>
                </form>
                <form
                  action={async () => {
                    'use server'
                    await handleTeaRequest(req.id, 'rejected')
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    style={{ border: '1px solid var(--color-line)' }}
                  >
                    Reject
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
