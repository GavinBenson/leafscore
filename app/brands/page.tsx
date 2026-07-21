import Link from 'next/link'
import { db } from '@/db/client'
import { listBrands } from '@/lib/data/brands'

export default async function BrandsPage() {
  const brands = await listBrands(db)

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
