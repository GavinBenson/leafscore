import Link from 'next/link'
import { db } from '@/db/client'
import { getAdminStats } from '@/lib/data/adminStats'

export const metadata = {
  title: 'Admin Dashboard',
}

export default async function AdminPage() {
  const stats = await getAdminStats(db)

  const cards: { label: string; value: number; href?: string }[] = [
    { label: 'Total Users', value: stats.totalUsers },
    { label: 'Signups (7 days)', value: stats.signupsLast7Days },
    { label: 'Reviews (7 days)', value: stats.reviewsLast7Days },
    { label: 'Premium Users', value: stats.premiumUsers },
    { label: 'Total Teas', value: stats.totalTeas },
    { label: 'Total Reviews', value: stats.totalReviews },
    { label: 'Pending Requests', value: stats.pendingTeaRequests, href: '/admin/requests' },
    { label: 'Pending Reports', value: stats.pendingReports, href: '/admin/reports' },
  ]

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
        {cards.map((card) => {
          const body = (
            <>
              <div className="subtle" style={{ marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
                {card.value}
              </div>
            </>
          )
          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {body}
            </Link>
          ) : (
            <div key={card.label} className="card">
              {body}
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/teas" className="btn btn-primary">
          Manage Teas
        </Link>
        <Link href="/admin/requests" className="btn btn-ghost" style={{ border: '1px solid var(--color-line)' }}>
          Tea Requests
        </Link>
        <Link href="/admin/reports" className="btn btn-ghost" style={{ border: '1px solid var(--color-line)' }}>
          Reports
        </Link>
      </div>
    </>
  )
}
