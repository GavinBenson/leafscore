import { describe, expect, it } from 'vitest'
import {
  cheapestLinkId,
  formatPrice,
  formatPricePer100g,
  hasComparablePrices,
  pricePer100g,
  sortLinksByPrice,
} from './priceFormat'

const link = (id: number, per: number | null, currency: string | null = 'USD') => ({
  id,
  priceCents: per === null ? null : per * 5,
  currency,
  pricePer100gCents: per,
})

describe('pricePer100g', () => {
  it('reads the stored field', () => {
    expect(pricePer100g(link(1, 800))).toEqual({ cents: 800, currency: 'USD' })
  })
  it('is null when missing or invalid', () => {
    expect(pricePer100g(link(1, null))).toBeNull()
    expect(pricePer100g({ id: 1, pricePer100gCents: -5 })).toBeNull()
    expect(pricePer100g({ id: 1, pricePer100gCents: Number.NaN })).toBeNull()
    expect(pricePer100g({ id: 1 })).toBeNull()
  })
  it('defaults the currency and upper-cases it', () => {
    expect(pricePer100g({ id: 1, pricePer100gCents: 100, currency: null })?.currency).toBe('USD')
    expect(pricePer100g({ id: 1, pricePer100gCents: 100, currency: 'eur' })?.currency).toBe('EUR')
  })
})

describe('formatting', () => {
  it('uses the stored currency', () => {
    expect(formatPrice(800, 'USD')).toBe('$8.00')
    expect(formatPrice(800, 'EUR')).toContain('8.00')
    expect(formatPrice(800, 'EUR')).not.toContain('$')
  })
  it('falls back on a bad currency code', () => {
    expect(formatPrice(800, 'ZZZZ')).toBe('8.00 ZZZZ')
  })
  it('formats per 100 g or returns null', () => {
    expect(formatPricePer100g(link(1, 1250))).toBe('$12.50 / 100 g')
    expect(formatPricePer100g(link(1, null))).toBeNull()
  })
})

describe('sortLinksByPrice and cheapestLinkId', () => {
  it('orders ascending with missing values last and does not mutate', () => {
    const input = [link(1, null), link(2, 900), link(3, 400), link(4, null), link(5, 650)]
    const copy = [...input]
    expect(sortLinksByPrice(input).map((l) => l.id)).toEqual([3, 5, 2, 1, 4])
    expect(input).toEqual(copy)
    expect(cheapestLinkId(input)).toBe(3)
  })
  it('is stable for ties (earliest wins)', () => {
    const input = [link(7, 500), link(3, 500)]
    expect(sortLinksByPrice(input).map((l) => l.id)).toEqual([7, 3])
    expect(cheapestLinkId(input)).toBe(7)
  })
  it('never compares across currencies: the dominant currency leads', () => {
    const input = [link(1, 100, 'JPY'), link(2, 900), link(3, 700)]
    expect(sortLinksByPrice(input).map((l) => l.id)).toEqual([3, 2, 1])
    expect(cheapestLinkId(input)).toBe(3)
  })
  it('returns null when nothing has a price', () => {
    expect(cheapestLinkId([link(1, null), link(2, null)])).toBeNull()
    expect(cheapestLinkId([])).toBeNull()
  })
  it('hasComparablePrices needs two prices in one currency', () => {
    expect(hasComparablePrices([link(1, 100)])).toBe(false)
    expect(hasComparablePrices([link(1, 100), link(2, 200)])).toBe(true)
    expect(hasComparablePrices([link(1, 100), link(2, 200, 'EUR')])).toBe(false)
  })
})
