import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getUserById } from '@/lib/data/users'
import { db } from '@/db/client'
import { getStripe } from '@/lib/stripe'
import { signInPath } from '@/lib/authRedirect'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { siteUrl } from '@/lib/siteUrl'

// Reached by a plain form post, so every outcome is a redirect, not JSON.
// 303 makes the browser follow with GET.
export async function POST() {
  const billingUrl = new URL('/settings/billing', siteUrl())

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.redirect(new URL(signInPath('/settings/billing'), siteUrl()), 303)
  }

  const limited = await enforceRateLimit('stripe-portal', {
    limit: 10,
    windowSeconds: 3600,
    userId: currentUser.id,
  })
  if (!limited.ok) {
    billingUrl.searchParams.set('error', 'rate')
    return NextResponse.redirect(billingUrl, 303)
  }

  const user = await getUserById(db, currentUser.id)
  if (!user?.stripeCustomerId) {
    return NextResponse.redirect(billingUrl, 303)
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: billingUrl.toString(),
    })
    return NextResponse.redirect(session.url, 303)
  } catch (error) {
    console.error('portal session failed', error)
    billingUrl.searchParams.set('error', 'portal')
    return NextResponse.redirect(billingUrl, 303)
  }
}
