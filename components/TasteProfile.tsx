import type { BadgeEvaluation, Passport, TasteProfileData } from '@/lib/data/tasteProfile'

function Bar({ value, max, alt }: { value: number; max: number; alt?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0
  return (
    <span className="bar-track" aria-hidden="true">
      <span className={`bar-fill${alt ? ' bar-fill-alt' : ''}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

function PassportBlock({ title, noun, passport, headingId }: { title: string; noun: string; passport: Passport; headingId: string }) {
  const tried = passport.tried.length
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 id={headingId} style={{ fontSize: 15, margin: '0 0 4px' }}>
        {title}
      </h3>
      <p className="subtle" style={{ margin: '0 0 8px' }}>
        Tried {tried} of {passport.total} {noun}
      </p>
      <div style={{ marginBottom: 8 }}>
        <Bar value={tried} max={passport.total} alt />
      </div>
      {tried > 0 && (
        <ul className="bar-list" aria-labelledby={headingId}>
          {passport.tried.map((entry) => (
            <li key={entry.name} className="bar-row">
              <span className="bar-label">{entry.name}</span>
              <Bar value={entry.count} max={passport.tried[0].count} alt />
              <span className="bar-value">
                {entry.count} {entry.count === 1 ? 'review' : 'reviews'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Badges earned and what is next. Used on the Journal and on public profiles. */
export function BadgeList({ badges, showNextUp = true }: { badges: BadgeEvaluation; showNextUp?: boolean }) {
  const items = [
    ...badges.earned,
    ...(showNextUp ? badges.nextUp : []),
  ]
  if (items.length === 0) return null
  return (
    <ul className="badge-grid">
      {items.map((b) => (
        <li key={b.id} className={`card badge-item${b.earned ? ' badge-item-earned' : ''}`}>
          <div className="badge-name">
            {b.earned && (
              <span className="badge-earned-mark" aria-hidden="true">
                {'✓ '}
              </span>
            )}
            {b.label}
          </div>
          <div className="badge-status">
            {b.earned ? 'Earned' : `${b.progress} of ${b.target}`}
            {' · '}
            {b.description}
          </div>
          {!b.earned && <Bar value={b.progress} max={b.target} />}
        </li>
      ))}
    </ul>
  )
}

/** Flavor profile, tea passport and badges, computed from the viewer's own non-hidden reviews. */
export function TasteProfile({ data }: { data: TasteProfileData }) {
  const topCount = data.flavors[0]?.count ?? 0
  return (
    <div>
      <section className="taste-section" aria-labelledby="taste-flavors">
        <h2 id="taste-flavors" className="taste-heading">
          Flavor profile
        </h2>
        {data.flavors.length === 0 ? (
          <p className="subtle">Add flavor tags to your reviews to see your favorite flavors here.</p>
        ) : (
          <ul className="bar-list">
            {data.flavors.map((f) => (
              <li key={f.name} className="bar-row">
                <span className="bar-label">{f.name}</span>
                <Bar value={f.count} max={topCount} />
                <span className="bar-value">
                  {f.count} {f.count === 1 ? 'review' : 'reviews'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="taste-section" aria-labelledby="taste-passport">
        <h2 id="taste-passport" className="taste-heading">
          Tea passport
        </h2>
        <PassportBlock title="By origin" noun="origins" passport={data.origins} headingId="passport-origins" />
        <PassportBlock title="By type" noun="tea types" passport={data.types} headingId="passport-types" />
      </section>

      <section className="taste-section" aria-labelledby="taste-badges">
        <h2 id="taste-badges" className="taste-heading">
          Badges
        </h2>
        <BadgeList badges={data.badges} />
      </section>
    </div>
  )
}
