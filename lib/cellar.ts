// Pure helpers for the tea cellar (PBI 45). Stored values are grams and cents.
import { gramsToOunces, parseWeightInput, type WeightUnit } from '@/lib/units'

/** Low stock: a threshold is set and the amount is at or below it. */
export function isLowStock(grams: number, lowStockGrams: number | null | undefined): boolean {
  return lowStockGrams != null && grams <= lowStockGrams
}

/** "12", "12.5", "12,50" -> cents; null for anything else (no signs, exponents or symbols). */
export function parsePriceToCents(text: string): number | null {
  const s = typeof text === 'string' ? text.trim().replace(',', '.') : ''
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

export type CellarFormValues = {
  amount: string
  purchasedAt: string
  price: string
  currency: string
  lowStock: string
  notes: string
}

export type CellarRawResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; field: keyof CellarFormValues; error: string }

// Converts what the person typed (in their weight unit) to the grams/cents the
// validator and the database use. Blank optional fields become null.
export function buildCellarRaw(values: CellarFormValues, unit: WeightUnit): CellarRawResult {
  const grams = parseWeightInput(values.amount, unit)
  if (grams === null) {
    return { ok: false, field: 'amount', error: `Enter the amount you own in ${unit === 'oz' ? 'ounces' : 'grams'}.` }
  }
  let lowStockGrams: number | null = null
  if (values.lowStock.trim() !== '') {
    lowStockGrams = parseWeightInput(values.lowStock, unit)
    if (lowStockGrams === null) {
      return { ok: false, field: 'lowStock', error: `Enter a number of ${unit === 'oz' ? 'ounces' : 'grams'}.` }
    }
  }
  let priceCents: number | null = null
  if (values.price.trim() !== '') {
    priceCents = parsePriceToCents(values.price)
    if (priceCents === null) return { ok: false, field: 'price', error: 'Enter a price such as 12.50.' }
  }
  return {
    ok: true,
    raw: {
      grams,
      purchasedAt: values.purchasedAt.trim() || null,
      priceCents,
      currency: values.currency.trim() || (priceCents !== null ? 'USD' : null),
      lowStockGrams,
      notes: values.notes,
    },
  }
}

/** Stored grams -> text for an input in the person's unit ("50", "1.76"). */
export function gramsToInputValue(grams: number | null | undefined, unit: WeightUnit): string {
  if (grams == null || !Number.isFinite(grams)) return ''
  if (unit === 'g') return String(Math.round(grams))
  return String(Math.round(gramsToOunces(grams) * 100) / 100)
}

/** Stored cents -> text for a price input ("12.50"). */
export function centsToInputValue(cents: number | null | undefined): string {
  return cents == null || !Number.isFinite(cents) ? '' : (cents / 100).toFixed(2)
}
