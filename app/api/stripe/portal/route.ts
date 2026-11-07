import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getUserById } from '@/lib/data/users'
import { db } from '@/db/client'
import { getStripe } from '@/lib/stripe'
import { signInPath } from '@/lib/authRedirect'

// Reached by a plain form post, so every outcome is a redirect, not JSON.
// 303 makes the browser follow with GET.
export async function POST(request: NextRequest) {
  const billingUrl = new URL('/settings/billing', request.url)

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.redirect(new URL(signInPath('/settings/billing'), request.url), 303)
  }

  const user = await getUserById(db, currentUser.id)
  if (!user?.stripeCustomerId) {
    return NextResponse.redirect(billingUrl, 303)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  })

  return NextResponse.redirect(session.url, 303)
}
