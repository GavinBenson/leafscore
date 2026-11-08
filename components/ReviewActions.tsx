'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { removeReview, type RemoveReviewState } from '@/actions/reviews'

function ConfirmDeleteButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-danger btn-sm" disabled={pending}>
      {pending ? 'Deleting...' : 'Yes, delete'}
    </button>
  )
}

// returnTo: where to go after deleting (default: the tea page). Same-site paths only; the server re-checks.
export function ReviewActions({
  reviewId,
  teaId,
  returnTo,
}: {
  reviewId: number
  teaId: number
  returnTo?: string
}) {
  const [state, formAction] = useActionState<RemoveReviewState, FormData>(
    removeReview.bind(null, reviewId, teaId),
    {},
  )
  const [confirming, setConfirming] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Only restore focus to "Delete" after a cancel, not on first render.
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus()
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      deleteRef.current?.focus()
    }
  }, [confirming])

  function cancel() {
    restoreFocus.current = true
    setConfirming(false)
  }

  if (confirming) {
    return (
      <div
        className="review-actions"
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel()
        }}
      >
        <div className="confirm-inline" role="group" aria-labelledby={`delete-q-${reviewId}`}>
          <p id={`delete-q-${reviewId}`}>Delete this review? This cannot be undone.</p>
          <form action={formAction}>
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <ConfirmDeleteButton />
          </form>
          {state.message && (
            <p className="field-error" role="alert">
              {state.message}
            </p>
          )}
          <button type="button" ref={cancelRef} className="btn btn-ghost btn-sm" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="review-actions">
      <Link href={`/reviews/${reviewId}/edit`} className="btn btn-ghost btn-sm">
        Edit
      </Link>
      <button
        type="button"
        ref={deleteRef}
        className="btn btn-ghost btn-sm"
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    </div>
  )
}
