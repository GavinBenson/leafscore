import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db/client'
import { getComparison, type CompareTea } from '@/lib/data/compare'
import { brewGuideSummary } from '@/lib/data/brewGuide'
import { MAX_COMPARE, parseCompareIds } from '@/lib/compareIds'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'
import { AFFILIATE_DISCLOSURE } from '@/lib/affiliate'

// A parametrised comparison is not a page worth indexing.
export const metadata: Metadata = {
  title: 'Compare teas',
  description: 'Compare up to three teas side by side: LeafScore, flavors, brew guide and price per 100 g.',
  alternates: { canonical: '/compare' },
  robots: { index: false, follow: true },
}

const NONE = 'Not available'

function scoreCell(t: CompareTea): ReactNode {
  return (
    <>
      <LeafScoreBadge score={t.leafScore} size="sm" />{' '}
      <span className="subtle">
        {t.leafScore === null ? `${t.reviewCount} of 3 reviews needed` : `${t.reviewCount} reviews`}
      </span>
    </>
  )
}

function rowsFor(): { label: string; cell: (t: CompareTea) => ReactNode }[] {
  return [
    {
      label: 'Brand',
      cell: (t) =>
        t.brand ? <Link href={`/brands/${t.brand.id}`}>{t.brand.name}</Link> : NONE,
    },
    { label: 'Type', cell: (t) => t.type },
    { label: 'Origin', cell: (t) => t.origin ?? NONE },
    { label: 'LeafScore', cell: scoreCell },
    {
      label: 'Top flavors',
      cell: (t) =>
        t.topTags.length > 0 ? (
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {t.topTags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </span>
        ) : (
          'No flavor tags yet'
        ),
    },
    {
      label: 'Brew guide',
      cell: (t) => brewGuideSummary(t.brewGuide) ?? 'Not enough brew details yet',
    },
    {
      label: 'Cheapest per 100 g',
      cell: (t) =>
        t.cheapest ? `${t.cheapest.perHundredGrams} at ${t.cheapest.provider}` : 'No price data',
    },
  ]
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams?: Promise<{ ids?: string | string[] }>
}) {
  const sp = (await searchParams) ?? {}
  const parsed = parseCompareIds(sp.ids)
  const { teas, missingIds } = parsed.ids.length > 0 ? await getComparison(db, parsed.ids) : { teas: [], missingIds: [] }

  const notes: string[] = []
  if (parsed.invalid > 0) {
    notes.push(
      `${parsed.invalid} ${parsed.invalid === 1 ? 'entry was' : 'entries were'} not a valid tea id and ${parsed.invalid === 1 ? 'was' : 'were'} ignored.`,
    )
  }
  if (missingIds.length > 0) {
    notes.push(
      `${missingIds.length} ${missingIds.length === 1 ? 'tea was' : 'teas were'} not found and ${missingIds.length === 1 ? 'was' : 'were'} ignored.`,
    )
  }
  if (parsed.overflow > 0) {
    notes.push(`Only the first ${MAX_COMPARE} teas are compared.`)
  }

  const rows = rowsFor()
  const hasPrices = teas.some((t) => t.cheapest)

  return (
    <div>
      <h1 className="section-title">Compare teas</h1>

      {notes.length > 0 && (
        <div className="compare-note" role="status">
          {notes.map((n) => (
            <p key={n} style={{ margin: 0 }}>
              {n}
            </p>
          ))}
        </div>
      )}

      {teas.length < 2 ? (
        <div className="card">
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Pick at least two teas to compare.</p>
          <p className="subtle" style={{ margin: '0 0 12px' }}>
            Use the Compare button on any tea card (up to {MAX_COMPARE} teas), then open the
            Compare link that appears. You can also write the address yourself, like{' '}
            <code>/compare?ids=1,2</code>.
          </p>
          <Link href="/browse" className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
            Browse teas
          </Link>
        </div>
      ) : (
        <>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <caption>Side-by-side comparison of {teas.length} teas</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Detail</span>
                  </th>
                  {teas.map((t) => (
                    <th key={t.id} scope="col">
                      <Link href={`/browse/${t.id}`}>{t.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {teas.map((t) => (
                      <td key={t.id}>{row.cell(t)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="compare-stack">
            {teas.map((t) => (
              <li key={t.id} className="card">
                <h2 className="taste-heading">
                  <Link href={`/browse/${t.id}`}>{t.name}</Link>
                </h2>
                <dl className="fact-list">
                  {rows.map((row) => (
                    <div key={row.label} style={{ display: 'contents' }}>
                      <dt>{row.label}</dt>
                      <dd>{row.cell(t)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          {hasPrices && (
            <p className="subtle" style={{ fontSize: 13, marginTop: 16 }}>
              {AFFILIATE_DISCLOSURE} Prices may be out of date.
            </p>
          )}
        </>
      )}
    </div>
  )
}
