import { HomeIntro } from '@/components/HomeIntro'
import { connection } from 'next/server'
import { getTopRatedTeasCached } from '@/lib/cache'
import Link from 'next/link'
import { TeaCard } from '@/components/TeaCard'

export const metadata = {
  title: { absolute: 'LeafScore · Discover and rate teas' },
  description: 'Track your tea journey, see what the community rates, and find your next favorite tea.',
  alternates: { canonical: '/' },
  openGraph: { url: '/', siteName: 'LeafScore', title: 'LeafScore · Discover and rate teas' },
}

export default async function Home() {
  // Explicitly dynamic (not baked at build); the data comes from the tagged
  // data cache in lib/cache.ts, invalidated when teas or reviews change.
  await connection()
  const topTeas = await getTopRatedTeasCached()

  return (
    <>
      <HomeIntro />

      {/* Top Rated */}
      <section>
        <h2 className="section-title">Top Rated</h2>
        {topTeas.length > 0 ? (
          <div className="tea-grid">
            {topTeas.map((tea) => (
              <TeaCard key={tea.id} tea={tea} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No teas have enough reviews to rank yet. Be the first: log a tea.</p>
            <Link href="/log" className="btn btn-primary">
              Log a tea
            </Link>
            <Link href="/browse" className="btn btn-outline">
              Browse teas
            </Link>
          </div>
        )}
      </section>
    </>
  )
}
