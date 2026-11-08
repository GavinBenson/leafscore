'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { revalidateTeaCaches } from '@/lib/cache'
import { validateAffiliateInput } from '@/lib/affiliate'
import { createAffiliateLink, deleteAffiliateLink, updateAffiliateLink } from '@/lib/data/affiliate'
import { parseId } from '@/lib/ids'
import { requireAdmin } from '@/lib/requireAdmin'

// The tea page reads links through the tagged data cache, so each write also
// expires that tea's cache entry (not just the path).
function back(teaId: number, error?: string): never {
  const base = `/admin/teas/${teaId}/affiliate`
  revalidatePath(base)
  revalidatePath(`/browse/${teaId}`)
  redirect(error ? `${base}?error=${encodeURIComponent(error)}` : base)
}

// With a linkId it edits that link, otherwise it adds one.
export async function saveAffiliateLink(formData: FormData) {
  await requireAdmin()
  const teaId = parseId(String(formData.get('teaId') ?? ''))
  if (teaId === null) throw new Error('Invalid tea')

  const parsed = validateAffiliateInput({
    provider: formData.get('provider'),
    url: formData.get('url'),
    price: formData.get('price'),
    currency: formData.get('currency'),
    pricePer100g: formData.get('pricePer100g'),
  })
  if (!parsed.ok) back(teaId, parsed.error)

  const linkRaw = String(formData.get('linkId') ?? '')
  if (linkRaw) {
    const linkId = parseId(linkRaw)
    if (linkId === null || !(await updateAffiliateLink(db, linkId, teaId, parsed.value))) {
      back(teaId, 'That link no longer exists.')
    }
  } else {
    await createAffiliateLink(db, teaId, parsed.value)
  }
  revalidateTeaCaches(teaId)
  back(teaId)
}

export async function removeAffiliateLink(formData: FormData) {
  await requireAdmin()
  const teaId = parseId(String(formData.get('teaId') ?? ''))
  const linkId = parseId(String(formData.get('linkId') ?? ''))
  if (teaId === null || linkId === null) throw new Error('Invalid request')
  await deleteAffiliateLink(db, linkId, teaId)
  revalidateTeaCaches(teaId)
  back(teaId)
}
