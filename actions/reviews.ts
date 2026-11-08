'use server'

import { revalidatePath } from 'next/cache'
import { revalidateProfileCaches, revalidateTeaCaches } from '@/lib/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { deleteReviewPhoto, uploadReviewPhoto } from '@/lib/photos'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { captureError } from '@/lib/observability'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import {
  createReview,
  deleteReview,
  findRecentDuplicateReview,
  findReviewByUserAndTea,
  getReview,
  isDuplicateReviewError,
  updateReview,
} from '@/lib/data/reviews'
import { getTea } from '@/lib/data/teas'
import { updateUserPreferences } from '@/lib/data/users'
import { getCurrentUser } from '@/lib/session'
import { resolveReturnTo } from '@/lib/returnTo'
import { checkPhoto, type PhotoType } from '@/lib/validation/photo'
import { parseReviewForm, type ReviewFieldErrors } from '@/lib/validation/review'

export type ReviewFormState = {
  message?: string
  fieldErrors?: ReviewFieldErrors
  // Set when the user already reviewed this tea, so the form can link to it.
  existingReviewId?: number
}

const ALREADY_REVIEWED_MESSAGE = "You've already reviewed this tea."

// Bans and the daily write cap apply to creating and editing alike.
async function checkMayWrite(userId: number): Promise<string | null> {
  if (await isBanned(db, userId)) return BANNED_MESSAGE
  const limited = await enforceRateLimit('review', { limit: 20, windowSeconds: 86_400, userId })
  return limited.ok ? null : limited.message
}

// The "Rate before seeing the score" toggle on the new-review form is the
// user's blind-tasting default, so the choice is remembered for next time.
// Best effort: the review is already saved, so a failure here is ignored.
async function rememberBlindChoice(userId: number, formData: FormData) {
  const raw = formData.get('blindTasting')
  if (raw !== 'true' && raw !== 'false') return
  try {
    await updateUserPreferences(db, userId, { blindTasting: raw === 'true' })
  } catch (error) {
    captureError(error, { action: 'rememberBlindChoice', userId })
  }
}

const PHOTO_UPLOAD_FAILED = "We couldn't upload your photo. Try again, or save without it."

function refreshReviewPages(teaId: number, userId: number) {
  revalidateTeaCaches(teaId)
  revalidateProfileCaches(userId)
  revalidatePath('/browse/' + teaId)
  revalidatePath('/journal')
  // The home page's Top Rated list is prerendered and shows each tea's score.
  revalidatePath('/')
}

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

  let uploadedPhotoUrl: string | null = null
  try {
    const blocked = await checkMayWrite(user.id)
    if (blocked) return { message: blocked }

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
      const existing = await findReviewByUserAndTea(db, user.id, review.teaId)
      if (existing) {
        return { message: ALREADY_REVIEWED_MESSAGE, existingReviewId: existing.id }
      }
      let photoUrl: string | null = null
      if (photo && 'file' in photo) {
        try {
          photoUrl = await uploadReviewPhoto(photo.file, photo.type, user.id)
          uploadedPhotoUrl = photoUrl
        } catch (error) {
          captureError(error, { action: 'uploadReviewPhoto', userId: user.id })
          return { fieldErrors: { photo: PHOTO_UPLOAD_FAILED } }
        }
      }
      await createReview(db, { ...review, photoUrl, userId: user.id }, tagIds)
      await rememberBlindChoice(user.id, formData)
    }
  } catch (error) {
    // The review was not saved, so the blob uploaded for it would be orphaned.
    await deleteReviewPhoto(uploadedPhotoUrl)
    if (isDuplicateReviewError(error)) {
      // Lost a race with another tab: the review exists now, so point at it.
      const existing = await findReviewByUserAndTea(db, user.id, review.teaId).catch(() => null)
      return { message: ALREADY_REVIEWED_MESSAGE, existingReviewId: existing?.id }
    }
    captureError(error, { action: 'submitReview', userId: user.id, teaId: review.teaId })
    return { message: "We couldn't save your review. Try again in a moment." }
  }

  refreshReviewPages(review.teaId, user.id)
  redirect('/browse/' + review.teaId + '?reviewed=1')
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
  const {
    tagIds, score, brewMethod, brewTemp, steepTime, notes, wouldDrinkAgain,
    aromaScore, flavorScore, bodyScore, aftertasteScore, valueScore,
  } = parsed.data
  // Sub-scores are always sent by the form; null (an empty field) clears one.
  const changes = {
    score, brewMethod, brewTemp, steepTime, notes, wouldDrinkAgain,
    aromaScore, flavorScore, bodyScore, aftertasteScore, valueScore,
  }

  let teaId: number
  let oldPhotoToDelete: string | null = null
  let uploadedPhotoUrl: string | null = null
  try {
    const blocked = await checkMayWrite(user.id)
    if (blocked) return { message: blocked }

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
        uploadedPhotoUrl = photoUrl
      } catch (error) {
        captureError(error, { action: 'uploadReviewPhoto', userId: user.id })
        return { fieldErrors: { photo: PHOTO_UPLOAD_FAILED } }
      }
    } else if (formData.get('removePhoto') === 'true') {
      photoUrl = null
    }
    if (photoUrl !== existing.photoUrl) oldPhotoToDelete = existing.photoUrl

    const updated = await updateReview(db, reviewId, user.id, { ...changes, photoUrl }, tagIds)
    if (!updated) {
      await deleteReviewPhoto(uploadedPhotoUrl)
      return { message: "We couldn't find that review." }
    }
    teaId = updated.teaId
  } catch (error) {
    await deleteReviewPhoto(uploadedPhotoUrl)
    captureError(error, { action: 'saveReviewEdit', userId: user.id, reviewId })
    return { message: "We couldn't save your review. Try again in a moment." }
  }

  await deleteReviewPhoto(oldPhotoToDelete)

  refreshReviewPages(teaId, user.id)
  redirect('/browse/' + teaId)
}

export type RemoveReviewState = { message?: string }

// Form action (useActionState). Failures come back as state, not as a thrown
// error page; success redirects to the form's returnTo (default: the tea page).
export async function removeReview(
  reviewId: number,
  teaId: number,
  _prev: RemoveReviewState,
  formData: FormData,
): Promise<RemoveReviewState> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const deleted = await deleteReview(db, reviewId, user.id)
    await deleteReviewPhoto(deleted?.photoUrl)
  } catch (error) {
    captureError(error, { action: 'removeReview', userId: user.id, reviewId })
    return { message: "We couldn't delete your review. Try again in a moment." }
  }

  refreshReviewPages(teaId, user.id)
  redirect(resolveReturnTo(formData.get('returnTo'), '/browse/' + teaId))
}
