import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { getReview } from '@/lib/data/reviews'
import { getTea } from '@/lib/data/teas'
import { getCurrentUser } from '@/lib/session'
import { ReviewForm } from '@/components/ReviewForm'
import { getViewerPreferences } from '@/lib/viewerPreferences'

export const metadata = {
  title: 'Edit Review',
}

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect(signInPath(`/reviews/${id}/edit`))

  const reviewId = Number(id)
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) notFound()

  const review = await getReview(db, reviewId)
  // Someone else's review looks the same as a missing one.
  if (!review || review.userId !== user.id) notFound()

  const [teaResult, flavorTags] = await Promise.all([
    getTea(db, review.teaId),
    listFlavorTags(db),
  ])
  if (!teaResult) notFound()
  const prefs = await getViewerPreferences(db, user.id)

  return (
    <div>
      <h1 className="section-title">Edit Review</h1>
      <div className="card" style={{ maxWidth: 600 }}>
        <ReviewForm
          tea={{ id: teaResult.tea.id, name: teaResult.tea.name }}
          flavorTags={flavorTags}
          temperatureUnit={prefs.tempUnit}
          review={{
            id: review.id,
            score: review.score,
            brewMethod: review.brewMethod,
            brewTemp: review.brewTemp,
            steepTime: review.steepTime,
            notes: review.notes,
            wouldDrinkAgain: review.wouldDrinkAgain,
            tagIds: review.tags.map((tag) => tag.id),
            photoUrl: review.photoUrl,
            aromaScore: review.aromaScore,
            flavorScore: review.flavorScore,
            bodyScore: review.bodyScore,
            aftertasteScore: review.aftertasteScore,
            valueScore: review.valueScore,
          }}
        />
      </div>
    </div>
  )
}
