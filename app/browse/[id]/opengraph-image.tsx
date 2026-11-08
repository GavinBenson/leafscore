import { db } from '@/db/client'
import { getTeaSeo } from '@/lib/data/seo'
import { parseId } from '@/lib/seo'
import { ogSize, ogNotFound, ogUnavailable, renderOg } from '@/lib/ogImage'

export const alt = 'Tea rating on LeafScore'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const teaId = parseId((await params).id)
  if (teaId === null) return ogNotFound()
  let tea: Awaited<ReturnType<typeof getTeaSeo>>
  try {
    tea = await getTeaSeo(db, teaId)
  } catch {
    return ogUnavailable()
  }
  if (!tea) return ogNotFound()
  return renderOg({
    title: tea.name,
    subtitle: tea.brandName ?? tea.type,
    score: (tea.reviewCount ?? 0) > 0 ? tea.leafScore : null,
  })
}
