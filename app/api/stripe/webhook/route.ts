import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { db } from '@/db/client'
import { getStripe } from '@/lib/stripe'
import { handleStripeEvent } from '@/lib/stripeWebhook'

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

  try {
    const result = await handleStripeEvent(db, event, (id) =>
      getStripe().subscriptions.retrieve(id),
    )
    return NextResponse.json({ received: true, result })
  } catch (error) {
    // A non-2xx response makes Stripe retry later.
    console.error(`Stripe webhook failed for ${event.id} (${event.type})`, error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
