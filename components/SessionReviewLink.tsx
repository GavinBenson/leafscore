'use client'

import { useActionState } from 'react'
import { setSessionReviewLink, type SessionActionState } from '@/actions/sessions'

const initialState: SessionActionState = {}

// Link or unlink a saved session and the owner's own review of the same tea.
export function SessionReviewLink({
  sessionId,
  reviewId,
  linked,
}: {
  sessionId: number
  reviewId: number
  linked: boolean
}) {
  const [state, formAction, isPending] = useActionState(setSessionReviewLink, initialState)
  return (
    <form action={formAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="link" value={linked ? '0' : '1'} />
      <button type="submit" className="btn btn-outline btn-sm" style={{ minHeight: 44 }} disabled={isPending}>
        {linked ? 'Unlink from my review' : 'Link to my review'}
      </button>
      {state.message && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  )
}
