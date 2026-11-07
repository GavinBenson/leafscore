import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { getReviewStats } from '@/lib/data/stats'
import { getCurrentUser } from '@/lib/session'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { PremiumUpsell } from '@/components/PremiumUpsell'

export const metadata = {
  title: 'Brew Stats',
}

function StatRow({ label, count, score }: { label: string; count: number; score: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={{ textTransform: 'capitalize' }}>
        {label} <span className="subtle">({count})</span>
      </span>
      <LeafScoreBadge score={score} />
    </div>
  )
}

export default async function StatsPage() {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/journal/stats'))

  if (!user.isPremium) {
    return (
      <div>
        <h1 className="section-title">Brew Stats</h1>
        <PremiumUpsell title="Brew stats are part of Premium" />
      </div>
    )
  }

  const stats = await getReviewStats(db, user.id)

  if (stats.count === 0) {
    return (
      <div>
        <h1 className="section-title">Brew Stats</h1>
        <div className="empty-state">
          <p>Log a tea to start building your stats.</p>
          <Link href="/log" className="btn btn-primary">
            Log a tea
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="section-title">Brew Stats</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.count}</div>
            <div className="subtle">Reviews</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.avgScore}</div>
            <div className="subtle">Average score</div>
          </div>
          {stats.drinkAgainPercent !== null && (
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.drinkAgainPercent}%</div>
              <div className="subtle">Would drink again</div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>By tea type</div>
        {stats.byType.map((row) => (
          <StatRow key={row.type} label={row.type} count={row.count} score={row.avgScore} />
        ))}
      </div>

      {stats.byMethod.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>By brew method</div>
          {stats.byMethod.map((row) => (
            <StatRow key={row.method} label={row.method.replace('_', ' ')} count={row.count} score={row.avgScore} />
          ))}
        </div>
      )}

      {stats.topFlavors.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Top flavors</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {stats.topFlavors.map((flavor) => (
              <span key={flavor.name} className="tag">
                {flavor.name} ({flavor.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
