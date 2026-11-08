import { db } from '@/db/client'
import { getBrandSeo } from '@/lib/data/seo'
import { parseId } from '@/lib/seo'
import { ogSize, ogNotFound, ogUnavailable, renderOg } from '@/lib/ogImage'

export const alt = 'Tea brand on LeafScore'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const brandId = parseId((await params).id)
  if (brandId === null) return ogNotFound()
  let brand: Awaited<ReturnType<typeof getBrandSeo>>
  try {
    brand = await getBrandSeo(db, brandId)
  } catch {
    return ogUnavailable()
  }
  if (!brand) return ogNotFound()
  return renderOg({ title: brand.name, subtitle: brand.country })
}
