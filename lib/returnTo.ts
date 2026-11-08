import { safeCallbackUrl } from '@/lib/authRedirect'

/** A same-site path from a form field, or `fallback` when missing or unsafe. */
export function resolveReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback
  // safeCallbackUrl maps anything unsafe to '/', so an unchanged value is safe.
  return safeCallbackUrl(value) === value ? value : fallback
}
