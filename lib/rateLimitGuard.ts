import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { db } from '@/db/client'
import { hitRateLimit } from '@/lib/rateLimit'

export type RateLimitGuardResult =
  | { ok: true }
  | { ok: false; message: string; retryAfterSeconds: number }

// Client IP, or null when it cannot be determined. Order:
//  1. x-vercel-forwarded-for: set by Vercel's edge, cannot be spoofed by the client.
//  2. x-real-ip: set by most reverse proxies.
//  3. first x-forwarded-for entry: on Vercel the platform overwrites this header
//     so the first entry is the real client; behind other proxies it is
//     client-controlled, which is why it is the last resort.
export async function getClientIp(): Promise<string | null> {
  try {
    const h = await headers()
    const platform = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    if (platform) return platform
    const real = h.get('x-real-ip')?.trim()
    if (real) return real
    const first = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (first) return first
  } catch {
    // headers() unavailable outside a request scope
  }
  return null
}

// When no IP can be determined every such client shares one bucket, so the
// limit is multiplied to avoid throttling unrelated users together. Per-user
// and per-email limits still apply on top.
export const UNKNOWN_IP_LIMIT_MULTIPLIER = 20

// String identifiers (emails) are hashed so the table never stores them raw.
function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export function waitMessage(seconds: number): string {
  if (seconds < 60) return `Too many requests. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 120) return `Too many requests. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`
  const hours = Math.ceil(minutes / 60)
  return `Too many requests. Please wait about ${hours} hours and try again.`
}

export async function enforceRateLimit(
  scope: string,
  opts: {
    limit: number
    windowSeconds: number
    userId?: number | string | null
    /** Also key on the client IP, so one IP cannot exhaust another client's allowance. */
    withIp?: boolean
  },
): Promise<RateLimitGuardResult> {
  try {
    let limit = opts.limit
    let who: string
    if (opts.userId != null && opts.userId !== '') {
      who = typeof opts.userId === 'string' ? `h:${hashId(opts.userId)}` : `u:${opts.userId}`
      if (opts.withIp) who += `:ip:${(await getClientIp()) ?? 'unknown'}`
    } else {
      const ip = await getClientIp()
      if (!ip) limit = opts.limit * UNKNOWN_IP_LIMIT_MULTIPLIER
      who = `ip:${ip ?? 'unknown'}`
    }
    const res = await hitRateLimit(db, `${scope}:${who}`, limit, opts.windowSeconds)
    if (res.allowed) return { ok: true }
    return { ok: false, message: waitMessage(res.retryAfterSeconds), retryAfterSeconds: res.retryAfterSeconds }
  } catch (error) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'rate limiter failed open', scope, error: String(error) }))
    return { ok: true }
  }
}
