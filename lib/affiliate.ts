import { validateHttpsUrl } from '@/lib/validation/tea'

export type AffiliateInput = {
  provider: string
  url: string
  priceCents: number | null
  currency: string | null
  pricePer100gCents: number | null
}

export type AffiliateInputResult = { ok: true; value: AffiliateInput } | { ok: false; error: string }

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

// "12.5" -> 1250. Null for empty; undefined for invalid.
function parseMoney(v: unknown): number | null | undefined {
  const s = str(v)
  if (!s) return null
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return undefined
  return Math.round(Number(s) * 100)
}

export function validateAffiliateInput(raw: {
  provider?: unknown
  url?: unknown
  price?: unknown
  currency?: unknown
  pricePer100g?: unknown
}): AffiliateInputResult {
  const provider = str(raw.provider)
  if (provider.length < 1 || provider.length > 100) {
    return { ok: false, error: 'Vendor name must be 1-100 characters.' }
  }
  const url = validateHttpsUrl(raw.url)
  if (!url.ok || !url.value) return { ok: false, error: 'Enter a valid https:// URL.' }

  const priceCents = parseMoney(raw.price)
  const per100 = parseMoney(raw.pricePer100g)
  if (priceCents === undefined) return { ok: false, error: 'Price must be a number like 12.50.' }
  if (per100 === undefined) return { ok: false, error: 'Price per 100g must be a number like 8.00.' }

  let currency: string | null = str(raw.currency).toUpperCase() || null
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: 'Currency must be a 3-letter code like USD.' }
  }
  if ((priceCents !== null || per100 !== null) && !currency) currency = 'USD'
  if (priceCents === null && per100 === null) currency = null

  return {
    ok: true,
    value: { provider, url: url.value, priceCents, currency, pricePer100gCents: per100 },
  }
}

export function formatMoney(cents: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ''}`.trim()
  }
}

export const AFFILIATE_DISCLOSURE = 'We may earn a commission on purchases through these links.'
