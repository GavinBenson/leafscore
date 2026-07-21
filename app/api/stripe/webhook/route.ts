import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { updateUserPremium } from '@/lib/data/users'
import { db } from '@/db/client'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = Number(session.metadata?.userId)
      if (userId) {
        await updateUserPremium(db, userId, {
          isPremium: true,
          stripeCustomerId: session.customer as string,
          premiumExpiresAt: undefined,
        })
      }
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      // Find user by stripe customer ID and remove premium
      const { eq } = await import('drizzle-orm')
      const { users } = await import('@/db/schema')
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
      if (user) {
        await updateUserPremium(db, user.id, {
          isPremium: false,
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
