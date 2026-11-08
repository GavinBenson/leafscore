'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeFavorite } from '@/actions/favorites'
import { removeFromWishlist } from '@/actions/wishlist'

const GENERIC_ERROR = "That didn't save. Try again."

// Uses the dedicated remove actions (not the toggles), so a stale page or a
// double click can never re-add the tea.
export function ListRemoveButton({ teaId, list }: { teaId: number; list: 'favorites' | 'wishlist' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const label = list === 'favorites' ? 'Remove from favorites' : 'Remove from wishlist'

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ minHeight: 44 }}
        disabled={isPending}
        aria-describedby={error ? errorId : undefined}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              const result = list === 'favorites' ? await removeFavorite(teaId) : await removeFromWishlist(teaId)
              if (result.error) {
                setError(result.error)
                return
              }
              router.refresh()
            } catch {
              setError(GENERIC_ERROR)
            }
          })
        }}
      >
        {isPending ? 'Removing...' : label}
      </button>
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
