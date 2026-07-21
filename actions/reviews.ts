'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { createReview, deleteReview } from '@/lib/data/reviews'
import { getCurrentUser } from '@/lib/session'

export async function submitReview(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const teaId = Number(formData.get('teaId'))
  const score = Number(formData.get('score'))
  const brewMethod = formData.get('brewMethod') as
    | 'gongfu'
    | 'western'
    | 'cold_brew'
    | 'grandpa'
    | null
  const brewTemp = formData.get('brewTemp')
    ? Number(formData.get('brewTemp'))
    : undefined
  const steepTime = formData.get('steepTime')
    ? Number(formData.get('steepTime'))
    : undefined
  const notes = (formData.get('notes') as string) || undefined
  const wouldDrinkAgain = formData.get('wouldDrinkAgain') === 'true'
    ? true
    : formData.get('wouldDrinkAgain') === 'false'
      ? false
      : undefined

  const tagIdsRaw = formData.get('tagIds') as string | null
  const tagIds = tagIdsRaw
    ? tagIdsRaw.split(',').map(Number).filter((n) => !isNaN(n))
    : undefined

  await createReview(
    db,
    {
      teaId,
      userId: user.id,
      score,
      brewMethod: brewMethod ?? undefined,
      brewTemp,
      steepTime,
      notes,
      wouldDrinkAgain,
    },
    tagIds,
  )

  revalidatePath('/browse/' + teaId)
  redirect('/browse/' + teaId)
}

export async function removeReview(reviewId: number, teaId: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  await deleteReview(db, reviewId, user.id)

  revalidatePath('/browse/' + teaId)
  redirect('/browse/' + teaId)
}
