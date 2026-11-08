import { describe, expect, it } from 'vitest'
import { canAddToWishlist, FREE_WISHLIST_LIMIT, hasPremium } from './premium'

describe('hasPremium', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  const hours = (n: number) => new Date(now.getTime() + n * 3_600_000)

  it('is false without the flag, whatever the date', () => {
    expect(hasPremium({ isPremium: false, premiumExpiresAt: hours(100) }, now)).toBe(false)
    expect(hasPremium({ isPremium: null, premiumExpiresAt: null }, now)).toBe(false)
  })

  it('is true with no expiry, as for subscribers from before expiries were tracked', () => {
    expect(hasPremium({ isPremium: true, premiumExpiresAt: null }, now)).toBe(true)
  })

  it('lasts until a day after expiry', () => {
    expect(hasPremium({ isPremium: true, premiumExpiresAt: hours(1) }, now)).toBe(true)
    expect(hasPremium({ isPremium: true, premiumExpiresAt: hours(-23) }, now)).toBe(true)
    expect(hasPremium({ isPremium: true, premiumExpiresAt: hours(-25) }, now)).toBe(false)
  })
})

describe('canAddToWishlist', () => {
  it('stops free accounts at the limit', () => {
    expect(canAddToWishlist(false, FREE_WISHLIST_LIMIT - 1)).toBe(true)
    expect(canAddToWishlist(false, FREE_WISHLIST_LIMIT)).toBe(false)
  })

  it('never stops premium accounts', () => {
    expect(canAddToWishlist(true, FREE_WISHLIST_LIMIT * 10)).toBe(true)
  })
})

describe('list, cellar and session caps', () => {
  it('limits lists by premium status', async () => {
    const p = await import('./premium')
    expect([p.FREE_LIST_LIMIT, p.PREMIUM_LIST_LIMIT, p.MAX_TEAS_PER_LIST, p.FREE_SESSION_LIMIT]).toEqual([3, 50, 200, 3])
    expect(p.canCreateList(false, 2)).toBe(true)
    expect(p.canCreateList(false, 3)).toBe(false)
    expect(p.canCreateList(true, 49)).toBe(true)
    expect(p.canCreateList(true, 50)).toBe(false)
  })

  it('gates the cellar and saved sessions', async () => {
    const p = await import('./premium')
    expect(p.canUseCellar(true)).toBe(true)
    expect(p.canUseCellar(false)).toBe(false)
    expect(p.canSaveSession(false, 2)).toBe(true)
    expect(p.canSaveSession(false, 3)).toBe(false)
    expect(p.canSaveSession(true, 10_000)).toBe(true)
  })
})
