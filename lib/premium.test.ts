import { describe, expect, it } from 'vitest'
import { canAddToWishlist, FREE_WISHLIST_LIMIT } from './premium'

describe('canAddToWishlist', () => {
  it('stops free accounts at the limit', () => {
    expect(canAddToWishlist(false, FREE_WISHLIST_LIMIT - 1)).toBe(true)
    expect(canAddToWishlist(false, FREE_WISHLIST_LIMIT)).toBe(false)
  })

  it('never stops premium accounts', () => {
    expect(canAddToWishlist(true, FREE_WISHLIST_LIMIT * 10)).toBe(true)
  })
})
