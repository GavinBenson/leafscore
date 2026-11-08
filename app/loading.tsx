export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading...</span>
      <span className="skeleton skeleton-title" aria-hidden="true" />
      <span className="skeleton skeleton-line" aria-hidden="true" />
    </div>
  )
}
