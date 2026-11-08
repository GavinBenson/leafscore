// Pure SEO rules for curated lists (PBI 44). No database access here.

/** Lists with fewer teas are thin content: noindex and no sitemap entry. */
export const MIN_TEAS_FOR_INDEX = 2

export function isListIndexable(teaCount: number): boolean {
  return teaCount >= MIN_TEAS_FOR_INDEX
}

type SitemapListInput = {
  id: number
  isPublic: boolean
  hidden: boolean
  ownerBanned?: boolean
  teaCount: number
  updatedAt?: Date | string | null
}

/** A list is in the sitemap only when everyone can see it and it is not thin. */
export function isListSitemapEligible(list: Pick<SitemapListInput, 'isPublic' | 'hidden' | 'ownerBanned' | 'teaCount'>): boolean {
  return list.isPublic && !list.hidden && !list.ownerBanned && isListIndexable(list.teaCount)
}

export function listSitemapEntries(lists: SitemapListInput[], baseUrl: string) {
  return lists.filter(isListSitemapEligible).map((list) => ({
    url: `${baseUrl}/lists/${list.id}`,
    lastModified: list.updatedAt ? new Date(list.updatedAt) : undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }))
}

export function listMetaDescription(list: { title: string; description: string | null }, teaCount: number): string {
  const count = `${teaCount} ${teaCount === 1 ? 'tea' : 'teas'}`
  const lead = list.description?.replace(/\s+/g, ' ').trim()
  const text = lead ? `${lead} (${count})` : `A curated list of ${count} on LeafScore: ${list.title}.`
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}
