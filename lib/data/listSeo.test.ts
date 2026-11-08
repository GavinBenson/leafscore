import { describe, expect, it } from 'vitest'
import { isListIndexable, isListSitemapEligible, listMetaDescription, listSitemapEntries } from './listSeo'

describe('list SEO rules', () => {
  it('indexes lists with at least 2 teas only', () => {
    expect(isListIndexable(0)).toBe(false)
    expect(isListIndexable(1)).toBe(false)
    expect(isListIndexable(2)).toBe(true)
  })

  it('sitemap needs public, not hidden, author not banned and 2+ teas', () => {
    const ok = { isPublic: true, hidden: false, ownerBanned: false, teaCount: 2 }
    expect(isListSitemapEligible(ok)).toBe(true)
    expect(isListSitemapEligible({ ...ok, isPublic: false })).toBe(false)
    expect(isListSitemapEligible({ ...ok, hidden: true })).toBe(false)
    expect(isListSitemapEligible({ ...ok, ownerBanned: true })).toBe(false)
    expect(isListSitemapEligible({ ...ok, teaCount: 1 })).toBe(false)
  })

  it('builds entries only for eligible lists, tolerating JSON dates', () => {
    const entries = listSitemapEntries(
      [
        { id: 1, isPublic: true, hidden: false, teaCount: 3, updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 2, isPublic: true, hidden: true, teaCount: 3 },
        { id: 3, isPublic: true, hidden: false, teaCount: 1 },
        { id: 4, isPublic: false, hidden: false, teaCount: 9 },
      ],
      'https://x.test',
    )
    expect(entries.map((e) => e.url)).toEqual(['https://x.test/lists/1'])
    expect(entries[0].lastModified).toEqual(new Date('2026-01-02T00:00:00.000Z'))
  })

  it('writes a bounded meta description', () => {
    expect(listMetaDescription({ title: 'T', description: null }, 1)).toContain('1 tea')
    expect(listMetaDescription({ title: 'T', description: 'Best\n\n oolongs' }, 4)).toBe('Best oolongs (4 teas)')
    expect(listMetaDescription({ title: 'T', description: 'x'.repeat(500) }, 4).length).toBeLessThanOrEqual(200)
  })
})
