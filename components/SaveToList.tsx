'use client'

import Link from 'next/link'
import { useId, useRef, useState, useTransition } from 'react'
import { createListWithTeaAction, setTeaInListAction } from '@/actions/lists'
import { MAX_LIST_TITLE_LENGTH } from '@/lib/validation/list'

type Row = { id: number; title: string; contains: boolean; isPublic: boolean }

type Props = {
  teaId: number
  lists: Row[]
  /** The most lists this account may have (FREE_LIST_LIMIT or PREMIUM_LIST_LIMIT). */
  limit: number
  isPremium: boolean
}

// Signed-in only (the tea page decides). Nothing is optimistic: a checkbox
// changes after the server confirms, and the outcome is announced.
export function SaveToList({ teaId, lists: initial, limit, isPremium }: Props) {
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState<Row[]>(initial)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [isPending, startTransition] = useTransition()
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const atLimit = lists.length >= limit

  function toggle(row: Row, want: boolean) {
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await setTeaInListAction(row.id, teaId, want)
        if (!result.ok) {
          setError(result.message ?? "That didn't save. Try again.")
          return
        }
        setLists((current) => current.map((l) => (l.id === row.id ? { ...l, contains: want } : l)))
        setMessage(want ? `Added to ${row.title}.` : `Removed from ${row.title}.`)
      } catch {
        setError("That didn't save. Try again in a moment.")
      }
    })
  }

  function createNew(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await createListWithTeaAction(teaId, newTitle)
        if (!result.ok || !result.list) {
          setError(result.message ?? "That didn't save. Try again.")
          return
        }
        const created = result.list
        setLists((current) => [{ id: created.id, title: created.title, contains: true, isPublic: false }, ...current])
        setNewTitle('')
        setMessage(`Created ${created.title} and added this tea.`)
      } catch {
        setError("That didn't save. Try again in a moment.")
      }
    })
  }

  function close() {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-outline btn-sm"
        style={{ minHeight: 44 }}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Save to list
      </button>
      <div role="status" aria-live="polite" className="subtle" style={{ fontSize: 13, minHeight: 18 }}>
        {message}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <div
          id={`${uid}-panel`}
          className="card"
          style={{ maxWidth: 420, marginTop: 8 }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
        >
          {lists.length > 0 ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="form-label">Your lists</legend>
              {lists.map((row) => (
                <div key={row.id} className="check-label" style={{ minHeight: 44 }}>
                  <input
                    id={`${uid}-list-${row.id}`}
                    type="checkbox"
                    checked={row.contains}
                    disabled={isPending}
                    onChange={(event) => toggle(row, event.target.checked)}
                  />
                  <label htmlFor={`${uid}-list-${row.id}`}>
                    {row.title}
                    {!row.isPublic && <span className="subtle"> (private)</span>}
                  </label>
                </div>
              ))}
            </fieldset>
          ) : (
            <p className="subtle" style={{ marginTop: 0 }}>
              You have no lists yet.
            </p>
          )}

          {atLimit ? (
            <p className="subtle" style={{ marginBottom: 0 }}>
              {isPremium
                ? `You have reached the limit of ${limit} lists.`
                : `Free accounts can keep ${limit} lists.`}{' '}
              {!isPremium && <Link href="/settings/billing">Upgrade to Premium</Link>}
              {!isPremium && ' for more.'}
            </p>
          ) : (
            <form onSubmit={createNew} style={{ marginTop: 12 }}>
              <label htmlFor={`${uid}-new`} className="form-label">
                New list
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  id={`${uid}-new`}
                  type="text"
                  className="field"
                  style={{ flex: '1 1 160px' }}
                  maxLength={MAX_LIST_TITLE_LENGTH}
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Morning teas"
                  required
                />
                <button type="submit" className="btn btn-primary btn-sm" style={{ minHeight: 44 }} disabled={isPending}>
                  Create and add
                </button>
              </div>
            </form>
          )}

          <p style={{ margin: '12px 0 0' }}>
            <Link href="/lists/mine">Manage my lists</Link>
          </p>
        </div>
      )}
    </div>
  )
}
