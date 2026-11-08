export default function TeaLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading tea...</span>
      <div aria-hidden="true">
        <div className="row row-between">
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-badge" />
        </div>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
        <div className="review-list">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skeleton skeleton-review" />
          ))}
        </div>
      </div>
    </div>
  )
}
