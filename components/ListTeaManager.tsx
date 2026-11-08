'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { deleteListAction, moveTeaInListAction, removeTeaFromListAction } from '@/actions/lists'

type Item = { id: number; name: string; brandName: string | null }

// Reorder with plain up/down buttons (no drag-only interaction). The page is
// refreshed from the server after each change, so the order shown is the saved one.
export function ListTeaManager({ listId, teas }: { listId: number; teas: Item[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) {
          setError(result.message ?? "That didn't save. Try again.")
          return
        }
        setMessage(done)
        router.refresh()
      } catch {
        setError("That didn't save. Try again in a moment.")
      }
    })
  }

  return (
    <section aria-labelledby="list-teas-heading" style={{ marginTop: 32 }}>
      <h2 id="list-teas-heading" className="section-title">
        Teas in this list ({teas.length})
      </h2>
      <div role="status" aria-live="polite" className="subtle" style={{ minHeight: 20 }}>
        {message}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {teas.length === 0 ? (
        <p className="subtle">
          No teas yet. Open a tea in <Link href="/browse">Browse</Link> and use Save to list.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {teas.map((tea, index) => (
            <li key={tea.id} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <Link href={`/browse/${tea.id}`} style={{ fontWeight: 600 }}>
                  {tea.name}
                </Link>
                {tea.brandName && <div className="subtle">{tea.brandName}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ minHeight: 44, minWidth: 44 }}
                  disabled={isPending || index === 0}
                  aria-label={`Move ${tea.name} up`}
                  onClick={() =>
                    run(() => moveTeaInListAction(listId, tea.id, 'up'), `Moved ${tea.name} up to position ${index}.`)
                  }
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ minHeight: 44, minWidth: 44 }}
                  disabled={isPending || index === teas.length - 1}
                  aria-label={`Move ${tea.name} down`}
                  onClick={() =>
                    run(
                      () => moveTeaInListAction(listId, tea.id, 'down'),
                      `Moved ${tea.name} down to position ${index + 2}.`,
                    )
                  }
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ minHeight: 44 }}
                  disabled={isPending}
                  aria-label={`Remove ${tea.name} from this list`}
                  onClick={() => run(() => removeTeaFromListAction(listId, tea.id), `Removed ${tea.name}.`)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Delete with an inline confirm. Escape cancels.
export function DeleteListButton({ listId, title }: { listId: number; title: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function cancel() {
    setConfirming(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          ref={triggerRef}
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 44 }}
          onClick={() => setConfirming(true)}
        >
          Delete list
        </button>
      </div>
    )
  }

  return (
    <div
      className="confirm-inline"
      role="group"
      aria-labelledby={`${uid}-q`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancel()
      }}
    >
      <p id={`${uid}-q`}>Delete &ldquo;{title}&rdquo;? This cannot be undone.</p>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        style={{ minHeight: 44 }}
        disabled={isPending}
        autoFocus
        onClick={() => {
          setError('')
          startTransition(async () => {
            try {
              const result = await deleteListAction(listId)
              if (!result.ok) {
                setError(result.message ?? "That didn't work. Try again.")
                return
              }
              router.push('/lists/mine')
              router.refresh()
            } catch {
              setError("That didn't work. Try again in a moment.")
            }
          })
        }}
      >
        {isPending ? 'Deleting...' : 'Yes, delete'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={cancel}>
        Cancel
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
