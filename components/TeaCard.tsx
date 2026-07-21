import Link from 'next/link'
import type { Tea, Brand } from '@/db/schema'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'

export function TeaCard({ tea }: { tea: Tea & { brand?: Brand | null } }) {
  return (
    <Link href={`/browse/${tea.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <LeafScoreBadge score={tea.leafScore} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{tea.name}</div>
        {tea.brand && (
          <div className="subtle" style={{ marginBottom: 8 }}>{tea.brand.name}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tag">{tea.type}</span>
          {tea.origin && <span className="tag">{tea.origin}</span>}
        </div>
      </div>
    </Link>
  )
}
