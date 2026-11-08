'use client'

import './globals.css'

// Replaces the root layout when it fails, so it must render <html> and <body>.
// Plain <a> instead of next/link: the router may be what broke.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main className="status-page" role="alert">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <h1 className="status-title">LeafScore hit a problem</h1>
          <p className="status-text">
            Something went wrong on our side. Please try again in a moment.
          </p>
          {error.digest && <p className="subtle">Reference: {error.digest}</p>}
          <div className="status-actions">
            <button type="button" className="btn btn-primary" onClick={() => reset()}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn btn-outline">
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
