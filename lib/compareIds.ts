// Pure helpers for the comparison tray and /compare?ids= (PBI 48).
import { parseId } from '@/lib/ids'

export const MAX_COMPARE = 3

export type ParsedCompareIds = {
  /** Distinct valid ids in the order given, at most MAX_COMPARE. */
  ids: number[]
  /** Entries that were not valid ids. */
  invalid: number
  /** Valid distinct ids dropped because only MAX_COMPARE are compared. */
  overflow: number
}

/** "1,2,3" (or a repeated param) -> validated ids. Never throws. */
export function parseCompareIds(raw: string | string[] | null | undefined): ParsedCompareIds {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
  const parts = text.split(',').map((p) => p.trim()).filter((p) => p !== '')
  const seen = new Set<number>()
  let invalid = 0
  for (const part of parts.slice(0, 200)) {
    const id = parseId(part)
    if (id === null) invalid += 1
    else seen.add(id)
  }
  const all = [...seen]
  return { ids: all.slice(0, MAX_COMPARE), invalid, overflow: Math.max(0, all.length - MAX_COMPARE) }
}

export function compareHref(ids: readonly number[]): string {
  return `/compare?ids=${ids.join(',')}`
}

/** Toggle an id in the tray: removes if present, adds if there is room, otherwise unchanged. */
export function toggleCompareId(tray: readonly number[], id: number): { tray: number[]; changed: 'added' | 'removed' | 'full' } {
  if (tray.includes(id)) return { tray: tray.filter((x) => x !== id), changed: 'removed' }
  if (tray.length >= MAX_COMPARE) return { tray: [...tray], changed: 'full' }
  return { tray: [...tray, id], changed: 'added' }
}

/** Parse the stored tray defensively (bad JSON, wrong types, too many, duplicates). */
export function parseStoredTray(stored: string | null | undefined): number[] {
  if (!stored) return []
  try {
    const value: unknown = JSON.parse(stored)
    if (!Array.isArray(value)) return []
    return parseCompareIds(value.filter((v) => typeof v === 'number' || typeof v === 'string').join(',')).ids
  } catch {
    return []
  }
}
