// Single source of truth for the canonical origin. NOTE: the canonical domain
// is still an owner decision (email uses tea-ratings.com, this fallback uses
// leafscore.app). Set NEXT_PUBLIC_APP_URL in production to override.
export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const fallback =
    process.env.NODE_ENV === 'production' ? 'https://leafscore.app' : 'http://localhost:3000'
  return (fromEnv || fallback).replace(/\/+$/, '')
}
