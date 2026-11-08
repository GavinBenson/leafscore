import Link from 'next/link'
import { connection } from 'next/server'
import { listBrandsCached } from '@/lib/cache'

export const metadata = {
  title: 'Tea brands',
  description: 'Browse tea brands and see how the community rates their teas.',
  alternates: { canonical: '/brands' },
  openGraph: { url: '/brands', siteName: 'LeafScore', title: 'Tea brands' },
}

export default async function BrandsPage() {
  // Explicitly dynamic (not baked at build); data is in the tagged data cache.
  await connection()
  const brands = await listBrandsCached()

  return (
    <>
      <h1 className="section-title">Brands</h1>

      {brands.length === 0 ? (
        <div className="empty-state">
          <p>No brands yet.</p>
        </div>
      ) : (
        <div className="tea-grid">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                  {brand.name}
                </div>
                {brand.country && (
                  <span className="subtle">{brand.country}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
