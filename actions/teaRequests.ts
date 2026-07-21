'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import {
  createTeaRequest,
  updateRequestStatus,
} from '@/lib/data/teaRequests'
import { getCurrentUser } from '@/lib/session'

export async function submitTeaRequest(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const name = formData.get('name') as string
  const brand = (formData.get('brand') as string) || undefined
  const type = (formData.get('type') as string) || undefined

  await createTeaRequest(db, { userId: user.id, name, brand, type })

  revalidatePath('/journal')
}

export async function handleTeaRequest(
  requestId: number,
  status: 'approved' | 'rejected',
) {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) throw new Error('Forbidden')

  await updateRequestStatus(db, requestId, status)

  revalidatePath('/admin/requests')
}
