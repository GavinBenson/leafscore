import { SUB_SCORE_FIELDS, type SubScoreField } from '@/lib/validation/review'

const LABELS: Record<SubScoreField, string> = {
  aromaScore: 'Aroma',
  flavorScore: 'Flavor',
  bodyScore: 'Body',
  aftertasteScore: 'Aftertaste',
  valueScore: 'Value',
}

type SubScoreValues = Partial<Record<SubScoreField, number | null>>

/** Rubric items present on a review, in display order. Pure, for tests. */
export function presentSubScores(review: SubScoreValues): { field: SubScoreField; label: string; value: number }[] {
  const items: { field: SubScoreField; label: string; value: number }[] = []
  for (const field of SUB_SCORE_FIELDS) {
    const value = review[field]
    if (value !== null && value !== undefined) items.push({ field, label: LABELS[field], value })
  }
  return items
}

/**
 * Optional rubric (PBI 51). Text first, so it never relies on colour; the bar
 * is decoration. These never feed the LeafScore.
 */
export function SubScores({ review }: { review: SubScoreValues }) {
  const items = presentSubScores(review)
  if (items.length === 0) return null
  return (
    <ul
      aria-label="Detailed ratings, each out of 100"
      style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', margin: '0 0 8px', padding: 0, listStyle: 'none', fontSize: 13 }}
    >
      {items.map((item) => (
        <li key={item.field}>
          <span className="subtle">{item.label}</span> <strong>{item.value}</strong>
          <span className="subtle">/100</span>
        </li>
      ))}
    </ul>
  )
}
