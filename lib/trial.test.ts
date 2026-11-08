import { describe, expect, it } from 'vitest'
import { trialLabel } from './billing'
import { parseEnv } from './env'

describe('trial config', () => {
  it('labels only when a trial exists', () => {
    expect(trialLabel(0)).toBeNull()
    expect(trialLabel(7)).toContain('7-day')
  })
  it('parses STRIPE_TRIAL_DAYS as an integer 0-30, default 0', () => {
    const days = (v?: string) =>
      parseEnv(v === undefined ? {} : { STRIPE_TRIAL_DAYS: v }, { production: false }).env.stripe.trialDays
    expect(days()).toBe(0)
    expect(days('14')).toBe(14)
    expect(days('30')).toBe(30)
    expect(days('31')).toBe(0)
    expect(days('-1')).toBe(0)
    expect(days('1.5')).toBe(0)
    expect(days('abc')).toBe(0)
  })
})
