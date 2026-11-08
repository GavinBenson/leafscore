'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { submitReport, type ReportFormState } from '@/actions/reports'
import { signInPath } from '@/lib/authRedirect'

// Mirrors REPORT_REASONS in db/schema.ts and MAX_REPORT_DETAILS_LENGTH in
// lib/data/reports.ts (not imported: they would pull the data layer into the
// client bundle). The server action validates both again.
const MAX_REPORT_DETAILS_LENGTH = 500
const REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'fake', 'other'] as const
const REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  spam: 'Spam or advertising',
  offensive: 'Offensive or abusive',
  off_topic: 'Not about this tea',
  fake: 'Fake or misleading',
  other: 'Something else',
}

const initialState: ReportFormState = {}

// Inline report form under a review. Signed-out visitors get a sign-in link.
export function ReportButton({
  reviewId,
  listId,
  signedInAs,
  returnTo,
}: {
  reviewId?: number
  /** Report a public list instead of a review (pass exactly one of the two). */
  listId?: number
  signedInAs: boolean
  returnTo: string
}) {
  const target = listId !== undefined ? 'list' : 'review'
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(submitReport, initialState)
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (open) firstRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (state.message || state.done) messageRef.current?.focus()
  }, [state])

  if (!signedInAs) {
    return (
      <Link href={signInPath(returnTo)} className="btn btn-ghost btn-sm">
        Sign in to report
      </Link>
    )
  }

  if (state.done) {
    return (
      <p ref={messageRef} tabIndex={-1} role="status" className="subtle" style={{ margin: 0 }}>
        {state.message ?? `Thanks. Moderators will take a look at this ${target}.`}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-ghost btn-sm"
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        Report
      </button>
    )
  }

  function close() {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  // Submitting through a transition rather than <form action> skips React's
  // automatic form reset, so the reason and details survive a server error.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="confirm-inline"
      role="group"
      aria-labelledby={`${uid}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
      style={{ flexDirection: 'column', alignItems: 'stretch', width: '100%' }}
    >
      {listId !== undefined ? (
        <input type="hidden" name="listId" value={listId} />
      ) : (
        <input type="hidden" name="reviewId" value={reviewId} />
      )}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend id={`${uid}-title`} className="form-label">
          Why are you reporting this {target}?
        </legend>
        {REPORT_REASONS.map((reason, index) => (
          <div key={reason} className="check-label">
            <input
              ref={index === 0 ? firstRef : undefined}
              id={`${uid}-${reason}`}
              type="radio"
              name="reason"
              value={reason}
              required
            />
            <label htmlFor={`${uid}-${reason}`}>{REASON_LABELS[reason]}</label>
          </div>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`${uid}-details`} className="form-label">
          Details (optional)
        </label>
        <textarea
          id={`${uid}-details`}
          name="details"
          className="field field-textarea"
          maxLength={MAX_REPORT_DETAILS_LENGTH}
        />
      </div>
      {state.message && (
        <p ref={messageRef} tabIndex={-1} className="form-error" role="alert">
          {state.message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-danger btn-sm" disabled={isPending}>
          {isPending ? 'Sending...' : 'Send report'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  )
}
