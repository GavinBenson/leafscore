/** Strict positive safe-integer id parse; null for anything else (abc, 1.5, 1e99, 0, -1). */
export function parseId(id: string | string[] | number | null | undefined): number | null {
  const raw = Array.isArray(id) ? id[0] : id
  if (raw == null) return null
  const s = String(raw)
  return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Number(s) : null
}

export const MAX_PAGE = 1000

/** Page query param -> integer in [1, max]; anything unparseable becomes 1. */
export function clampPage(value: string | string[] | undefined, max = MAX_PAGE): number {
  const n = parseId(value)
  return n === null ? 1 : Math.min(n, max)
}
