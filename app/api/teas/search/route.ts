import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { searchTeas } from '@/lib/data/teas'
import { captureError } from '@/lib/observability'
import { enforceRateLimit } from '@/lib/rateLimitGuard'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100)
  if (!q || q.length < 2) return NextResponse.json([])

  const limit = await enforceRateLimit('tea-search', { limit: 60, windowSeconds: 60 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.message },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  try {
    const results = await searchTeas(db, q, 10)
    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=30' } })
  } catch (error) {
    captureError(error, { route: '/api/teas/search' })
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
