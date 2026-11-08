'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toggleFavorite } from '@/actions/favorites'
import { toggleWishlist } from '@/actions/wishlist'
import { FREE_WISHLIST_LIMIT } from '@/lib/premium'

type Props = {
  teaId: number
  initialFavorited: boolean
  initialWishlisted: boolean
}

export function TeaListButtons({ teaId, initialFavorited, initialWishlisted }: Props) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [wishlisted, setWishlisted] = useState(initialWishlisted)
  const [limitReached, setLimitReached] = useState(false)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<void>) {
    setFailed(false)
    startTransition(async () => {
      try {
        await action()
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-pressed={favorited}
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await toggleFavorite(teaId)
              setFavorited(result.favorited)
              setNotice(result.error ?? null)
            })
          }
        >
          {favorited ? 'Favorited' : 'Add to favorites'}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-pressed={wishlisted}
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await toggleWishlist(teaId)
              setWishlisted(result.wishlisted)
              setLimitReached(result.limitReached)
              setNotice(result.error ?? null)
            })
          }
        >
          {wishlisted ? 'On your wishlist' : 'Add to wishlist'}
        </button>
      </div>
      {limitReached && (
        <p className="field-error" role="alert">
          Free accounts can keep {FREE_WISHLIST_LIMIT} teas on a wishlist.{' '}
          <Link href="/settings/billing">Upgrade to Premium</Link> for unlimited.
        </p>
      )}
      {notice && (
        <p className="field-error" role="alert">
          {notice}
        </p>
      )}
      {failed && (
        <p className="field-error" role="alert">
          That didn&apos;t save. Try again in a moment.
        </p>
      )}
    </div>
  )
}
