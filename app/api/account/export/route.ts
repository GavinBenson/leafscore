import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { exportUserData } from '@/lib/data/users'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUserAllowBanned } from '@/lib/session'

// Available to every signed-in user, free, Premium or banned: it is read-only and
// shows people their own data.
export async function GET() {
  const user = await getCurrentUserAllowBanned()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await enforceRateLimit('export-data', {
    limit: 5,
    windowSeconds: 3600,
    userId: user.id,
  })
  if (!limited.ok) {
    return NextResponse.json(
      { error: limited.message },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const data = await exportUserData(db, user.id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leafscore-my-data.json"',
      'Cache-Control': 'no-store',
    },
  })
}
