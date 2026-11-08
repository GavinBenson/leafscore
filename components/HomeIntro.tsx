import Link from 'next/link'

const steps = [
  {
    title: 'Find a tea',
    text: 'Browse the catalogue and see what the community scores out of 100.',
  },
  {
    title: 'Rate and log it',
    text: 'Score it, note how you brewed it, and tag the flavors you tasted.',
  },
  {
    title: 'Keep your journal',
    text: 'Every tasting is saved to your journal so you remember what you loved.',
  },
]

export function HomeIntro() {
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">Discover &amp; Rate Teas</h1>
        <p className="subtle hero-lead">
          Track your tea journey. See what the community rates. Find your next favorite.
        </p>
        <Link href="/browse" className="btn btn-primary">
          Browse Teas
        </Link>
      </section>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="section-title">
          How it works
        </h2>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.title} className="card">
              <span className="step-num" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-text">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
