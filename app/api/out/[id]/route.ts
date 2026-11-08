import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { recordAffiliateClick } from '@/lib/data/affiliate'
import { parseId } from '@/lib/ids'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { safeHttpUrl } from '@/lib/safeUrl'

export const dynamic = 'force-dynamic'

// Affiliate click redirect. The destination only ever comes from the stored row
// (never from the request) and must pass the https check.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id)
  if (id === null) return new NextResponse('Not found', { status: 404 })

  const limited = await enforceRateLimit('affiliate-out', { limit: 30, windowSeconds: 60 })
  if (!limited.ok) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(limited.retryAfterSeconds) },
    })
  }

  const stored = await recordAffiliateClick(db, id)
  const target = safeHttpUrl(stored)
  if (!target) return new NextResponse('Not found', { status: 404 })

  return NextResponse.redirect(target, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
