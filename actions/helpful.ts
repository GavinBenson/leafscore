'use server'

import { eq } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { TAGS } from '@/lib/cache'
import { setHelpful, type HelpfulFailure } from '@/lib/data/helpful'
import { parseId } from '@/lib/ids'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'

// helpful/count are absent until the first vote; the button then shows its props.
export type HelpfulState = { helpful?: boolean; count?: number; error?: string }

const FAILURE_MESSAGES: Record<HelpfulFailure, string> = {
  review_not_found: "We couldn't find that review.",
  review_hidden: "We couldn't find that review.",
  own_review: "You can't mark your own review as helpful.",
}

// Idempotent: the form says whether the vote should exist ('1') or not ('0').
export async function setReviewHelpful(prev: HelpfulState, formData: FormData): Promise<HelpfulState> {
  const user = await getCurrentUser()
  if (!user) return { ...prev, error: 'Sign in to mark reviews as helpful.' }

  const reviewId = parseId(formData.get('reviewId') as string | null)
  if (reviewId === null) return { ...prev, error: "We couldn't find that review." }
  const on = formData.get('on')
  if (on !== '1' && on !== '0') return { ...prev, error: 'Something went wrong. Please try again.' }

  try {
    if (await isBanned(db, user.id)) return { ...prev, error: BANNED_MESSAGE }

    const limited = await enforceRateLimit('helpful', { limit: 120, windowSeconds: 3600, userId: user.id })
    if (!limited.ok) return { ...prev, error: limited.message }

    const result = await setHelpful(db, user.id, reviewId, on === '1')
    if (!result.ok) return { ...prev, error: FAILURE_MESSAGES[result.reason] }

    // The tea page's cached core carries vote counts and the helpful ordering.
    const [review] = await db
      .select({ teaId: schema.reviews.teaId })
      .from(schema.reviews)
      .where(eq(schema.reviews.id, reviewId))
    if (review) updateTag(TAGS.tea(review.teaId))

    return { helpful: result.helpful, count: result.count }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'helpful vote failed', error: String(error) }))
    return { ...prev, error: 'Something went wrong. Please try again.' }
  }
}
