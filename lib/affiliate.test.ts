import { describe, expect, it } from 'vitest'
import { validateAffiliateInput } from './affiliate'

describe('validateAffiliateInput', () => {
  it('accepts https with prices', () => {
    const r = validateAffiliateInput({ provider: ' Shop ', url: 'https://shop.example/t', price: '12.5', pricePer100g: '8' })
    expect(r).toEqual({
      ok: true,
      value: { provider: 'Shop', url: 'https://shop.example/t', priceCents: 1250, currency: 'USD', pricePer100gCents: 800 },
    })
  })
  it('rejects non-https, bad prices and currency', () => {
    expect(validateAffiliateInput({ provider: 'a', url: 'http://x.example' }).ok).toBe(false)
    expect(validateAffiliateInput({ provider: 'a', url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validateAffiliateInput({ provider: 'a', url: '' }).ok).toBe(false)
    expect(validateAffiliateInput({ provider: '', url: 'https://x.example' }).ok).toBe(false)
    expect(validateAffiliateInput({ provider: 'a', url: 'https://x.example', price: '-1' }).ok).toBe(false)
    expect(validateAffiliateInput({ provider: 'a', url: 'https://x.example', price: '1', currency: 'dollars' }).ok).toBe(false)
  })
  it('has no currency without a price', () => {
    const r = validateAffiliateInput({ provider: 'a', url: 'https://x.example', currency: 'eur' })
    expect(r.ok && r.value.currency).toBeNull()
  })
})
