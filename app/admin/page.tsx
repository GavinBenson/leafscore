import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import * as schema from '@/db/schema'

export const metadata = {
  title: 'Admin Dashboard',
}

export default async function AdminPage() {
  const [teaCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teas)

  const [reviewCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.reviews)

  const [pendingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teaRequests)
    .where(sql`${schema.teaRequests.status} = 'pending'`)

  return (
    <>
      <h1 className="section-title">Admin Dashboard</h1>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div className="card">
          <div className="subtle" style={{ marginBottom: 4 }}>
            Total Teas
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
            {Number(teaCount.count)}
          </div>
        </div>

        <div className="card">
          <div className="subtle" style={{ marginBottom: 4 }}>
            Total Reviews
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
            {Number(reviewCount.count)}
          </div>
        </div>

        <div className="card">
          <div className="subtle" style={{ marginBottom: 4 }}>
            Pending Requests
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
            {Number(pendingCount.count)}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/teas" className="btn btn-primary">
          Manage Teas
        </Link>
        <Link href="/admin/requests" className="btn btn-ghost" style={{ border: '1px solid var(--color-line)' }}>
          Tea Requests
        </Link>
      </div>
    </>
  )
}
