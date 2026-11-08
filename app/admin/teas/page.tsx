import Link from 'next/link'
import { db } from '@/db/client'
import { listTeas } from '@/lib/data/teas'
import { AdminDeleteTeaButton } from '@/components/AdminDeleteTeaButton'
import { LeafScoreBadge } from '@/components/LeafScoreBadge'

export const metadata = {
  title: 'Manage Teas',
}

export default async function AdminTeasPage() {
  const teas = await listTeas(db, { limit: 100 })

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1 className="section-title" style={{ margin: 0 }}>
          Manage Teas
        </h1>
        <Link href="/admin/teas/new" className="btn btn-primary btn-sm">
          Add Tea
        </Link>
      </div>

      {teas.length === 0 ? (
        <div className="empty-state">
          <p>No teas yet.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div
            style={{ overflowX: 'auto' }}
            className="admin-table-wrapper"
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 14,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '2px solid var(--color-line)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    Name
                  </th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    Type
                  </th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    Score
                  </th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    Reviews
                  </th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    Buy links
                  </th>
                  <th style={{ padding: '8px 12px' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {teas.map((tea) => (
                  <tr
                    key={tea.id}
                    style={{ borderBottom: '1px solid var(--color-line)' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <Link
                        href={`/browse/${tea.id}`}
                        style={{
                          color: 'var(--color-ink)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        {tea.name}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="tag">{tea.type}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <LeafScoreBadge score={tea.leafScore} />
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--color-ink-2)' }}>
                      {tea.reviewCount ?? 0}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link href={`/admin/teas/${tea.id}/affiliate`}>Affiliate links</Link>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <AdminDeleteTeaButton teaId={tea.id} teaName={tea.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
