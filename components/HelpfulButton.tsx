'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setReviewHelpful, type HelpfulState } from '@/actions/helpful'
import { signInPath } from '@/lib/authRedirect'

const initialState: HelpfulState = {}

function label(count: number) {
  return count > 0 ? `Helpful (${count})` : 'Helpful'
}

// Vote toggle for someone else's review. Signed-out visitors get a sign-in link.
export function HelpfulButton({
  reviewId,
  count,
  helpful,
  signedIn,
  returnTo,
}: {
  reviewId: number
  count: number
  helpful: boolean
  signedIn: boolean
  returnTo: string
}) {
  const [state, formAction, isPending] = useActionState(setReviewHelpful, initialState)
  const shownCount = state.count ?? count
  const shownHelpful = state.helpful ?? helpful

  if (!signedIn) {
    return (
      <Link href={signInPath(returnTo)} className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>
        {label(count)}
        <span className="visually-hidden"> (sign in to vote)</span>
      </Link>
    )
  }

  return (
    <form action={formAction} style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="on" value={shownHelpful ? '0' : '1'} />
      <button
        type="submit"
        className={`btn btn-sm ${shownHelpful ? 'btn-primary' : 'btn-outline'}`}
        style={{ minHeight: 44 }}
        aria-pressed={shownHelpful}
        disabled={isPending}
      >
        {label(shownCount)}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {state.error ? '' : state.count !== undefined ? `${shownCount} found this helpful` : ''}
      </span>
      {state.error && (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}
