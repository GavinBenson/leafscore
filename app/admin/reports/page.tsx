import Image from 'next/image'
import Link from 'next/link'
import { db } from '@/db/client'
import { listPendingListReports, listPendingReports } from '@/lib/data/reports'
import { resolveReportAction } from '@/actions/reports'

export const metadata = {
  title: 'Reported reviews and lists',
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam or advertising',
  offensive: 'Offensive or abusive',
  off_topic: 'Not about this tea',
  fake: 'Fake or misleading',
  other: 'Something else',
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const [rows, listRows] = await Promise.all([listPendingReports(db), listPendingListReports(db)])

  // One card per list, with every pending report on it underneath.
  const listGroups = new Map<number, typeof listRows>()
  for (const row of listRows) {
    const g = listGroups.get(row.list.id) ?? []
    g.push(row)
    listGroups.set(row.list.id, g)
  }

  // One card per review, with every pending report on it underneath.
  const groups = new Map<number, typeof rows>()
  for (const row of rows) {
    const list = groups.get(row.review.id) ?? []
    list.push(row)
    groups.set(row.review.id, list)
  }

  return (
    <>
      <h1 className="section-title">Reported reviews and lists</h1>

      {error === 'admin_author' && (
        <p role="alert" className="card">
          That content was written by an admin, who cannot be banned here. Nothing was changed. Use the hide
          option instead, or remove admin rights first.
        </p>
      )}

      {groups.size === 0 && listGroups.size === 0 ? (
        <div className="empty-state">
          <p>No pending reports.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...listGroups.values()].map((group) => {
            const { list, owner, reportCount } = group[0]
            return (
              <section key={`list-${list.id}`} className="card" aria-label={`Reports on the list ${list.title}`}>
                <div style={{ fontWeight: 600 }}>
                  List: <Link href={`/lists/${list.id}`}>{list.title}</Link>{' '}
                  <span className="tag">
                    {reportCount} {reportCount === 1 ? 'report' : 'reports'}
                  </span>
                </div>
                <div className="subtle">
                  By {owner.name}
                  {owner.bannedAt ? ' (banned)' : ''}
                  {list.hidden ? ' · already hidden' : ''}
                </div>
                {list.description && <p style={{ margin: '8px 0', whiteSpace: 'pre-line' }}>{list.description}</p>}
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  {group.map(({ report, reporter }) => (
                    <li key={report.id}>
                      {REASON_LABELS[report.reason] ?? report.reason} &middot; {reporter.name}
                      {report.details ? `: ${report.details}` : ''}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'dismiss')}>
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Dismiss
                    </button>
                  </form>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'hide_list')}>
                    <button type="submit" className="btn btn-outline btn-sm">
                      Hide list
                    </button>
                  </form>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'hide_list_and_ban')}>
                    <button type="submit" className="btn btn-danger btn-sm">
                      Hide list + ban author
                    </button>
                  </form>
                </div>
              </section>
            )
          })}
          {[...groups.values()].map((group) => {
            const { review, tea, author, reportCount } = group[0]
            return (
              <section key={review.id} className="card" aria-label={`Reports on a review of ${tea.name}`}>
                <div style={{ fontWeight: 600 }}>
                  <Link href={`/browse/${tea.id}`}>{tea.name}</Link>{' '}
                  <span className="tag">
                    {reportCount} {reportCount === 1 ? 'report' : 'reports'}
                  </span>
                </div>
                <div className="subtle">
                  By {author.name}
                  {author.bannedAt ? ' (banned)' : ''} &middot; score {review.score}
                  {review.hidden ? ' · already hidden' : ''}
                </div>
                {review.notes && <p style={{ margin: '8px 0' }}>{review.notes}</p>}
                {review.photoUrl && (
                  <Image
                    src={review.photoUrl}
                    alt="Photo attached to the reported review"
                    width={240}
                    height={180}
                    style={{ width: 240, height: 'auto', borderRadius: 'var(--radius-md)' }}
                  />
                )}
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  {group.map(({ report, reporter }) => (
                    <li key={report.id}>
                      {REASON_LABELS[report.reason] ?? report.reason} &middot; {reporter.name}
                      {report.details ? `: ${report.details}` : ''}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'dismiss')}>
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Dismiss
                    </button>
                  </form>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'hide')}>
                    <button type="submit" className="btn btn-outline btn-sm">
                      Hide review
                    </button>
                  </form>
                  <form action={resolveReportAction.bind(null, group[0].report.id, 'hide_and_ban')}>
                    <button type="submit" className="btn btn-danger btn-sm">
                      Hide + ban author
                    </button>
                  </form>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
