'use client'

import Link from 'next/link'

// Shows a generic message only: error.message can carry server details and is
// never rendered or logged here. The digest is a safe id for matching server logs.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="status-page" role="alert">
      <h1 className="status-title">Something went wrong</h1>
      <p className="status-text">
        We hit a problem loading this page. Try again, and if it keeps happening come back in a
        little while.
      </p>
      {error.digest && <p className="subtle">Reference: {error.digest}</p>}
      <div className="status-actions">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn btn-outline">
          Go home
        </Link>
      </div>
    </main>
  )
}
