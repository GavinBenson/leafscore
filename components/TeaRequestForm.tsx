'use client'

import { useActionState, useEffect, useId, useRef } from 'react'
import { submitTeaRequest, type TeaRequestFormState } from '@/actions/teaRequests'
import {
  MAX_REQUEST_BRAND_LENGTH,
  MAX_REQUEST_NAME_LENGTH,
} from '@/lib/validation/teaRequest'
import { TEA_TYPES } from '@/lib/teaTypes'

const initialState: TeaRequestFormState = {}

export function TeaRequestForm({ initialName }: { initialName: string }) {
  const [state, formAction, isPending] = useActionState(submitTeaRequest, initialState)
  const uid = useId()
  const messageRef = useRef<HTMLParagraphElement>(null)
  const errors = state.fieldErrors ?? {}

  useEffect(() => {
    if (!state.message) return
    const first = (['name', 'brand', 'type'] as const).find((f) => state.fieldErrors?.[f])
    if (first) document.getElementById(`${uid}-${first}`)?.focus()
    else messageRef.current?.focus()
  }, [state, uid])

  return (
    <form action={formAction} noValidate>
      {state.message && (
        <p ref={messageRef} tabIndex={-1} className="form-error" role="alert">
          {state.message}
        </p>
      )}

      <div className="form-group">
        <label htmlFor={`${uid}-name`} className="form-label">
          Tea name
        </label>
        <input
          id={`${uid}-name`}
          name="name"
          type="text"
          className="field"
          maxLength={MAX_REQUEST_NAME_LENGTH}
          required
          defaultValue={state.values?.name ?? initialName}
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={errors.name ? `${uid}-name-error` : undefined}
        />
        {errors.name && <p id={`${uid}-name-error`} className="field-error">{errors.name}</p>}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-brand`} className="form-label">
          Brand (optional)
        </label>
        <input
          id={`${uid}-brand`}
          name="brand"
          type="text"
          className="field"
          maxLength={MAX_REQUEST_BRAND_LENGTH}
          defaultValue={state.values?.brand ?? ''}
          aria-invalid={Boolean(errors.brand) || undefined}
          aria-describedby={errors.brand ? `${uid}-brand-error` : undefined}
        />
        {errors.brand && <p id={`${uid}-brand-error`} className="field-error">{errors.brand}</p>}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-type`} className="form-label">
          Type (optional)
        </label>
        <select
          id={`${uid}-type`}
          name="type"
          className="field"
          defaultValue={state.values?.type ?? ''}
          aria-invalid={Boolean(errors.type) || undefined}
          aria-describedby={errors.type ? `${uid}-type-error` : undefined}
        >
          <option value="">-- Not sure --</option>
          {TEA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {errors.type && <p id={`${uid}-type-error`} className="field-error">{errors.type}</p>}
      </div>

      <button type="submit" className="btn btn-primary" disabled={isPending} aria-busy={isPending}>
        {isPending ? 'Sending...' : 'Send request'}
      </button>
    </form>
  )
}
