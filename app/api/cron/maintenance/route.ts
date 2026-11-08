import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { captureError, logEvent } from '@/lib/observability'
import { purgeExpiredRateLimits } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function matchesBearer(header: string | null, secret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(header.slice(7)), digest(secret))
}

// Daily housekeeping. Vercel Cron sends GET with `Authorization: Bearer
// $CRON_SECRET`. Fails closed: no secret configured means nothing runs.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    console.error('CRON_SECRET is not set; refusing to run maintenance')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 500 })
  }
  if (!matchesBearer(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rateLimitsPurged = await purgeExpiredRateLimits(db)
    const result = { rateLimitsPurged }
    logEvent('maintenance_run', result)
    return NextResponse.json(result)
  } catch (error) {
    captureError(error, { route: 'cron/maintenance' })
    return NextResponse.json({ error: 'Maintenance run failed' }, { status: 500 })
  }
}
