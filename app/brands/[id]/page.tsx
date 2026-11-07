import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { getBrandWithTeas } from '@/lib/data/brands'
import { TeaCard } from '@/components/TeaCard'

export default async function BrandPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getBrandWithTeas(db, Number(id))

  if (!result) notFound()

  const { brand, teas } = result

  return (
    <>
      {/* Brand header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 4px',
          }}
        >
          {brand.name}
        </h1>
        {brand.country && (
          <p className="subtle" style={{ margin: '0 0 8px' }}>{brand.country}</p>
        )}
        {brand.website && (
          <a
            href={brand.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', fontSize: 14 }}
          >
            {brand.website}
          </a>
        )}
      </div>

      {/* Teas by this brand */}
      <h2 className="section-title">Teas</h2>
      {teas.length === 0 ? (
        <div className="empty-state">
          <p>No teas listed for this brand yet.</p>
        </div>
      ) : (
        <div className="tea-grid">
          {teas.map((tea) => (
            <TeaCard key={tea.id} tea={tea} />
          ))}
        </div>
      )}
    </>
  )
}
