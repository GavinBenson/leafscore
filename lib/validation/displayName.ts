export const MIN_DISPLAY_NAME_LENGTH = 2
export const MAX_DISPLAY_NAME_LENGTH = 40

export type ParsedDisplayName = { ok: true; name: string } | { ok: false; error: string }

// Trimmed, 2-40 characters, no control characters (including newlines and tabs).
export function parseDisplayName(raw: unknown): ParsedDisplayName {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(name)) {
    return { ok: false, error: "Your name can't contain control characters." }
  }
  if (name.length < MIN_DISPLAY_NAME_LENGTH || name.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Your name must be ${MIN_DISPLAY_NAME_LENGTH} to ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    }
  }
  return { ok: true, name }
}

// "Tea drinker 0427": neutral default for signups that give no name, so an
// email address is never exposed as a public name.
export function neutralDisplayName(random: () => number = Math.random): string {
  const digits = String(Math.floor(random() * 10_000)).padStart(4, '0')
  return `Tea drinker ${digits}`
}
