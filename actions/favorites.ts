'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import {
  isFavorited,
  addFavorite,
  removeFavorite,
} from '@/lib/data/favorites'
import { getCurrentUser } from '@/lib/session'

export async function toggleFavorite(teaId: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const favorited = await isFavorited(db, user.id, teaId)

  if (favorited) {
    await removeFavorite(db, user.id, teaId)
  } else {
    await addFavorite(db, user.id, teaId)
  }

  revalidatePath(`/browse/${teaId}`)
  revalidatePath('/journal')

  return { favorited: !favorited }
}
