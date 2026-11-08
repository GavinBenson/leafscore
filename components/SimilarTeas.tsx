import Link from 'next/link'
import type { SimilarTea } from '@/lib/data/similarTeas'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'

/** Anchor id used by the post-review "Teas like this" link. */
export const SIMILAR_TEAS_ID = 'similar-teas'

export function SimilarTeas({ teas }: { teas: SimilarTea[] }) {
  if (teas.length === 0) return null
  return (
    <section id={SIMILAR_TEAS_ID} aria-labelledby="similar-teas-heading" style={{ marginBottom: 32 }}>
      <h2 id="similar-teas-heading" className="section-title" style={{ fontSize: 18 }}>
        Teas like this
      </h2>
      <ul className="similar-grid">
        {teas.map((t) => (
          <li key={t.id}>
            <Link href={`/browse/${t.id}`} className="card card-link similar-card">
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="similar-card-name">{t.name}</span>
                <LeafScoreBadge score={t.leafScore} size="sm" />
              </span>
              {t.brandName && <span className="subtle">{t.brandName}</span>}
              <span className="subtle" style={{ fontSize: 13 }}>
                {[t.type, t.origin].filter(Boolean).join(' · ')}
                {t.sharedTags > 0 &&
                  ` · ${t.sharedTags} shared flavor ${t.sharedTags === 1 ? 'tag' : 'tags'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
