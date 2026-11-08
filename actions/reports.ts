'use server'

import { revalidatePath } from 'next/cache'
import { revalidateListCaches, revalidateProfileCaches, revalidateTeaCaches } from '@/lib/cache'
import { db } from '@/db/client'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import {
  createReport,
  MAX_REPORT_DETAILS_LENGTH,
  resolveReport,
  type ReportResolution,
} from '@/lib/data/reports'
import { parseId } from '@/lib/ids'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { requireAdmin } from '@/lib/requireAdmin'
import { getCurrentUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export type ReportFormState = { message?: string; done?: boolean }

export async function submitReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Your session has ended. Sign in again to send a report.' }

  // Exactly one target: a review or a public list.
  const listIdRaw = formData.get('listId')
  const listId = listIdRaw ? parseId(String(listIdRaw)) : null
  const reviewId = Number(formData.get('reviewId'))
  if (listIdRaw ? listId === null : !Number.isSafeInteger(reviewId) || reviewId < 1) {
    return { message: listIdRaw ? "We couldn't find that list." : "We couldn't find that review." }
  }
  const reason = formData.get('reason')
  const detailsRaw = formData.get('details')
  const details = typeof detailsRaw === 'string' ? detailsRaw.trim() : ''
  if (details.length > MAX_REPORT_DETAILS_LENGTH) {
    return { message: `Keep the details to ${MAX_REPORT_DETAILS_LENGTH} characters or fewer.` }
  }

  try {
    if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }

    const limited = await enforceRateLimit('report', {
      limit: 20,
      windowSeconds: 86_400,
      userId: user.id,
    })
    if (!limited.ok) return { message: limited.message }

    const common = {
      reporterUserId: user.id,
      reason: typeof reason === 'string' ? reason : '',
      details: details || null,
    }
    const result = await createReport(
      db,
      listId !== null ? { ...common, listId } : { ...common, reviewId },
    )
    if (result.ok) {
      revalidatePath('/admin/reports')
      return { done: true }
    }
    switch (result.reason) {
      case 'already_reported':
        return {
          done: true,
          message: `You've already reported this ${listId !== null ? 'list' : 'review'}. Moderators will take a look.`,
        }
      case 'own_review':
        return { message: "You can't report your own review." }
      case 'review_not_found':
        return { message: 'That review is no longer available.' }
      case 'list_not_found':
        return { message: 'That list is no longer available.' }
      case 'own_list':
        return { message: "You can't report your own list." }
      case 'invalid_reason':
        return { message: 'Choose a reason for the report.' }
      case 'details_too_long':
        return { message: `Keep the details to ${MAX_REPORT_DETAILS_LENGTH} characters or fewer.` }
    }
  } catch (error) {
    console.error('submitReport failed', error)
    return { message: "We couldn't send your report. Try again in a moment." }
  }
}

// Admin-gated here, not only in the layout: server actions are public endpoints.
export async function resolveReportAction(
  reportId: number,
  resolution: ReportResolution,
) {
  const user = await requireAdmin()
  if (!['dismiss', 'hide', 'hide_and_ban', 'hide_list', 'hide_list_and_ban'].includes(resolution)) {
    throw new Error('Bad resolution')
  }

  const result = await resolveReport(db, reportId, resolution, user.id)

  if (result && 'blocked' in result) {
    // Nothing was changed. Shown as a message on the reports page.
    redirect('/admin/reports?error=admin_author')
  }

  revalidatePath('/admin/reports')
  if (result?.hidden && result.listId !== null) {
    // A hidden list leaves the index, its page and the sitemap; a ban also
    // removes the author's reviews (profile caches cover that).
    revalidateListCaches()
    revalidatePath('/lists')
    revalidatePath(`/lists/${result.listId}`)
    if (result.authorId !== undefined) {
      revalidateProfileCaches(result.authorId, { reviewsChanged: result.banned })
    }
    return
  }
  if (result?.hidden) {
    revalidatePath('/browse', 'layout')
    if (result.teaId !== undefined && result.authorId !== undefined) {
      revalidateTeaCaches(result.teaId)
      revalidateProfileCaches(result.authorId, { reviewsChanged: result.banned })
    }
    revalidatePath('/journal')
    revalidatePath('/')
  }
}
