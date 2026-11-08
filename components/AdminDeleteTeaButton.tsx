'use client'

import { useState, useTransition } from 'react'
import { deleteTea } from '@/actions/admin'

export function AdminDeleteTeaButton({ teaId, teaName }: { teaId: number; teaName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      // On success the action redirects; it only returns when deletion is refused.
      const result = await deleteTea(teaId)
      if (result && !result.ok) setMessage(result.message)
      setConfirming(false)
    })
  }

  if (confirming) {
    return (
      <span className="confirm-inline" role="group" aria-label={`Delete ${teaName}?`}>
        <span>Delete {teaName}?</span>
        <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={confirm}>
          {pending ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setMessage(null)
          setConfirming(true)
        }}
      >
        Delete
      </button>
      {message && (
        <span role="alert" style={{ marginLeft: 8, color: 'var(--color-ink-2)' }}>
          {message}
        </span>
      )}
    </span>
  )
}
