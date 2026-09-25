// Only allow same-site relative paths as post-sign-in destinations.
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

export function signInPath(callbackUrl: string): string {
  return `/signin?${new URLSearchParams({ callbackUrl })}`
}
