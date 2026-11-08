import Link from 'next/link'

/**
 * Shown on a tea page instead of the community score, reviews, brew guide and
 * similar teas while blind tasting is on and the viewer has not reviewed yet.
 */
export function BlindTastingNotice({ teaId }: { teaId: number }) {
  return (
    <section
      aria-labelledby="blind-heading"
      className="card"
      style={{ marginBottom: 24 }}
    >
      <h2 id="blind-heading" className="section-title" style={{ fontSize: 18, marginTop: 0 }}>
        Blind tasting is on
      </h2>
      <p style={{ margin: '0 0 12px' }}>
        The community score, reviews, brew guide and similar teas are hidden so they don&apos;t
        sway your rating. Rate this tea first and everything appears as soon as you save.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href={`/log?tea=${teaId}`} className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
          Rate this tea
        </Link>
        <Link href="/settings" className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
          Turn off blind tasting
        </Link>
      </div>
    </section>
  )
}
