export default function BrowseLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading teas...</span>
      <div aria-hidden="true">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-filter" />
        <div className="tea-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    </div>
  )
}
