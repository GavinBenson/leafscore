import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { ReportButton } from '@/components/ReportButton'
import { ShareButton } from '@/components/ShareButton'
import { TeaCard } from '@/components/TeaCard'
import { isListIndexable, listMetaDescription } from '@/lib/data/listSeo'
import { getListWithTeas } from '@/lib/data/lists'
import { getPublicProfile } from '@/lib/data/users'
import { parseId } from '@/lib/ids'
import { getCurrentUser } from '@/lib/session'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const listId = parseId((await params).id)
    // Public view only (no viewer): a private or hidden list never leaks its title.
    const data = listId === null ? null : await getListWithTeas(db, listId)
    if (!data) return { title: 'List not found', robots: { index: false } }
    const title = `${data.list.title} (tea list)`
    const description = listMetaDescription(data.list, data.teas.length)
    const url = `/lists/${data.list.id}`
    return {
      title,
      description,
      alternates: { canonical: url },
      robots: isListIndexable(data.teas.length) ? undefined : { index: false, follow: true },
      openGraph: { type: 'website', siteName: 'LeafScore', title, description, url },
      twitter: { card: 'summary_large_image', title, description },
    }
  } catch {
    return { title: 'Tea list' }
  }
}

export default async function ListPage({ params }: Props) {
  const listId = parseId((await params).id)
  if (listId === null) notFound()

  const user = await getCurrentUser()
  // Null for a private list, a hidden list (unless it is yours) or a banned author.
  const data = await getListWithTeas(db, listId, user?.id)
  if (!data) notFound()

  const { list, owner, isOwner, teas } = data
  const visibleToPublic = list.isPublic && !list.hidden
  // Link the author only when their profile is public (null otherwise).
  const publicProfile = await getPublicProfile(db, owner.id)
  const returnTo = `/lists/${list.id}`

  return (
    <div>
      {isOwner && list.hidden && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          <strong>Hidden by moderators.</strong> This list is not visible to anyone else.
        </div>
      )}
      {isOwner && !list.hidden && !list.isPublic && (
        <p className="subtle" role="status">
          Private list: only you can see it.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 4px',
              overflowWrap: 'anywhere',
            }}
          >
            {list.title}
          </h1>
          <p className="subtle" style={{ margin: '0 0 12px' }}>
            {teas.length} {teas.length === 1 ? 'tea' : 'teas'} &middot; by{' '}
            {publicProfile ? <Link href={`/u/${owner.id}`}>{owner.name}</Link> : owner.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {visibleToPublic && <ShareButton title={list.title} path={`/lists/${list.id}`} />}
          {isOwner && (
            <Link href={`/lists/${list.id}/edit`} className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
              Edit list
            </Link>
          )}
        </div>
      </div>

      {list.description && <p style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{list.description}</p>}

      {teas.length === 0 ? (
        <div className="empty-state">
          <p>No teas in this list yet.</p>
        </div>
      ) : (
        <ol className="tea-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {teas.map(({ tea, brand }) => (
            <li key={tea.id}>
              <TeaCard tea={{ ...tea, brand }} />
            </li>
          ))}
        </ol>
      )}

      {visibleToPublic && !isOwner && (
        <div style={{ marginTop: 24 }}>
          <ReportButton listId={list.id} signedInAs={Boolean(user)} returnTo={returnTo} />
        </div>
      )}
    </div>
  )
}
