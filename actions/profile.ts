'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { setProfilePublic } from '@/lib/data/users'
import { getCurrentUser } from '@/lib/session'

export async function updateProfileVisibility(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  await setProfilePublic(db, user.id, formData.get('profilePublic') === 'true')

  revalidatePath('/settings')
  revalidatePath(`/u/${user.id}`)
}
