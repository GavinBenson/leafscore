'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import {
  isInWishlist,
  addToWishlistWithinCap,
  removeFromWishlist as deleteFromWishlist,
} from '@/lib/data/wishlist'
import { getTea } from '@/lib/data/teas'
import { parseId } from '@/lib/ids'
import { FREE_WISHLIST_LIMIT } from '@/lib/premium'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'

export async function toggleWishlist(
  rawTeaId: number,
): Promise<{ wishlisted: boolean; limitReached: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const teaId = parseId(rawTeaId)
  if (teaId === null) throw new Error('Invalid tea')

  const limit = await enforceRateLimit('wishlist', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limit.ok) {
    return { wishlisted: await isInWishlist(db, user.id, teaId), limitReached: false, error: limit.message }
  }

  if (!(await getTea(db, teaId))) throw new Error('Tea not found')

  const wishlisted = await isInWishlist(db, user.id, teaId)

  if (wishlisted) {
    await deleteFromWishlist(db, user.id, teaId)
  } else {
    const result = await addToWishlistWithinCap(db, user.id, teaId, user.isPremium ? null : FREE_WISHLIST_LIMIT)
    if (result === 'limit') return { wishlisted: false, limitReached: true }
  }

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')

  return { wishlisted: !wishlisted, limitReached: false }
}

// Idempotent: unlike the toggle, a second call never re-adds the tea.
export async function removeFromWishlist(rawTeaId: number): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const teaId = parseId(rawTeaId)
  if (teaId === null) throw new Error('Invalid tea')

  const limit = await enforceRateLimit('wishlist', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limit.ok) return { error: limit.message }

  await deleteFromWishlist(db, user.id, teaId)

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')
  return {}
}
