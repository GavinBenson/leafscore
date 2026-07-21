import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getUserById } from '@/lib/data/users'
import { db } from '@/db/client'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUserById(db, currentUser.id)
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
