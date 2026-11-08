'use client'

import { useActionState, useState } from 'react'
import { deleteAccount, type DeleteAccountState } from '@/actions/account'
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion'

export function DeleteAccountForm({ hasSubscription }: { hasSubscription: boolean }) {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {
    status: 'idle',
  })
  const [typed, setTyped] = useState('')

  return (
    <details>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>Delete my account</summary>
      <form action={action} style={{ marginTop: 12 }}>
        <p style={{ margin: '0 0 8px' }}>
          This permanently deletes your profile, reviews, photos, favorites and wishlist
          {hasSubscription ? ' and cancels your Premium subscription immediately' : ''}. It cannot be undone.
          Consider downloading your data first.
        </p>
        <label htmlFor="delete-confirmation" style={{ display: 'block', marginBottom: 4 }}>
          Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
        </label>
        <input
          id="delete-confirmation"
          name="confirmation"
          type="text"
          className="field"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={state.status === 'error'}
          aria-describedby="delete-account-msg"
          style={{ maxWidth: 240 }}
        />
        <div id="delete-account-msg">
          {state.status === 'error' && <p className="field-error" role="alert">{state.message}</p>}
        </div>
        <button
          type="submit"
          className="btn btn-danger btn-sm"
          style={{ marginTop: 12 }}
          disabled={pending || typed.trim() !== DELETE_CONFIRMATION}
        >
          {pending ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </form>
    </details>
  )
}
