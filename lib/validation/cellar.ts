export const MAX_CELLAR_NOTES_LENGTH = 500
export const MAX_CELLAR_GRAMS = 1_000_000
export const MAX_CELLAR_PRICE_CENTS = 100_000_000

export type CellarInput = {
  grams: number
  purchasedAt: string | null // YYYY-MM-DD
  priceCents: number | null
  currency: string | null // ISO 4217, upper case
  lowStockGrams: number | null
  notes: string | null
}

export type ParsedCellar =
  | { ok: true; data: CellarInput }
  | { ok: false; field: keyof CellarInput; error: string }

function wholeInRange(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Weights are always grams here; convert from ounces before calling.
export function parseCellarInput(raw: {
  grams?: unknown
  purchasedAt?: unknown
  priceCents?: unknown
  currency?: unknown
  lowStockGrams?: unknown
  notes?: unknown
}): ParsedCellar {
  const grams = wholeInRange(raw.grams, MAX_CELLAR_GRAMS)
  if (grams === null) return { ok: false, field: 'grams', error: 'Enter a whole number of grams, 0 or more.' }

  let purchasedAt: string | null = null
  if (raw.purchasedAt !== undefined && raw.purchasedAt !== null && raw.purchasedAt !== '') {
    if (typeof raw.purchasedAt !== 'string' || !isRealDate(raw.purchasedAt)) {
      return { ok: false, field: 'purchasedAt', error: 'Enter a valid purchase date.' }
    }
    purchasedAt = raw.purchasedAt
  }

  let priceCents: number | null = null
  if (raw.priceCents !== undefined && raw.priceCents !== null) {
    priceCents = wholeInRange(raw.priceCents, MAX_CELLAR_PRICE_CENTS)
    if (priceCents === null) return { ok: false, field: 'priceCents', error: 'Enter a valid price.' }
  }

  let currency: string | null = null
  if (raw.currency !== undefined && raw.currency !== null && raw.currency !== '') {
    const c = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(c)) return { ok: false, field: 'currency', error: 'Use a 3-letter currency code.' }
    currency = c
  }
  if (priceCents !== null && currency === null) {
    return { ok: false, field: 'currency', error: 'Choose a currency for the price.' }
  }
  if (priceCents === null) currency = null

  let lowStockGrams: number | null = null
  if (raw.lowStockGrams !== undefined && raw.lowStockGrams !== null) {
    lowStockGrams = wholeInRange(raw.lowStockGrams, MAX_CELLAR_GRAMS)
    if (lowStockGrams === null) {
      return { ok: false, field: 'lowStockGrams', error: 'Enter a whole number of grams, 0 or more.' }
    }
  }

  let notes: string | null = null
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') return { ok: false, field: 'notes', error: 'Notes must be text.' }
    const n = raw.notes.trim()
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(n)) {
      return { ok: false, field: 'notes', error: "Notes can't contain control characters." }
    }
    if (n.length > MAX_CELLAR_NOTES_LENGTH) {
      return { ok: false, field: 'notes', error: `Notes must be ${MAX_CELLAR_NOTES_LENGTH} characters or fewer.` }
    }
    notes = n === '' ? null : n
  }

  return { ok: true, data: { grams, purchasedAt, priceCents, currency, lowStockGrams, notes } }
}
