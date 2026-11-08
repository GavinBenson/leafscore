'use server'

import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion'
import { signOut } from '@/lib/auth'
import { revalidateProfileCaches } from '@/lib/cache'
import { deleteUserAccount, getUserById } from '@/lib/data/users'
import { deleteReviewPhotos } from '@/lib/photos'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'
import { captureError } from '@/lib/observability'
import { getStripe } from '@/lib/stripe'

export type DeleteAccountState = { status: 'idle' | 'error'; message?: string }


// Every subscription that is not in a terminal state: paused and incomplete ones
// can still resume or complete into a billed subscription.
const TERMINAL = new Set(['canceled', 'incomplete_expired'])

const isMissing = (error: unknown) => (error as { code?: unknown } | null)?.code === 'resource_missing'

// Leaves nothing behind in Stripe: open Checkout sessions are expired (an old one
// stays completable for 24 hours), live subscriptions canceled, and the customer
// (and its email) deleted. A customer that is already gone counts as done, which
// makes a retry after a partial failure safe.
async function removeStripeCustomer(customerId: string) {
  const stripe = getStripe()
  try {
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 })
    for (const session of sessions.data) await stripe.checkout.sessions.expire(session.id)

    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    for (const subscription of subscriptions.data) {
      if (!TERMINAL.has(subscription.status)) await stripe.subscriptions.cancel(subscription.id)
    }
    await stripe.customers.del(customerId)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

// Order matters: authenticate, throttle, cancel billing, and only then delete.
// A Stripe failure aborts so nobody is left paying for an account that is gone.
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  if (String(formData.get('confirmation') ?? '').trim() !== DELETE_CONFIRMATION) {
    return { status: 'error', message: `Type ${DELETE_CONFIRMATION} in capital letters to confirm.` }
  }

  const limited = await enforceRateLimit('delete-account', {
    limit: 5,
    windowSeconds: 3600,
    userId: user.id,
  })
  if (!limited.ok) return { status: 'error', message: limited.message }

  const account = await getUserById(db, user.id)
  if (!account) redirect('/signin')

  if (account.stripeCustomerId) {
    try {
      await removeStripeCustomer(account.stripeCustomerId)
    } catch (error) {
      console.error('deleteAccount: Stripe cancellation failed', error)
      return {
        status: 'error',
        message:
          "We couldn't cancel your subscription, so your account was not deleted. Nothing has changed. Try again in a moment, or cancel under Manage Subscription first.",
      }
    }
  }

  let deleted: Awaited<ReturnType<typeof deleteUserAccount>>
  try {
    deleted = await deleteUserAccount(db, user.id)
  } catch (error) {
    console.error('deleteAccount: database delete failed', error)
    return { status: 'error', message: "We couldn't delete your account. Please try again." }
  }

  if (deleted) revalidateProfileCaches(user.id, { reviewsChanged: true })
  if (deleted) {
    const { failed } = await deleteReviewPhotos(deleted.photoUrls)
    // The rows are gone, so these URLs exist nowhere else: log them for cleanup.
    if (failed > 0) {
      captureError(new Error('Orphaned review photos after account deletion'), {
        action: 'deleteAccount',
        userId: user.id,
        orphanedPhotoUrls: deleted.photoUrls,
      })
    }
  }

  await signOut({ redirect: false })
  redirect('/goodbye')
}
