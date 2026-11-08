import Link from 'next/link'
import { redirect } from 'next/navigation'
import { parseId } from '@/lib/ids'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { db } from '@/db/client'
import { getTea } from '@/lib/data/teas'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { ReviewForm } from '@/components/ReviewForm'
import { getViewerPreferences } from '@/lib/viewerPreferences'

export const metadata = {
  title: 'Log a Tea',
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ tea?: string }>
}) {
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(signInPath(params.tea ? `/log?tea=${encodeURIComponent(params.tea)}` : '/log'))

  let tea: { id: number; name: string } | null = null

  if (params.tea) {
    const teaId = parseId(params.tea)
    if (teaId !== null) {
      const result = await getTea(db, teaId)
      if (result) {
        tea = { id: result.tea.id, name: result.tea.name }
      }
    }
  }

  const existing = tea ? await findReviewByUserAndTea(db, user.id, tea.id) : null
  const flavorTags = existing ? [] : await listFlavorTags(db)
  const prefs = await getViewerPreferences(db, user.id)

  return (
    <div>
      <h1 className="section-title">Log a Tea</h1>
      <div className="card" style={{ maxWidth: 600 }}>
        {tea && existing ? (
          <div role="status">
            <p style={{ marginTop: 0 }}>
              You reviewed {tea.name} (score {existing.score}).
            </p>
            <Link href={`/reviews/${existing.id}/edit`} className="btn btn-primary btn-sm">
              Edit your review
            </Link>{' '}
            <Link href={`/browse/${tea.id}`} className="btn btn-ghost btn-sm">
              Back to the tea
            </Link>
          </div>
        ) : (
          <ReviewForm
            tea={tea}
            flavorTags={flavorTags}
            temperatureUnit={prefs.tempUnit}
            blindTasting={prefs.blindTasting}
          />
        )}
      </div>
      {!existing && (
        <p className="subtle" style={{ marginTop: 16 }}>
          Can&apos;t find your tea?{' '}
          <Link href="/requests/new">Request it</Link>
        </p>
      )}
    </div>
  )
}
