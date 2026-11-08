import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { setDigestOptIn } from '@/lib/data/digest'
import { verifyToken } from '@/lib/unsubscribeToken'

export const dynamic = 'force-dynamic'

// RFC 8058 one-click target (mail clients POST here) and the form action of the
// /unsubscribe page. GET deliberately does nothing so link scanners can't opt
// anyone out.
export async function POST(request: Request) {
  const url = new URL(request.url)
  const userId = verifyToken(url.searchParams.get('token'))
  if (userId === null) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  }
  await setDigestOptIn(db, userId, false)

  let fromPage = false
  try {
    fromPage = (await request.formData()).get('page') === '1'
  } catch {
    // mail clients send a plain List-Unsubscribe=One-Click body
  }
  if (fromPage) {
    return NextResponse.redirect(new URL('/unsubscribe?done=1', request.url), 303)
  }
  return NextResponse.json({ ok: true })
}
