import { describe, expect, it } from 'vitest'
import { JOURNAL_TABS, journalTabHref, resolveJournalTab } from './journalTabs'

describe('journalTabHref', () => {
  it('drops page params when switching tabs', () => {
    expect(journalTabHref('favorites', 'page=3')).toBe('/journal?tab=favorites')
    expect(journalTabHref('reviews', 'tab=wishlist&page=3&rpage=2&fpage=4')).toBe('/journal')
  })
  it('keeps unrelated params', () => {
    expect(journalTabHref('wishlist', new URLSearchParams('x=1&page=2'))).toBe('/journal?x=1&tab=wishlist')
  })
  it('uses the bare path for the default tab', () => {
    expect(journalTabHref('reviews', '')).toBe('/journal')
  })
})

describe('sessions tab', () => {
  it('is a known tab', () => {
    expect(resolveJournalTab('sessions')).toBe('sessions')
    expect(JOURNAL_TABS.map((t) => t.key)).toContain('sessions')
  })
  it('builds its link and drops page params', () => {
    expect(journalTabHref('sessions', 'page=2')).toBe('/journal?tab=sessions')
    expect(journalTabHref('reviews', 'tab=sessions&page=2')).toBe('/journal')
  })
})

describe('resolveJournalTab', () => {
  it('accepts known tabs', () => {
    expect(resolveJournalTab('favorites')).toBe('favorites')
    expect(resolveJournalTab(['wishlist', 'x'])).toBe('wishlist')
  })
  it('falls back to reviews', () => {
    expect(resolveJournalTab(undefined)).toBe('reviews')
    expect(resolveJournalTab('nope')).toBe('reviews')
    expect(resolveJournalTab('')).toBe('reviews')
  })
})
