'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { hasReviewForTea, saveSession, type SessionFormState } from '@/actions/sessions'
import { BrewTimer } from '@/components/BrewTimer'
import { TeaSearch } from '@/components/TeaSearch'
import { MAX_SESSION_NOTES_LENGTH } from '@/lib/validation/brewSession'

const initialState: SessionFormState = {}

const METHODS = [
  { value: 'gongfu', label: 'Gongfu' },
  { value: 'western', label: 'Western' },
  { value: 'cold_brew', label: 'Cold brew' },
  { value: 'grandpa', label: 'Grandpa' },
]

export function SessionForm({
  tea,
  hasReview,
  tempUnit,
  weightUnit,
}: {
  tea: { id: number; name: string } | null
  hasReview: boolean
  tempUnit: 'c' | 'f'
  weightUnit: 'g' | 'oz'
}) {
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const [state, formAction, isPending] = useActionState(saveSession, initialState)
  const [selectedTea, setSelectedTea] = useState(tea)
  const [reviewExists, setReviewExists] = useState(hasReview)
  const [teaError, setTeaError] = useState(false)
  const messageRef = useRef<HTMLParagraphElement>(null)
  const teaRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (state.message) messageRef.current?.focus()
  }, [state])

  function pickTea(picked: { id: number; name: string } | null) {
    setSelectedTea(picked)
    setTeaError(false)
    setReviewExists(false)
    if (picked) {
      void hasReviewForTea(picked.id).then(setReviewExists)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTea) {
      setTeaError(true)
      return
    }
    // Posting by hand keeps what was typed if the save fails (React would reset the form).
    const data = new FormData(event.currentTarget)
    startTransition(() => formAction(data))
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {state.message && (
        <p ref={messageRef} tabIndex={-1} className="form-error" role="alert">
          {state.message}
          {state.upgrade && (
            <>
              {' '}
              <Link href="/settings/billing">See Premium plans</Link>
            </>
          )}
        </p>
      )}

      <div className="form-group">
        {!selectedTea ? (
          <>
            <label htmlFor={fid('tea')} className="form-label">
              Which tea?
            </label>
            <TeaSearch
              id={fid('tea')}
              onSelect={pickTea}
              invalid={teaError}
              describedBy={teaError ? fid('tea-error') : undefined}
            />
            {teaError && (
              <p id={fid('tea-error')} className="field-error">
                Choose a tea.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="selected-tea">
              <span ref={teaRef} className="selected-tea-name">
                {selectedTea.name}
              </span>
              {!tea && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => pickTea(null)}>
                  Change
                </button>
              )}
            </div>
            <input type="hidden" name="teaId" value={selectedTea.id} />
          </>
        )}
      </div>

      <div className="form-group">
        <label htmlFor={fid('method')} className="form-label">
          Brew method (optional)
        </label>
        <select id={fid('method')} name="method" className="field" defaultValue="gongfu">
          <option value="">-- Select --</option>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor={fid('temp')} className="form-label">
          Water temperature ({tempUnit === 'f' ? '°F' : '°C'}, optional)
        </label>
        <input
          id={fid('temp')}
          name="temp"
          type="text"
          inputMode="decimal"
          className="field"
          placeholder={tempUnit === 'f' ? 'e.g. 203' : 'e.g. 95'}
        />
      </div>

      <div className="form-group">
        <label htmlFor={fid('weight')} className="form-label">
          Leaf weight ({weightUnit === 'oz' ? 'ounces' : 'grams'}, optional)
        </label>
        <input
          id={fid('weight')}
          name="weight"
          type="text"
          inputMode="decimal"
          className="field"
          placeholder={weightUnit === 'oz' ? 'e.g. 0.2' : 'e.g. 5'}
        />
      </div>

      <BrewTimer />

      <div className="form-group">
        <label htmlFor={fid('notes')} className="form-label">
          Session notes (optional)
        </label>
        <textarea
          id={fid('notes')}
          name="notes"
          className="field field-textarea"
          rows={3}
          maxLength={MAX_SESSION_NOTES_LENGTH}
        />
      </div>

      {selectedTea && reviewExists && (
        <div className="check-label" style={{ marginBottom: 16 }}>
          <input id={fid('link')} type="checkbox" name="linkReview" value="1" />
          <label htmlFor={fid('link')}>Link this session to my review of {selectedTea.name}</label>
        </div>
      )}

      <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={isPending}>
        {isPending ? 'Saving...' : 'Save session'}
      </button>
    </form>
  )
}
