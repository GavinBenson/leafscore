import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { db } from '@/db/client'
import { getStripeWebhookSecret } from '@/lib/env'
import { captureError } from '@/lib/observability'
import { getStripe } from '@/lib/stripe'
import { handleStripeEvent } from '@/lib/stripeWebhook'

export async function POST(request: NextRequest) {
  let webhookSecret: string
  let stripe: ReturnType<typeof getStripe>
  try {
    webhookSecret = getStripeWebhookSecret()
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is empty')
    stripe = getStripe()
  } catch (error) {
    // Misconfiguration: say so without details. 500 makes Stripe retry once fixed.
    captureError(error, { route: '/api/stripe/webhook', stage: 'config' })
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const result = await handleStripeEvent(db, event, (id) =>
      stripe.subscriptions.retrieve(id, { expand: ['customer'] }),
    )
    return NextResponse.json({ received: true, result })
  } catch (error) {
    // A non-2xx response (for RetryableWebhookError and any other throw) makes Stripe retry later.
    captureError(error, { route: '/api/stripe/webhook', eventId: event.id, eventType: event.type })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
