import { describe, expect, it } from 'vitest'
import { buildCellarRaw, centsToInputValue, gramsToInputValue, isLowStock, parsePriceToCents } from './cellar'

const base = { amount: '', purchasedAt: '', price: '', currency: '', lowStock: '', notes: '' }

describe('isLowStock', () => {
  it('is true at or below the threshold, false above, false without one', () => {
    expect(isLowStock(10, 20)).toBe(true)
    expect(isLowStock(20, 20)).toBe(true)
    expect(isLowStock(21, 20)).toBe(false)
    expect(isLowStock(0, 0)).toBe(true)
    expect(isLowStock(5, null)).toBe(false)
    expect(isLowStock(5, undefined)).toBe(false)
  })
})

describe('parsePriceToCents', () => {
  it('accepts plain decimals', () => {
    expect(parsePriceToCents('12')).toBe(1200)
    expect(parsePriceToCents('12.5')).toBe(1250)
    expect(parsePriceToCents(' 12,05 ')).toBe(1205)
    expect(parsePriceToCents('0.99')).toBe(99)
  })
  it('rejects everything else', () => {
    for (const bad of ['', '-1', '$5', '1e3', '1.234', 'abc']) expect(parsePriceToCents(bad)).toBeNull()
  })
})

describe('buildCellarRaw', () => {
  it('reads grams as typed', () => {
    const r = buildCellarRaw({ ...base, amount: '50', lowStock: '10' }, 'g')
    expect(r).toMatchObject({ ok: true, raw: { grams: 50, lowStockGrams: 10, priceCents: null, currency: null } })
  })
  it('converts ounces to whole grams', () => {
    const r = buildCellarRaw({ ...base, amount: '1', lowStock: '0.5' }, 'oz')
    expect(r).toMatchObject({ ok: true, raw: { grams: 28, lowStockGrams: 14 } })
  })
  it('defaults the currency when a price is given', () => {
    expect(buildCellarRaw({ ...base, amount: '5', price: '3' }, 'g')).toMatchObject({
      ok: true,
      raw: { priceCents: 300, currency: 'USD' },
    })
  })
  it('names the failing field', () => {
    expect(buildCellarRaw({ ...base, amount: 'x' }, 'g')).toMatchObject({ ok: false, field: 'amount' })
    expect(buildCellarRaw({ ...base, amount: '5', lowStock: '-2' }, 'g')).toMatchObject({ ok: false, field: 'lowStock' })
    expect(buildCellarRaw({ ...base, amount: '5', price: 'free' }, 'g')).toMatchObject({ ok: false, field: 'price' })
  })
})

describe('input value helpers', () => {
  it('round-trips display values', () => {
    expect(gramsToInputValue(50, 'g')).toBe('50')
    expect(gramsToInputValue(57, 'oz')).toBe('2.01')
    expect(gramsToInputValue(null, 'g')).toBe('')
    expect(centsToInputValue(1250)).toBe('12.50')
    expect(centsToInputValue(null)).toBe('')
  })
})
