'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import {
  isFavorited,
  addFavorite,
  removeFavorite as deleteFavorite,
  countFavoritesSince,
} from '@/lib/data/favorites'
import { getTea } from '@/lib/data/teas'
import { parseId } from '@/lib/ids'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'

// Not exported: a "use server" file may only export async functions.
const MAX_FAVORITES_PER_DAY = 500

export async function toggleFavorite(rawTeaId: number): Promise<{ favorited: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const teaId = parseId(rawTeaId)
  if (teaId === null) throw new Error('Invalid tea')

  const limit = await enforceRateLimit('favorite', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limit.ok) return { favorited: await isFavorited(db, user.id, teaId), error: limit.message }

  if (!(await getTea(db, teaId))) throw new Error('Tea not found')

  const favorited = await isFavorited(db, user.id, teaId)

  if (favorited) {
    await deleteFavorite(db, user.id, teaId)
  } else {
    const today = await countFavoritesSince(db, user.id, new Date(Date.now() - 24 * 3600 * 1000))
    if (today >= MAX_FAVORITES_PER_DAY) {
      return { favorited: false, error: 'You have reached the daily favorites limit. Try again tomorrow.' }
    }
    await addFavorite(db, user.id, teaId)
  }

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')

  return { favorited: !favorited }
}

// Idempotent: unlike the toggle, a second call (stale page, double click, another
// tab) never re-adds the tea.
export async function removeFavorite(rawTeaId: number): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const teaId = parseId(rawTeaId)
  if (teaId === null) throw new Error('Invalid tea')

  const limit = await enforceRateLimit('favorite', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limit.ok) return { error: limit.message }

  await deleteFavorite(db, user.id, teaId)

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')
  return {}
}
