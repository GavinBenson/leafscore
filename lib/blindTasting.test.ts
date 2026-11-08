import { describe, expect, it } from 'vitest'
import { shouldHideCommunityData } from '@/lib/blindTasting'

describe('shouldHideCommunityData', () => {
  it('hides only when signed in, blind mode is on and the tea is not reviewed', () => {
    expect(shouldHideCommunityData({ blindMode: true, signedIn: true, hasReviewed: false })).toBe(true)
  })

  it.each([
    [{ blindMode: true, signedIn: true, hasReviewed: true }],
    [{ blindMode: false, signedIn: true, hasReviewed: false }],
    [{ blindMode: false, signedIn: true, hasReviewed: true }],
    [{ blindMode: true, signedIn: false, hasReviewed: false }],
    [{ blindMode: false, signedIn: false, hasReviewed: false }],
  ])('shows everything for %j', (input) => {
    expect(shouldHideCommunityData(input)).toBe(false)
  })
})
