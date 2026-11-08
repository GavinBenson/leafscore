'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { createSession, deleteSession, linkSessionToReview } from '@/lib/data/brewSessions'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { getUserById } from '@/lib/data/users'
import { parseId } from '@/lib/ids'
import { FREE_SESSION_LIMIT } from '@/lib/premium'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'
import { parseTemperatureInput, parseWeightInput } from '@/lib/units'
import { MAX_INFUSIONS_PER_SESSION, MAX_INFUSION_NOTE_LENGTH } from '@/lib/validation/brewSession'

// upgrade: show the "See Premium plans" link next to the message.
export type SessionFormState = { message?: string; upgrade?: boolean }

const SIGNED_OUT = 'Your session has ended. Sign in again to save this brew session.'
const GENERIC = 'Something went wrong. Please try again.'
// Generous bound on the posted infusion JSON (40 steps with 300 character notes).
const MAX_INFUSIONS_JSON = MAX_INFUSIONS_PER_SESSION * (MAX_INFUSION_NOTE_LENGTH * 6 + 100)

function text(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

// Read-only helper for the session form: does the signed-in user have a review
// of this tea (so the "link to my review" checkbox can be offered)?
export async function hasReviewForTea(rawTeaId: number): Promise<boolean> {
  const user = await getCurrentUser()
  const teaId = parseId(rawTeaId)
  if (!user || teaId === null) return false
  try {
    return (await findReviewByUserAndTea(db, user.id, teaId)) !== null
  } catch {
    return false
  }
}

// Saves a whole session (settings plus every infusion) in one go. A saved
// session never changes the LeafScore, so no tea cache is touched.
export async function saveSession(_prev: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const user = await getCurrentUser()
  if (!user) return { message: SIGNED_OUT }

  const teaId = parseId(text(formData, 'teaId'))
  if (teaId === null) return { message: 'Choose a tea.' }

  const infusionsRaw = text(formData, 'infusions')
  if (infusionsRaw.length > MAX_INFUSIONS_JSON) return { message: 'That session is too large to save.' }
  let infusions: unknown
  try {
    infusions = JSON.parse(infusionsRaw)
  } catch {
    return { message: 'Add at least one infusion.' }
  }

  let sessionId: number
  try {
    if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }

    const limited = await enforceRateLimit('session-save', { limit: 30, windowSeconds: 3600, userId: user.id })
    if (!limited.ok) return { message: limited.message }

    const row = await getUserById(db, user.id)
    const tempUnit = row?.tempUnit ?? 'c'
    const weightUnit = row?.weightUnit ?? 'g'

    let tempC: number | null = null
    const tempText = text(formData, 'temp')
    if (tempText !== '') {
      tempC = parseTemperatureInput(tempText, tempUnit)
      if (tempC === null || tempC < 0 || tempC > 100) {
        return {
          message:
            tempUnit === 'f'
              ? 'Temperature must be a number from 32 to 212 degrees Fahrenheit.'
              : 'Temperature must be a number from 0 to 100 degrees Celsius.',
        }
      }
    }
    let gramsUsed: number | null = null
    const weightText = text(formData, 'weight')
    if (weightText !== '') {
      gramsUsed = parseWeightInput(weightText, weightUnit)
      if (gramsUsed === null || gramsUsed > 1000) {
        return { message: `Leaf weight must be a number up to 1000 grams (about 35 ounces).` }
      }
    }

    const result = await createSession(
      db,
      user.id,
      {
        teaId,
        method: text(formData, 'method') || null,
        tempC,
        gramsUsed,
        notes: text(formData, 'notes') || null,
        infusions: infusions as { seconds: number; rating?: number | null; note?: string | null }[],
      },
      user.isPremium,
    )
    if (!result.ok) {
      switch (result.reason) {
        case 'limit_reached':
          return {
            message: `Free accounts can keep ${FREE_SESSION_LIMIT} saved sessions. Delete one, or upgrade to Premium for unlimited sessions.`,
            upgrade: true,
          }
        case 'tea_not_found':
          return { message: "We couldn't find that tea." }
        default:
          return { message: result.error }
      }
    }
    sessionId = result.session.id

    // Optional: attach the session to the user's own review of this tea.
    if (formData.get('linkReview') === '1') {
      const review = await findReviewByUserAndTea(db, user.id, teaId)
      if (review) await linkSessionToReview(db, sessionId, user.id, review.id)
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'session save failed', error: String(error) }))
    return { message: GENERIC }
  }

  revalidatePath('/sessions')
  revalidatePath('/journal')
  redirect(`/sessions/${sessionId}`)
}

export type SessionActionState = { message?: string }

// Owner only (checked in the data layer). Lands on the list with a notice.
export async function deleteSessionAction(
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Your session has ended. Sign in again to delete this session.' }
  const sessionId = parseId(text(formData, 'sessionId'))
  if (sessionId === null) return { message: "We couldn't find that session." }

  try {
    if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }
    const limited = await enforceRateLimit('session-delete', { limit: 60, windowSeconds: 3600, userId: user.id })
    if (!limited.ok) return { message: limited.message }
    if (!(await deleteSession(db, sessionId, user.id))) return { message: "We couldn't find that session." }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'session delete failed', error: String(error) }))
    return { message: GENERIC }
  }

  revalidatePath('/sessions')
  revalidatePath('/journal')
  redirect('/sessions?deleted=1')
}

// Link (link=1) or unlink (link=0) a session and the user's own review of the same tea.
export async function setSessionReviewLink(
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Your session has ended. Sign in again to continue.' }
  const sessionId = parseId(text(formData, 'sessionId'))
  const reviewId = parseId(text(formData, 'reviewId'))
  const link = text(formData, 'link')
  if (sessionId === null || (link === '1' && reviewId === null) || (link !== '1' && link !== '0')) {
    return { message: "We couldn't find that session." }
  }

  try {
    if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }
    const limited = await enforceRateLimit('session-link', { limit: 60, windowSeconds: 3600, userId: user.id })
    if (!limited.ok) return { message: limited.message }
    const result = await linkSessionToReview(db, sessionId, user.id, link === '1' ? reviewId : null)
    if (!result.ok) {
      return {
        message:
          result.reason === 'session_not_found'
            ? "We couldn't find that session."
            : 'You can only link a session to your own review of the same tea.',
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'session link failed', error: String(error) }))
    return { message: GENERIC }
  }

  revalidatePath(`/sessions/${sessionId}`)
  return {}
}
