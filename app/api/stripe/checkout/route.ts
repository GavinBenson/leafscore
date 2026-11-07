import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getStripe, PLANS } from '@/lib/stripe'
import { getUserById } from '@/lib/data/users'
import { db } from '@/db/client'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (user.isPremium) {
    return NextResponse.json({ error: 'You already have Premium' }, { status: 409 })
  }

  const { plan } = (await request.json()) as { plan: 'monthly' | 'yearly' }

  if (plan !== 'monthly' && plan !== 'yearly') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }
  const planConfig = PLANS[plan]

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Returning subscribers reuse their Stripe customer instead of getting a second one.
  const existing = await getUserById(db, user.id)

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : { customer_email: user.email }),
    metadata: {
      userId: String(user.id),
    },
    line_items: [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/settings/billing?success=true`,
    cancel_url: `${baseUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
