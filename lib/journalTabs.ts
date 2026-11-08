// Journal tab helpers (pure, so they can be tested without React).
export const JOURNAL_TABS = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'taste', label: 'Taste' },
  { key: 'sessions', label: 'Sessions' },
] as const

export type JournalTab = (typeof JOURNAL_TABS)[number]['key']

/** Unknown or missing ?tab= values fall back to the reviews tab. */
export function resolveJournalTab(value: string | string[] | undefined): JournalTab {
  const raw = Array.isArray(value) ? value[0] : value
  return JOURNAL_TABS.find((t) => t.key === raw)?.key ?? 'reviews'
}

// Page params from any tab; a page number from one list means nothing in another.
const PAGE_PARAMS = ['page', 'rpage', 'fpage']

/** URL for switching to `tab`: keeps unrelated params, drops every page param. */
export function journalTabHref(tab: JournalTab, current: URLSearchParams | string): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString())
  for (const name of PAGE_PARAMS) params.delete(name)
  if (tab === 'reviews') params.delete('tab')
  else params.set('tab', tab)
  const qs = params.toString()
  return `/journal${qs ? `?${qs}` : ''}`
}
