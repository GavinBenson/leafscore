import {
  brewGuideSummary,
  brewMethodLabel,
  formatSteepTime,
  hasBrewGuideData,
  type BrewGuide as BrewGuideData,
} from '@/lib/data/brewGuide'
import { formatTemperature, type TemperatureUnit } from '@/lib/units'

function reviews(n: number) {
  return `${n} ${n === 1 ? 'review' : 'reviews'}`
}

/**
 * Community brew guide (PBI 40). Read-only summary of what reviewers entered.
 * `temperatureUnit` is display only; stored data stays in Celsius.
 */
export function BrewGuide({
  guide,
  temperatureUnit = 'c',
}: {
  guide: BrewGuideData
  temperatureUnit?: TemperatureUnit
}) {
  const summary = brewGuideSummary(guide, temperatureUnit)
  const { temperature, time, method } = guide

  return (
    <section aria-labelledby="brew-guide-heading" style={{ marginBottom: 32 }}>
      <h2 id="brew-guide-heading" className="section-title" style={{ fontSize: 18 }}>
        Community brew guide
      </h2>
      {!summary || !hasBrewGuideData(guide) ? (
        <p className="subtle" style={{ margin: 0 }}>
          Not enough brew details yet
        </p>
      ) : (
        <div className="card">
          <p className="brew-guide-summary">{summary}</p>
          <dl className="fact-list" aria-label="Brew guide details">
            {temperature && (
              <>
                <dt>Temperature</dt>
                <dd>
                  {formatTemperature(temperature.median, temperatureUnit)} typical; middle half of
                  reviewers use {formatTemperature(temperature.q1, temperatureUnit)} to{' '}
                  {formatTemperature(temperature.q3, temperatureUnit)} ({reviews(temperature.count)})
                </dd>
              </>
            )}
            {time && (
              <>
                <dt>Steep time</dt>
                <dd>
                  {formatSteepTime(time.median)} typical; middle half of reviewers use{' '}
                  {formatSteepTime(time.q1)} to {formatSteepTime(time.q3)} ({reviews(time.count)})
                </dd>
              </>
            )}
            {method && (
              <>
                <dt>Method</dt>
                <dd>
                  {brewMethodLabel(method.method)}: {Math.round(method.share * 100)}% of{' '}
                  {reviews(method.total)}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}
    </section>
  )
}
