'use server'

import { revalidatePath } from 'next/cache'
import { revalidateProfileCaches } from '@/lib/cache'
import { db } from '@/db/client'
import { setProfilePublic, updateDisplayName, updateUserPreferences } from '@/lib/data/users'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'

export type DisplayNameState = { status: 'idle' | 'saved' | 'error'; message?: string; name?: string }

export type PreferencesState = { status: 'idle' | 'saved' | 'error'; message?: string }

// Units and blind tasting (PBI 42/43). Form action for useActionState. The
// radios always submit; the blind-tasting checkbox is absent when unchecked.
export async function savePreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const user = await getCurrentUser()
  if (!user) return { status: 'error', message: 'Please sign in again.' }

  if (await isBanned(db, user.id)) return { status: 'error', message: BANNED_MESSAGE }
  const limited = await enforceRateLimit('preferences', { limit: 30, windowSeconds: 3600, userId: user.id })
  if (!limited.ok) return { status: 'error', message: limited.message }

  const temp = formData.get('tempUnit')
  const weight = formData.get('weightUnit')
  try {
    const result = await updateUserPreferences(db, user.id, {
      tempUnit: typeof temp === 'string' ? temp : undefined,
      weightUnit: typeof weight === 'string' ? weight : undefined,
      blindTasting: formData.get('blindTasting') !== null,
    })
    if (!result.ok) return { status: 'error', message: result.error }
  } catch {
    return { status: 'error', message: "We couldn't save your preferences. Try again in a moment." }
  }

  revalidatePath('/settings')
  revalidatePath('/journal')
  return { status: 'saved', message: 'Preferences saved.' }
}

export async function updateProfileVisibility(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  await setProfilePublic(db, user.id, formData.get('profilePublic') === 'true')

  revalidateProfileCaches(user.id)
  revalidatePath('/settings')
  revalidatePath(`/u/${user.id}`)
}

export async function saveDisplayName(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const user = await getCurrentUser()
  if (!user) return { status: 'error', message: 'Please sign in again.' }

  const raw = String(formData.get('name') ?? '')
  const result = await updateDisplayName(db, user.id, raw)
  if (!result.ok) return { status: 'error', message: result.error, name: raw }

  revalidateProfileCaches(user.id)
  revalidatePath('/settings')
  revalidatePath(`/u/${user.id}`)
  return { status: 'saved', message: 'Name saved.', name: result.name }
}
