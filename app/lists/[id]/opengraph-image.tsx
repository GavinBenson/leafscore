import { db } from '@/db/client'
import { getListWithTeas } from '@/lib/data/lists'
import { parseId } from '@/lib/seo'
import { ogSize, ogNotFound, ogUnavailable, renderOg } from '@/lib/ogImage'

export const alt = 'Tea list on LeafScore'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const listId = parseId((await params).id)
  if (listId === null) return ogNotFound()
  let data: Awaited<ReturnType<typeof getListWithTeas>>
  try {
    // No viewer: private, hidden and banned-author lists are not found.
    data = await getListWithTeas(db, listId)
  } catch {
    return ogUnavailable()
  }
  if (!data) return ogNotFound()
  const count = data.teas.length
  return renderOg({ title: data.list.title, subtitle: `${count} ${count === 1 ? 'tea' : 'teas'} on LeafScore` })
}
