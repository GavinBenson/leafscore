'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/session'

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) throw new Error('Forbidden')
  return user
}

export async function createTea(formData: FormData) {
  await requireAdmin()

  const name = formData.get('name') as string
  const brandIdRaw = formData.get('brandId') as string
  const type = formData.get('type') as string
  const subtype = (formData.get('subtype') as string) || undefined
  const origin = (formData.get('origin') as string) || undefined
  const caffeineLevel = (formData.get('caffeineLevel') as string) || undefined
  const leafStyle = (formData.get('leafStyle') as string) || undefined

  await db.insert(schema.teas).values({
    name,
    brandId: brandIdRaw ? Number(brandIdRaw) : undefined,
    type,
    subtype,
    origin,
    caffeineLevel: caffeineLevel as 'low' | 'medium' | 'high' | undefined,
    leafStyle: leafStyle as 'loose' | 'bag' | 'cake' | 'powder' | undefined,
  })

  revalidatePath('/admin/teas')
  revalidatePath('/browse')
  redirect('/admin/teas')
}

export async function deleteTea(teaId: number) {
  await requireAdmin()

  await db.delete(schema.teas).where(eq(schema.teas.id, teaId))

  revalidatePath('/admin/teas')
  revalidatePath('/browse')
  redirect('/admin/teas')
}
