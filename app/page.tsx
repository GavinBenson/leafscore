import Link from 'next/link'
import { db } from '@/db/client'
import { listTeas } from '@/lib/data/teas'
import { TeaCard } from '@/components/TeaCard'

export default async function Home() {
  const topTeas = await listTeas(db, { sort: 'score', limit: 6 })

  return (
    <>
      {/* Hero */}
      <section style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 48 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 12,
          }}
        >
          Discover &amp; Rate Teas
        </h1>
        <p
          className="subtle"
          style={{ maxWidth: 460, margin: '0 auto 32px', fontSize: 16, lineHeight: 1.6 }}
        >
          Track your tea journey. See what the community rates. Find your next favorite.
        </p>
        <Link href="/browse" className="btn btn-primary">
          Browse Teas
        </Link>
      </section>

      {/* Top Rated */}
      {topTeas.length > 0 && (
        <section>
          <h2 className="section-title">Top Rated</h2>
          <div className="tea-grid">
            {topTeas.map((tea) => (
              <TeaCard key={tea.id} tea={tea} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
