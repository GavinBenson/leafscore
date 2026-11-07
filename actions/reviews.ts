'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { createReview, deleteReview, findRecentDuplicateReview } from '@/lib/data/reviews'
import { getTea } from '@/lib/data/teas'
import { getCurrentUser } from '@/lib/session'
import { parseReviewForm, type ReviewFieldErrors } from '@/lib/validation/review'

export type ReviewFormState = {
  message?: string
  fieldErrors?: ReviewFieldErrors
}

export async function submitReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const user = await getCurrentUser()
  if (!user) {
    return { message: 'Your session has ended. Sign in again to save this review.' }
  }

  const parsed = parseReviewForm(formData)
  if (!parsed.ok) {
    return { message: 'Check the highlighted fields.', fieldErrors: parsed.errors }
  }
  const { tagIds, ...review } = parsed.data

  try {
    if (!(await getTea(db, review.teaId))) {
      return { fieldErrors: { teaId: 'That tea no longer exists. Choose another.' } }
    }

    if (tagIds.length > 0) {
      const known = new Set((await listFlavorTags(db)).map((tag) => tag.id))
      if (tagIds.some((id) => !known.has(id))) {
        return { fieldErrors: { tagIds: 'One of the flavor tags is not valid.' } }
      }
    }

    const duplicate = await findRecentDuplicateReview(db, {
      userId: user.id,
      teaId: review.teaId,
      score: review.score,
      notes: review.notes,
    })
    if (!duplicate) {
      await createReview(db, { ...review, userId: user.id }, tagIds)
    }
  } catch (error) {
    console.error('submitReview failed', error)
    return { message: "We couldn't save your review. Try again in a moment." }
  }

  revalidatePath('/browse/' + review.teaId)
  redirect('/browse/' + review.teaId)
}

export async function removeReview(reviewId: number, teaId: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  await deleteReview(db, reviewId, user.id)

  revalidatePath('/browse/' + teaId)
  redirect('/browse/' + teaId)
}
