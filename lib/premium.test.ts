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
