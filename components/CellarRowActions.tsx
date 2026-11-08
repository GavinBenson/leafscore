'use client'

import Link from 'next/link'
import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addLowStockToWishlistAction, deleteCellarItemAction } from '@/actions/cellar'

type Props = { itemId: number; teaId: number; teaName: string; lowStock: boolean }

export function CellarRowActions({ itemId, teaId, teaName, lowStock }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function cancel() {
    setConfirming(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function addToWishlist() {
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await addLowStockToWishlistAction(teaId)
        if (result.ok) setMessage(result.message ?? 'Added to your wishlist.')
        else setError(result.message ?? "That didn't save. Try again.")
      } catch {
        setError("That didn't save. Try again in a moment.")
      }
    })
  }

  function remove() {
    setError('')
    startTransition(async () => {
      try {
        const result = await deleteCellarItemAction(itemId)
        if (!result.ok) {
          setError(result.message ?? "That didn't work. Try again.")
          return
        }
        router.refresh()
      } catch {
        setError("That didn't work. Try again in a moment.")
      }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={`/cellar?edit=${itemId}`}
          className="btn btn-outline btn-sm"
          style={{ minHeight: 44 }}
          aria-label={`Edit ${teaName} in your cellar`}
        >
          Edit
        </Link>
        {lowStock && (
          <button type="button" className="btn btn-outline btn-sm" style={{ minHeight: 44 }} disabled={isPending} onClick={addToWishlist}>
            Add to wishlist
          </button>
        )}
        {!confirming && (
          <button
            type="button"
            ref={triggerRef}
            className="btn btn-ghost btn-sm"
            style={{ minHeight: 44 }}
            aria-label={`Delete ${teaName} from your cellar`}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div
          className="confirm-inline"
          role="group"
          aria-labelledby={`${uid}-q`}
          style={{ marginTop: 8 }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
        >
          <p id={`${uid}-q`}>Remove {teaName} from your cellar?</p>
          <button type="button" className="btn btn-danger btn-sm" style={{ minHeight: 44 }} disabled={isPending} autoFocus onClick={remove}>
            {isPending ? 'Removing...' : 'Yes, remove'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      <div role="status" aria-live="polite" className="subtle" style={{ fontSize: 13 }}>
        {message}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
