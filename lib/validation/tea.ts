import { parseId } from '@/lib/ids'
import { safeHttpUrl } from '@/lib/safeUrl'

import { TEA_TYPES } from '@/lib/teaTypes'

export const CAFFEINE_LEVELS = ['low', 'medium', 'high'] as const
export const LEAF_STYLES = ['loose', 'bag', 'cake', 'powder'] as const
export const TEA_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const

export type TeaInput = {
  name: string
  brandId: number | null
  type: (typeof TEA_TYPES)[number]
  subtype: string | null
  origin: string | null
  caffeineLevel: (typeof CAFFEINE_LEVELS)[number] | null
  leafStyle: (typeof LEAF_STYLES)[number] | null
}

export type TeaInputResult = { ok: true; value: TeaInput } | { ok: false; error: string }

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function pick<T extends string>(list: readonly T[], v: string): T | undefined {
  return list.find((x) => x === v)
}

export function validateTeaInput(raw: {
  name?: unknown
  brandId?: unknown
  type?: unknown
  subtype?: unknown
  origin?: unknown
  caffeineLevel?: unknown
  leafStyle?: unknown
}): TeaInputResult {
  const name = text(raw.name)
  if (name.length < 1 || name.length > 200) return { ok: false, error: 'Name must be 1-200 characters.' }

  const type = pick(TEA_TYPES, text(raw.type))
  if (!type) return { ok: false, error: 'Choose a valid tea type.' }

  const brandRaw = text(raw.brandId)
  let brandId: number | null = null
  if (brandRaw) {
    brandId = parseId(brandRaw)
    if (brandId === null) return { ok: false, error: 'Invalid brand.' }
  }

  const subtype = text(raw.subtype)
  const origin = text(raw.origin)
  if (subtype.length > 100 || origin.length > 100) {
    return { ok: false, error: 'Subtype and origin must be 100 characters or fewer.' }
  }

  const caffeineRaw = text(raw.caffeineLevel)
  const caffeineLevel = caffeineRaw ? pick(CAFFEINE_LEVELS, caffeineRaw) : undefined
  if (caffeineRaw && !caffeineLevel) return { ok: false, error: 'Invalid caffeine level.' }

  const leafRaw = text(raw.leafStyle)
  const leafStyle = leafRaw ? pick(LEAF_STYLES, leafRaw) : undefined
  if (leafRaw && !leafStyle) return { ok: false, error: 'Invalid leaf style.' }

  return {
    ok: true,
    value: {
      name,
      brandId,
      type,
      subtype: subtype || null,
      origin: origin || null,
      caffeineLevel: caffeineLevel ?? null,
      leafStyle: leafStyle ?? null,
    },
  }
}

export function parseTeaRequestStatus(v: unknown): (typeof TEA_REQUEST_STATUSES)[number] | null {
  return typeof v === 'string' ? (pick(TEA_REQUEST_STATUSES, v) ?? null) : null
}

/** https-only URL for admin-entered links; empty input is allowed and yields null. */
export function validateHttpsUrl(v: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = text(v)
  if (!s) return { ok: true, value: null }
  const u = safeHttpUrl(s)
  return u ? { ok: true, value: u } : { ok: false }
}
