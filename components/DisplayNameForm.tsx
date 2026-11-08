'use client'

import { useActionState } from 'react'
import { saveDisplayName, type DisplayNameState } from '@/actions/profile'
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/validation/displayName'

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState<DisplayNameState, FormData>(saveDisplayName, {
    status: 'idle',
  })
  const hasError = state.status === 'error'

  return (
    <form action={action} noValidate>
      <label htmlFor="display-name" style={{ fontWeight: 600, fontSize: 15, display: 'block', marginBottom: 4 }}>
        Display name
      </label>
      <p id="display-name-hint" className="subtle" style={{ margin: '0 0 8px' }}>
        Shown publicly on your reviews and profile. Don&apos;t use your email address.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id="display-name"
          name="name"
          type="text"
          className="field"
          style={{ flex: '1 1 200px', minWidth: 0 }}
          defaultValue={state.name ?? currentName}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoComplete="nickname"
          aria-invalid={hasError}
          aria-describedby={hasError ? 'display-name-hint display-name-msg' : 'display-name-hint'}
        />
        <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save name'}
        </button>
      </div>
      <div id="display-name-msg" aria-live="polite">
        {state.status === 'error' && <p className="field-error">{state.message}</p>}
        {state.status === 'saved' && (
          <p className="subtle" style={{ margin: '6px 0 0', color: 'var(--color-primary)' }}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}
