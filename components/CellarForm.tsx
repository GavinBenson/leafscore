'use client'

import Link from 'next/link'
import { useActionState, useEffect, useId, useRef } from 'react'
import { saveCellarItemAction, type CellarFormState } from '@/actions/cellar'
import type { CellarFormValues } from '@/lib/cellar'
import { MAX_CELLAR_NOTES_LENGTH } from '@/lib/validation/cellar'
import type { WeightUnit } from '@/lib/units'

const initialState: CellarFormState = {}
const FIELDS = ['amount', 'purchasedAt', 'price', 'currency', 'lowStock', 'notes'] as const

type Props = {
  teaId?: number
  itemId?: number
  teaName: string
  unit: WeightUnit
  initial: CellarFormValues
}

export function CellarForm({ teaId, itemId, teaName, unit, initial }: Props) {
  const [state, formAction, isPending] = useActionState(saveCellarItemAction, initialState)
  const uid = useId()
  const messageRef = useRef<HTMLParagraphElement>(null)
  const errors = state.fieldErrors ?? {}
  const values = state.values ?? initial
  const unitLabel = unit === 'oz' ? 'ounces' : 'grams'

  useEffect(() => {
    if (!state.message) return
    const first = FIELDS.find((f) => state.fieldErrors?.[f])
    if (first) document.getElementById(`${uid}-${first}`)?.focus()
    else messageRef.current?.focus()
  }, [state, uid])

  function field(name: (typeof FIELDS)[number]) {
    return {
      id: `${uid}-${name}`,
      name,
      'aria-invalid': Boolean(errors[name]) || undefined,
      'aria-describedby': errors[name] ? `${uid}-${name}-error` : undefined,
    }
  }
  const err = (name: (typeof FIELDS)[number]) =>
    errors[name] ? (
      <p id={`${uid}-${name}-error`} className="field-error">
        {errors[name]}
      </p>
    ) : null

  return (
    <form action={formAction} noValidate className="card" style={{ maxWidth: 600, marginBottom: 24 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {itemId ? 'Edit' : 'Add'} {teaName}
      </h2>
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : <input type="hidden" name="teaId" value={teaId} />}

      {state.message && (
        <p ref={messageRef} tabIndex={-1} className="form-error" role="alert">
          {state.message}
        </p>
      )}

      <div className="form-group">
        <label htmlFor={`${uid}-amount`} className="form-label">
          Amount owned ({unitLabel})
        </label>
        <input
          {...field('amount')}
          key={`a-${values.amount}`}
          type="text"
          inputMode="decimal"
          className="field"
          required
          defaultValue={values.amount}
        />
        {err('amount')}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-lowStock`} className="form-label">
          Low-stock threshold ({unitLabel}, optional)
        </label>
        <input
          {...field('lowStock')}
          key={`l-${values.lowStock}`}
          type="text"
          inputMode="decimal"
          className="field"
          defaultValue={values.lowStock}
        />
        {err('lowStock')}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-purchasedAt`} className="form-label">
          Purchase date (optional)
        </label>
        <input
          {...field('purchasedAt')}
          key={`d-${values.purchasedAt}`}
          type="date"
          className="field"
          defaultValue={values.purchasedAt}
        />
        {err('purchasedAt')}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-price`} className="form-label">
          Price paid (optional)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            {...field('price')}
            key={`p-${values.price}`}
            type="text"
            inputMode="decimal"
            className="field"
            style={{ flex: '1 1 120px' }}
            defaultValue={values.price}
          />
          <div>
            <label htmlFor={`${uid}-currency`} className="subtle" style={{ display: 'block', fontSize: 12 }}>
              Currency
            </label>
            <input
              {...field('currency')}
              key={`c-${values.currency}`}
              type="text"
              className="field"
              style={{ width: 90 }}
              maxLength={3}
              autoCapitalize="characters"
              defaultValue={values.currency || 'USD'}
            />
          </div>
        </div>
        {err('price')}
        {err('currency')}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-notes`} className="form-label">
          Notes (optional)
        </label>
        <textarea
          {...field('notes')}
          key={`n-${values.notes}`}
          className="field field-textarea"
          maxLength={MAX_CELLAR_NOTES_LENGTH}
          defaultValue={values.notes}
        />
        {err('notes')}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={isPending} aria-busy={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <Link href="/cellar" className="btn btn-ghost" style={{ minHeight: 44 }}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
