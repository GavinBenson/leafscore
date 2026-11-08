import { BREW_METHODS } from './review'

export const MAX_SESSION_NOTES_LENGTH = 1_000
export const MAX_INFUSION_NOTE_LENGTH = 300
export const MAX_INFUSIONS_PER_SESSION = 40
export const MIN_INFUSION_SECONDS = 1
export const MAX_INFUSION_SECONDS = 3_600

export type InfusionInput = { seconds: number; rating: number | null; note: string | null }
export type SessionInput = {
  teaId: number
  method: string | null
  tempC: number | null
  gramsUsed: number | null
  notes: string | null
  infusions: InfusionInput[]
}

export type ParsedSession = { ok: true; data: SessionInput } | { ok: false; error: string }

const whole = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

function optText(
  v: unknown,
  max: number,
  label: string,
): { ok: true; v: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, v: null }
  if (typeof v !== 'string') return { ok: false, error: `${label} must be text.` }
  const s = v.trim()
  if (CONTROL.test(s)) return { ok: false, error: `${label} can't contain control characters.` }
  if (s.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` }
  return { ok: true, v: s === '' ? null : s }
}

// Step numbers are assigned from the order of the infusions (1, 2, 3...).
export function parseSessionInput(raw: {
  teaId?: unknown
  method?: unknown
  tempC?: unknown
  gramsUsed?: unknown
  notes?: unknown
  infusions?: unknown
}): ParsedSession {
  if (!whole(raw.teaId, 1, 2_147_483_647)) return { ok: false, error: 'Choose a tea.' }
  let method: string | null = null
  if (raw.method !== undefined && raw.method !== null && raw.method !== '') {
    if (typeof raw.method !== 'string' || !(BREW_METHODS as readonly string[]).includes(raw.method)) {
      return { ok: false, error: 'Choose a brew method from the list.' }
    }
    method = raw.method
  }
  let tempC: number | null = null
  if (raw.tempC !== undefined && raw.tempC !== null) {
    if (!whole(raw.tempC, 0, 100)) return { ok: false, error: 'Temperature must be a whole number from 0 to 100.' }
    tempC = raw.tempC as number
  }
  let gramsUsed: number | null = null
  if (raw.gramsUsed !== undefined && raw.gramsUsed !== null) {
    if (!whole(raw.gramsUsed, 0, 1_000)) return { ok: false, error: 'Leaf weight must be 0 to 1000 grams.' }
    gramsUsed = raw.gramsUsed as number
  }
  const notes = optText(raw.notes, MAX_SESSION_NOTES_LENGTH, 'Notes')
  if (!notes.ok) return notes

  if (!Array.isArray(raw.infusions) || raw.infusions.length < 1) {
    return { ok: false, error: 'Add at least one infusion.' }
  }
  if (raw.infusions.length > MAX_INFUSIONS_PER_SESSION) {
    return { ok: false, error: `A session holds up to ${MAX_INFUSIONS_PER_SESSION} infusions.` }
  }
  const infusions: InfusionInput[] = []
  for (const item of raw.infusions as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each infusion needs a time.' }
    if (!whole(item.seconds, MIN_INFUSION_SECONDS, MAX_INFUSION_SECONDS)) {
      return {
        ok: false,
        error: `Each infusion must last ${MIN_INFUSION_SECONDS} to ${MAX_INFUSION_SECONDS} seconds.`,
      }
    }
    let rating: number | null = null
    if (item.rating !== undefined && item.rating !== null) {
      if (!whole(item.rating, 0, 100)) return { ok: false, error: 'Infusion ratings must be 0 to 100.' }
      rating = item.rating as number
    }
    const note = optText(item.note, MAX_INFUSION_NOTE_LENGTH, 'Infusion notes')
    if (!note.ok) return note
    infusions.push({ seconds: item.seconds as number, rating, note: note.v })
  }
  return {
    ok: true,
    data: { teaId: raw.teaId as number, method, tempC, gramsUsed, notes: notes.v, infusions },
  }
}
