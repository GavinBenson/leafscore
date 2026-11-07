'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import {
  isInWishlist,
  addToWishlist,
  countWishlist,
  removeFromWishlist,
} from '@/lib/data/wishlist'
import { canAddToWishlist } from '@/lib/premium'
import { getCurrentUser } from '@/lib/session'

export async function toggleWishlist(teaId: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const wishlisted = await isInWishlist(db, user.id, teaId)

  if (wishlisted) {
    await removeFromWishlist(db, user.id, teaId)
  } else {
    if (!canAddToWishlist(user.isPremium, await countWishlist(db, user.id))) {
      return { wishlisted: false, limitReached: true }
    }
    await addToWishlist(db, user.id, teaId)
  }

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')

  return { wishlisted: !wishlisted, limitReached: false }
}
