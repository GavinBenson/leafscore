export const MAX_LIST_TITLE_LENGTH = 80
export const MAX_LIST_DESCRIPTION_LENGTH = 500

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
// Descriptions may span lines, so newlines and tabs are fine there.
const DESCRIPTION_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/

export type ParsedList =
  | { ok: true; title: string; description: string | null }
  | { ok: false; field: 'title' | 'description'; error: string }

// Title: trimmed, 1-80 characters, no control characters. Description: trimmed,
// at most 500, no control characters other than line breaks; blank becomes null.
export function parseListInput(raw: { title?: unknown; description?: unknown }): ParsedList {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (CONTROL_CHARS.test(title)) {
    return { ok: false, field: 'title', error: "The title can't contain control characters." }
  }
  if (title.length < 1 || title.length > MAX_LIST_TITLE_LENGTH) {
    return { ok: false, field: 'title', error: `The title must be 1 to ${MAX_LIST_TITLE_LENGTH} characters.` }
  }
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  if (DESCRIPTION_CONTROL_CHARS.test(description)) {
    return { ok: false, field: 'description', error: "The description can't contain control characters." }
  }
  if (description.length > MAX_LIST_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      field: 'description',
      error: `The description must be ${MAX_LIST_DESCRIPTION_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, title, description: description === '' ? null : description }
}
