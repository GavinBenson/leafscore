import { describe, expect, it } from 'vitest'
import { PLAN_PRICES, savingsPercent, subscriptionState } from './billing'

describe('savingsPercent', () => {
  it('derives 33% from the current plan prices', () => {
    expect(savingsPercent(PLAN_PRICES.monthly, PLAN_PRICES.yearly)).toBe(33)
  })
  it('handles other prices and bad input', () => {
    expect(savingsPercent(10, 60)).toBe(50)
    expect(savingsPercent(5, 100)).toBe(0)
    expect(savingsPercent(0, 40)).toBe(0)
  })
})

describe('subscriptionState', () => {
  const end = new Date('2027-01-15T12:00:00Z')

  it('says renews when not canceling', () => {
    expect(
      subscriptionState({ isPremium: true, cancelAtPeriodEnd: false, premiumExpiresAt: end }),
    ).toEqual({ kind: 'renews', label: 'Renews on January 15, 2027' })
  })
  it('says cancels when cancel_at_period_end is set', () => {
    expect(
      subscriptionState({ isPremium: true, cancelAtPeriodEnd: true, premiumExpiresAt: end }),
    ).toEqual({ kind: 'cancels', label: 'Cancels on January 15, 2027' })
  })
  it('is none for free users or a missing date', () => {
    expect(subscriptionState({ isPremium: false, cancelAtPeriodEnd: true, premiumExpiresAt: end }).kind).toBe('none')
    expect(subscriptionState({ isPremium: true, cancelAtPeriodEnd: false, premiumExpiresAt: null }).kind).toBe('none')
  })
})
