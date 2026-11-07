'use client'

import Link from 'next/link'
import { removeReview } from '@/actions/reviews'

export function ReviewActions({ reviewId, teaId }: { reviewId: number; teaId: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <Link href={`/reviews/${reviewId}/edit`} className="btn btn-ghost btn-sm">
        Edit
      </Link>
      <form
        action={removeReview.bind(null, reviewId, teaId)}
        onSubmit={(event) => {
          if (!window.confirm('Delete this review? This cannot be undone.')) {
            event.preventDefault()
          }
        }}
      >
        <button type="submit" className="btn btn-ghost btn-sm">
          Delete
        </button>
      </form>
    </div>
  )
}
