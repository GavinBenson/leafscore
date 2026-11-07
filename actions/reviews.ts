'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { deleteReviewPhoto, uploadReviewPhoto } from '@/lib/photos'
import {
  createReview,
  deleteReview,
  findRecentDuplicateReview,
  getReview,
  updateReview,
} from '@/lib/data/reviews'
import { getTea } from '@/lib/data/teas'
import { getCurrentUser } from '@/lib/session'
import { checkPhoto, type PhotoType } from '@/lib/validation/photo'
import { parseReviewForm, type ReviewFieldErrors } from '@/lib/validation/review'

export type ReviewFormState = {
  message?: string
  fieldErrors?: ReviewFieldErrors
}

const PHOTO_UPLOAD_FAILED = "We couldn't upload your photo. Try again, or save without it."

async function readPhoto(
  formData: FormData,
): Promise<{ file: File; type: PhotoType } | { error: string } | null> {
  const file = formData.get('photo')
  // Browsers send an empty File when nothing was chosen.
  if (!(file instanceof File) || file.size === 0) return null
  const checked = await checkPhoto(file)
  return checked.ok ? { file, type: checked.type } : { error: checked.message }
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
  const photo = await readPhoto(formData)
  const photoError = photo && 'error' in photo ? photo.error : undefined
  if (!parsed.ok || photoError) {
    return {
      message: 'Check the highlighted fields.',
      fieldErrors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(photoError ? { photo: photoError } : {}),
      },
    }
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
      let photoUrl: string | null = null
      if (photo && 'file' in photo) {
        try {
          photoUrl = await uploadReviewPhoto(photo.file, photo.type, user.id)
        } catch (error) {
          console.error('uploadReviewPhoto failed', error)
          return { fieldErrors: { photo: PHOTO_UPLOAD_FAILED } }
        }
      }
      await createReview(db, { ...review, photoUrl, userId: user.id }, tagIds)
    }
  } catch (error) {
    console.error('submitReview failed', error)
    return { message: "We couldn't save your review. Try again in a moment." }
  }

  revalidatePath('/browse/' + review.teaId)
  revalidatePath('/journal')
  redirect('/browse/' + review.teaId)
}

export async function saveReviewEdit(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const user = await getCurrentUser()
  if (!user) {
    return { message: 'Your session has ended. Sign in again to save this review.' }
  }

  const reviewId = Number(formData.get('reviewId'))
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) {
    return { message: "We couldn't find that review." }
  }

  const parsed = parseReviewForm(formData)
  const photo = await readPhoto(formData)
  const photoError = photo && 'error' in photo ? photo.error : undefined
  if (!parsed.ok || photoError) {
    return {
      message: 'Check the highlighted fields.',
      fieldErrors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(photoError ? { photo: photoError } : {}),
      },
    }
  }
  // Listed field by field so teaId stays out: an edit can't move a review to another tea.
  const { tagIds, score, brewMethod, brewTemp, steepTime, notes, wouldDrinkAgain } = parsed.data
  const changes = { score, brewMethod, brewTemp, steepTime, notes, wouldDrinkAgain }

  let teaId: number
  let oldPhotoToDelete: string | null = null
  try {
    const existing = await getReview(db, reviewId)
    if (!existing || existing.userId !== user.id) {
      return { message: "We couldn't find that review." }
    }

    if (tagIds.length > 0) {
      const known = new Set((await listFlavorTags(db)).map((tag) => tag.id))
      if (tagIds.some((id) => !known.has(id))) {
        return { fieldErrors: { tagIds: 'One of the flavor tags is not valid.' } }
      }
    }

    let photoUrl = existing.photoUrl
    if (photo && 'file' in photo) {
      try {
        photoUrl = await uploadReviewPhoto(photo.file, photo.type, user.id)
      } catch (error) {
        console.error('uploadReviewPhoto failed', error)
        return { fieldErrors: { photo: PHOTO_UPLOAD_FAILED } }
      }
    } else if (formData.get('removePhoto') === 'true') {
      photoUrl = null
    }
    if (photoUrl !== existing.photoUrl) oldPhotoToDelete = existing.photoUrl

    const updated = await updateReview(db, reviewId, user.id, { ...changes, photoUrl }, tagIds)
    if (!updated) return { message: "We couldn't find that review." }
    teaId = updated.teaId
  } catch (error) {
    console.error('saveReviewEdit failed', error)
    return { message: "We couldn't save your review. Try again in a moment." }
  }

  await deleteReviewPhoto(oldPhotoToDelete)

  revalidatePath('/browse/' + teaId)
  revalidatePath('/journal')
  redirect('/browse/' + teaId)
}

export async function removeReview(reviewId: number, teaId: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const deleted = await deleteReview(db, reviewId, user.id)
  await deleteReviewPhoto(deleted?.photoUrl)

  revalidatePath('/browse/' + teaId)
  revalidatePath('/journal')
  redirect('/browse/' + teaId)
}
