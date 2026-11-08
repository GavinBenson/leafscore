'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { revalidateTeaCaches } from '@/lib/cache'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { deleteTea as deleteTeaRow } from '@/lib/data/teaAdmin'
import { parseId } from '@/lib/ids'
import { requireAdmin } from '@/lib/requireAdmin'
import { validateTeaInput } from '@/lib/validation/tea'

export async function createTea(formData: FormData) {
  await requireAdmin()

  const parsed = validateTeaInput({
    name: formData.get('name'),
    brandId: formData.get('brandId'),
    type: formData.get('type'),
    subtype: formData.get('subtype'),
    origin: formData.get('origin'),
    caffeineLevel: formData.get('caffeineLevel'),
    leafStyle: formData.get('leafStyle'),
  })
  if (!parsed.ok) throw new Error(parsed.error)
  const v = parsed.value

  await db.insert(schema.teas).values({
    name: v.name,
    brandId: v.brandId ?? undefined,
    type: v.type,
    subtype: v.subtype ?? undefined,
    origin: v.origin ?? undefined,
    caffeineLevel: v.caffeineLevel ?? undefined,
    leafStyle: v.leafStyle ?? undefined,
  })

  revalidateTeaCaches()
  revalidatePath('/admin/teas')
  revalidatePath('/browse')
  redirect('/admin/teas')
}

export async function deleteTea(rawTeaId: number): Promise<{ ok: false; message: string }> {
  await requireAdmin()

  const teaId = parseId(rawTeaId)
  if (teaId === null) return { ok: false, message: 'Invalid tea.' }

  const result = await deleteTeaRow(db, teaId)
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === 'has_reviews'
          ? `This tea has ${result.reviewCount} review${result.reviewCount === 1 ? '' : 's'} and cannot be deleted.`
          : 'That tea no longer exists.',
    }
  }

  revalidateTeaCaches()
  revalidatePath('/admin/teas')
  revalidatePath('/browse')
  redirect('/admin/teas')
}
