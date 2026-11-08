'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { setDigestOptIn } from '@/lib/data/digest'
import { getCurrentUser } from '@/lib/session'

export async function updateDigestPreference(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // Unchecked checkboxes are absent from FormData, so absence means opted out.
  await setDigestOptIn(db, user.id, formData.get('digestOptIn') === 'on')
  revalidatePath('/settings')
}
