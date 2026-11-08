import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/db/client'
import { Pager, parsePage } from '@/components/Pager'
import { listPublicLists } from '@/lib/data/lists'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'

const PER_PAGE = 12

type Props = { searchParams?: Promise<{ page?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams)?.page)
  const title = page > 1 ? `Tea lists, page ${page}` : 'Tea lists'
  const description = 'Curated tea lists from the LeafScore community: favorites, budget picks and more.'
  const url = page > 1 ? `/lists?page=${page}` : '/lists'
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'LeafScore', title, description, url },
  }
}

export default async function ListsPage({ searchParams }: Props) {
  const page = parsePage((await searchParams)?.page)
  const [user, fetched] = await Promise.all([
    getCurrentUser(),
    listPublicLists(db, { limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE, minTeas: 1 }),
  ])
  const hasNext = fetched.length > PER_PAGE
  const rows = fetched.slice(0, PER_PAGE)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 className="section-title" style={{ margin: 0 }}>
          Tea lists
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user ? (
            <>
              <Link href="/lists/mine" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>
                My lists
              </Link>
              <Link href="/lists/new" className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
                New list
              </Link>
            </>
          ) : (
            <Link href={signInPath('/lists/mine')} className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>
              Sign in to make a list
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No public lists yet.</p>
        </div>
      ) : (
        <ul className="tea-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map(({ list, owner, teaCount }) => (
            <li key={list.id} className="card card-link" style={{ position: 'relative' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                <Link href={`/lists/${list.id}`} style={{ color: 'inherit' }}>
                  {list.title}
                </Link>
              </div>
              <div className="subtle" style={{ marginBottom: 8 }}>
                {teaCount} {teaCount === 1 ? 'tea' : 'teas'} &middot; by {owner.name}
              </div>
              {list.description && (
                <p
                  style={{
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {list.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasNext={hasNext} hrefFor={(p) => `/lists${p > 1 ? `?page=${p}` : ''}`} />
    </div>
  )
}
