'use client'

import { useActionState, useEffect, useId, useRef } from 'react'
import { createListAction, updateListAction, type ListFormState } from '@/actions/lists'
import { MAX_LIST_DESCRIPTION_LENGTH, MAX_LIST_TITLE_LENGTH } from '@/lib/validation/list'

const initialState: ListFormState = {}

type Props = {
  /** Present when editing an existing list. */
  list?: { id: number; title: string; description: string; isPublic: boolean }
}

export function ListEditor({ list }: Props) {
  const [state, formAction, isPending] = useActionState(list ? updateListAction : createListAction, initialState)
  const uid = useId()
  const messageRef = useRef<HTMLParagraphElement>(null)
  const errors = state.fieldErrors ?? {}
  const values = state.values ?? {
    title: list?.title ?? '',
    description: list?.description ?? '',
    isPublic: list?.isPublic ?? false,
  }

  useEffect(() => {
    if (!state.message || state.saved) return
    const first = (['title', 'description'] as const).find((f) => state.fieldErrors?.[f])
    if (first) document.getElementById(`${uid}-${first}`)?.focus()
    else messageRef.current?.focus()
  }, [state, uid])

  return (
    <form action={formAction} noValidate style={{ maxWidth: 600 }}>
      {list && <input type="hidden" name="listId" value={list.id} />}

      <div className="form-group">
        <label htmlFor={`${uid}-title`} className="form-label">
          Title
        </label>
        <input
          id={`${uid}-title`}
          name="title"
          type="text"
          className="field"
          maxLength={MAX_LIST_TITLE_LENGTH}
          required
          // key resets the field after a save echoes new values back
          key={`t-${values.title}`}
          defaultValue={values.title}
          aria-invalid={Boolean(errors.title) || undefined}
          aria-describedby={errors.title ? `${uid}-title-error` : undefined}
        />
        {errors.title && (
          <p id={`${uid}-title-error`} className="field-error">
            {errors.title}
          </p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-description`} className="form-label">
          Description (optional)
        </label>
        <textarea
          id={`${uid}-description`}
          name="description"
          className="field field-textarea"
          maxLength={MAX_LIST_DESCRIPTION_LENGTH}
          key={`d-${values.description}`}
          defaultValue={values.description}
          aria-invalid={Boolean(errors.description) || undefined}
          aria-describedby={errors.description ? `${uid}-description-error` : undefined}
        />
        {errors.description && (
          <p id={`${uid}-description-error`} className="field-error">
            {errors.description}
          </p>
        )}
      </div>

      <div className="check-label" style={{ minHeight: 44 }}>
        <input
          id={`${uid}-public`}
          name="isPublic"
          type="checkbox"
          key={`p-${values.isPublic}`}
          defaultChecked={values.isPublic}
          aria-describedby={`${uid}-public-help`}
        />
        <label htmlFor={`${uid}-public`}>Make this list public</label>
      </div>
      <p id={`${uid}-public-help`} className="subtle" style={{ marginTop: 0 }}>
        Public lists can be seen and shared by anyone, and may be reported to moderators. Private lists are only
        visible to you.
      </p>

      <div role="status" aria-live="polite">
        {state.message && (
          <p
            ref={messageRef}
            tabIndex={-1}
            className={state.saved ? 'subtle' : 'form-error'}
            role={state.saved ? undefined : 'alert'}
          >
            {state.message}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={isPending} aria-busy={isPending}>
        {isPending ? 'Saving...' : list ? 'Save changes' : 'Create list'}
      </button>
    </form>
  )
}
