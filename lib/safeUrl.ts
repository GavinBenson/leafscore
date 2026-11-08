/** Returns the normalized URL only when it is https (or http when allowHttp); otherwise null. */
export function safeHttpUrl(value: string | null | undefined, opts: { allowHttp?: boolean } = {}): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2048) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol === 'https:' || (opts.allowHttp && u.protocol === 'http:')) return u.toString()
  } catch {
    // not a URL
  }
  return null
}
