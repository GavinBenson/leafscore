'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { deleteSessionAction, type SessionActionState } from '@/actions/sessions'

const initialState: SessionActionState = {}

// Delete with an inline confirmation (no browser dialog).
export function DeleteSessionButton({ sessionId }: { sessionId: number }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, isPending] = useActionState(deleteSessionAction, initialState)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (wasConfirming.current) openRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  if (!confirming) {
    return (
      <>
        <button
          ref={openRef}
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 44 }}
          onClick={() => setConfirming(true)}
        >
          Delete<span className="visually-hidden"> session</span>
        </button>
        {state.message && (
          <span className="field-error" role="alert">
            {state.message}
          </span>
        )}
      </>
    )
  }

  return (
    <form action={formAction} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <span role="alert">Delete this session? This can&apos;t be undone.</span>
      <button ref={confirmRef} type="submit" className="btn btn-danger btn-sm" style={{ minHeight: 44 }} disabled={isPending}>
        {isPending ? 'Deleting...' : 'Yes, delete'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </form>
  )
}
