import Link from 'next/link'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main className="status-page">
      <p className="status-code" aria-hidden="true">
        404
      </p>
      <h1 className="status-title">We couldn&apos;t find that page</h1>
      <p className="status-text">
        The tea or page you were looking for may have moved or never existed.
      </p>
      <div className="status-actions">
        <Link href="/browse" className="btn btn-primary">
          Browse teas
        </Link>
        <Link href="/" className="btn btn-outline">
          Go home
        </Link>
      </div>
    </main>
  )
}
